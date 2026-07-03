/* ============================================================
   chat.js — Chat UI logic + LLM API calls (OpenAI-compatible)
   ============================================================ */

const ChatManager = (() => {
    let messagesContainer;
    let inputEl;
    let sendBtn;
    let typingEl;
    let charNameEl;
    let charRoleEl;
    let clearBtn;

    let currentCharacterId = 'amiya';
    let messageHistory = [];
    let isStreaming = false;

    // Rotating chat background images
    const CHAT_BG_IMAGES = [
        'picture/fd6456b4895bb5c13918da7abb7a0927161775300.webp',
        'picture/01ed4f22fdf2f5a6cc1e830d60a87711161775300.webp',
        'picture/39e9564701cf7e7cb4479164e79f09c5161775300.webp',
        'picture/e97d410183e591815a5699c3c1e8b36e161775300.webp',
    ];
    let chatBgLayers = [];
    let chatBgImageIndex = 0;
    let chatBgActiveLayer = 0;
    let chatBgInterval = null;

    // Character definitions loaded from js/characters.js as window.ARKNIGHTS_CHARACTERS
    const CHARACTERS = window.ARKNIGHTS_CHARACTERS || {};

    /* ============================================================
       LaTeX / Math rendering with KaTeX
       Supports: $...$ inline, $$...$$ block, \(...\), \[...\]
       ============================================================ */
    function renderLatex(text) {
        if (!text) return '';

        // First, escape HTML to prevent XSS
        let html = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Protect escaped dollar signs \$ → placeholder, to avoid false matches
        html = html.replace(/\\\$/g, '%%KATEX_DOLLAR%%');

        // Render block math: $$...$$ and \[...\]
        html = html.replace(/\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]/g, (match, math1, math2) => {
            const formula = (math1 || math2).trim();
            // Restore \$ inside math formulas
            const restored = formula.replace(/%%KATEX_DOLLAR%%/g, '\\$');
            try {
                return katex.renderToString(restored, {
                    displayMode: true,
                    throwOnError: false,
                    trust: true,
                    strict: false,
                    output: 'html',
                });
            } catch (e) {
                console.warn('KaTeX block render error:', e.message);
                return `<pre class="katex-error">${match}</pre>`;
            }
        });

        // Render inline math: $...$ (single $, not $$) and \(...\)
        // Negative lookbehind for \$ — we already protected \$ so this is safe
        html = html.replace(/(?<!\$)\$([^$\n]+?)\$(?!\$)|\\\(([\s\S]*?)\\\)/g, (match, math1, math2) => {
            const formula = (math1 || math2).trim();
            // Restore \$ inside math formulas
            const restored = formula.replace(/%%KATEX_DOLLAR%%/g, '\\$');
            try {
                return katex.renderToString(restored, {
                    displayMode: false,
                    throwOnError: false,
                    trust: true,
                    strict: false,
                    output: 'html',
                });
            } catch (e) {
                console.warn('KaTeX inline render error:', e.message);
                return `<span class="katex-error">${match}</span>`;
            }
        });

        // Restore any remaining protected \$ (outside math blocks) to literal $
        html = html.replace(/%%KATEX_DOLLAR%%/g, '$');

        return html;
    }

    /* ============================================================
       TTS Play Button
       ============================================================ */
    /**
     * Translate Chinese text to Japanese using the configured LLM API
     */
    async function translateToJapanese(text) {
        const config = Storage.getApiConfig();
        const url = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
                model: config.model || 'gpt-4o',
                messages: [
                    {
                        role: 'system',
                        content: '你是一个专业翻译。将中文翻译成自然流畅的日语。只输出日语译文，不要加任何解释或括号备注。保持原文的语气和风格。'
                    },
                    { role: 'user', content: text }
                ],
                temperature: 0.3,
                max_tokens: 1024,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            let errMsg = `HTTP ${response.status}`;
            try { errMsg = JSON.parse(errText).error?.message || errMsg; } catch {}
            throw new Error('翻译失败: ' + errMsg);
        }

        const data = await response.json();
        const translated = data.choices?.[0]?.message?.content?.trim();
        if (!translated) throw new Error('翻译返回空内容');
        console.log('[TTS] 翻译:', text.slice(0, 30) + '... →', translated.slice(0, 30) + '...');
        return translated;
    }

    /**
     * Clean text for TTS: remove parenthetical content like （动作）or (emotion)
     */
    function cleanTtsText(text) {
        return text
            .replace(/[（(][^）)]*[）)]/g, '')   // 去掉中文/英文括号内容
            .replace(/\s+/g, ' ')                // 合并多余空格
            .trim();
    }

    function createTtsPlayButton(text) {
        const btn = document.createElement('button');
        btn.className = 'btn-tts-play';
        btn.title = '播放语音';
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16">
            <path d="M8 5v14l11-7z" fill="currentColor"/>
        </svg>`;

        btn.addEventListener('click', async (e) => {
            e.stopPropagation();

            // If currently playing, stop
            if (TTSManager.getIsPlaying()) {
                TTSManager.stopAll();
                btn.classList.remove('playing');
                hideTtsProgress();
                return;
            }

            // Clean text for TTS (remove action descriptions in parentheses)
            const cleanText = cleanTtsText(text);
            const lang = TTSManager.getLanguage();

            // Progress indicator below the message
            const messageEl = btn.closest('.message');
            let progressEl = null;

            function showProgress(msg) {
                if (!progressEl) {
                    progressEl = document.createElement('div');
                    progressEl.className = 'tts-progress';
                    messageEl.appendChild(progressEl);
                }
                progressEl.textContent = msg;
            }

            function hideProgress() {
                if (progressEl) { progressEl.remove(); progressEl = null; }
            }

            // Start playback
            btn.classList.add('loading');
            btn.disabled = true;
            showProgress('合成中...');

            const subtitleJp = document.getElementById('subtitle-jp');
            const subtitleCn = document.getElementById('subtitle-cn');

            try {
                let speakText = cleanText;

                // Japanese mode: translate Chinese → Japanese first
                if (lang === 'ja' && cleanText) {
                    btn.classList.remove('loading');
                    btn.classList.add('translating');
                    showProgress('翻訳中...');
                    if (subtitleJp) subtitleJp.textContent = '翻訳中...';
                    if (subtitleCn) subtitleCn.textContent = cleanText;

                    try {
                        speakText = await translateToJapanese(cleanText);
                    } catch (transErr) {
                        console.warn('[Chat] Translation failed, using original:', transErr);
                        speakText = cleanText;
                    }
                    btn.classList.remove('translating');
                    btn.classList.add('loading');
                    showProgress('合成中...');
                }

                // Update subtitle
                if (subtitleJp && subtitleCn) {
                    if (lang === 'ja') {
                        subtitleJp.textContent = speakText;
                        subtitleCn.textContent = cleanText;
                    } else {
                        subtitleJp.textContent = speakText;
                        subtitleCn.textContent = '';
                    }
                }

                showProgress('再生中...');
                await TTSManager.speak(speakText);
                hideProgress();
                btn.classList.remove('loading');
                btn.classList.add('playing');
                setTimeout(() => {
                    btn.classList.remove('playing');
                    btn.disabled = false;
                }, 500);
            } catch (err) {
                hideProgress();
                console.error('[Chat] TTS playback failed:', err);
                btn.classList.remove('loading', 'playing', 'translating');
                btn.disabled = false;
                const errMsg = err.message || '未知错误';
                if (errMsg.includes('请先') || errMsg.includes('API 凭据')) {
                    App.showToast('⚠️ ' + errMsg, 'error');
                } else {
                    App.showToast('🔊 TTS 失败: ' + errMsg, 'error');
                }
            }
        });

        // Cleanup progress on outside stop
        function hideTtsProgress() {
            const messageEl = btn.closest('.message');
            if (messageEl) {
                const p = messageEl.querySelector('.tts-progress');
                if (p) p.remove();
            }
        }

        return btn;
    }

    function init() {
        messagesContainer = document.getElementById('chat-messages');
        inputEl = document.getElementById('chat-input');
        sendBtn = document.getElementById('btn-send');
        typingEl = document.getElementById('chat-typing');
        charNameEl = document.getElementById('chat-char-name');
        charRoleEl = document.getElementById('chat-char-role');
        clearBtn = document.getElementById('btn-clear-chat');

        // Load saved character (validate it exists)
        const saved = Storage.getActiveCharacter();
        currentCharacterId = CHARACTERS[saved] ? saved : 'amiya';

        // Load history
        messageHistory = Storage.getHistory(currentCharacterId);

        // Events
        sendBtn.addEventListener('click', sendMessage);
        inputEl.addEventListener('keydown', onInputKeydown);
        inputEl.addEventListener('input', onInputDebounced);
        clearBtn.addEventListener('click', clearChat);

        // Initialize rotating background
        initChatBackground();

        // Update UI
        updateCharacterDisplay();
        renderHistory();

        // Fallback: auto-render any missed math in messages container
        if (typeof renderMathInElement !== 'undefined') {
            try {
                renderMathInElement(messagesContainer, {
                    delimiters: [
                        { left: '$$', right: '$$', display: true },
                        { left: '$', right: '$', display: false },
                        { left: '\\(', right: '\\)', display: false },
                        { left: '\\[', right: '\\]', display: true },
                    ],
                    throwOnError: false,
                    trust: true,
                    strict: false,
                });
            } catch (e) {
                console.warn('KaTeX auto-render error:', e);
            }
        }
    }

    function updateCharacterDisplay() {
        const char = CHARACTERS[currentCharacterId];
        if (!char) {
            console.warn('Character not found:', currentCharacterId);
            return;
        }
        if (charNameEl) charNameEl.textContent = char.name;
        if (charRoleEl) charRoleEl.textContent = char.role.toUpperCase();
    }

    function initChatBackground() {
        const container = document.getElementById('chat-bg');
        if (!container) return;

        // Clean up previous interval if any
        if (chatBgInterval) {
            clearInterval(chatBgInterval);
            chatBgInterval = null;
        }

        chatBgLayers = Array.from(container.querySelectorAll('.chat-bg-layer'));
        if (chatBgLayers.length < 2) return;

        // Preload images lazily
        CHAT_BG_IMAGES.forEach(src => {
            const img = new Image();
            img.src = src;
        });

        chatBgImageIndex = 0;
        chatBgActiveLayer = 0;
        chatBgLayers[chatBgActiveLayer].style.backgroundImage = `url('${CHAT_BG_IMAGES[chatBgImageIndex]}')`;
        chatBgLayers[chatBgActiveLayer].classList.add('active');

        // Cycle every 8 seconds
        chatBgInterval = setInterval(() => {
            chatBgImageIndex = (chatBgImageIndex + 1) % CHAT_BG_IMAGES.length;
            const nextLayer = 1 - chatBgActiveLayer;

            chatBgLayers[nextLayer].style.backgroundImage = `url('${CHAT_BG_IMAGES[chatBgImageIndex]}')`;
            chatBgLayers[chatBgActiveLayer].classList.remove('active');
            chatBgLayers[nextLayer].classList.add('active');

            chatBgActiveLayer = nextLayer;
        }, 8000);
    }

    function renderHistory() {
        // Clear existing messages
        messagesContainer.querySelectorAll('.message').forEach(m => m.remove());

        if (messageHistory.length === 0) {
            // Show welcome (already in DOM)
            return;
        }

        // Hide welcome
        const welcome = messagesContainer.querySelector('.chat-welcome');
        if (welcome) welcome.style.display = 'none';

        // Render messages
        messageHistory.forEach(msg => {
            appendMessageBubble(msg.role, msg.content);
        });

        scrollToBottom();
    }

    function appendMessageBubble(role, content) {
        // Hide welcome
        const welcome = messagesContainer.querySelector('.chat-welcome');
        if (welcome) welcome.style.display = 'none';

        const div = document.createElement('div');
        div.className = `message ${role === 'user' ? 'user' : 'character'}`;

        const sender = document.createElement('div');
        sender.className = 'message-sender';
        sender.textContent = role === 'user' ? 'DOCTOR // YOU' : `OPERATOR // ${CHARACTERS[currentCharacterId].name.toUpperCase()}`;

        const bubbleRow = document.createElement('div');
        bubbleRow.className = 'message-bubble-row';

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.innerHTML = renderLatex(content);

        bubbleRow.appendChild(bubble);

        // Add TTS play button for all character messages
        if (role !== 'user') {
            const playBtn = createTtsPlayButton(content);
            bubbleRow.appendChild(playBtn);
        }

        const time = document.createElement('div');
        time.className = 'message-time';
        time.textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

        div.appendChild(sender);
        div.appendChild(bubbleRow);
        div.appendChild(time);
        messagesContainer.appendChild(div);

        scrollToBottom();
    }

    function scrollToBottom() {
        requestAnimationFrame(() => {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        });
    }

    function showTyping() {
        typingEl.classList.remove('hidden');
        scrollToBottom();
    }

    function hideTyping() {
        typingEl.classList.add('hidden');
    }

    function setStreamingState(streaming) {
        isStreaming = streaming;
        sendBtn.disabled = streaming;
        inputEl.disabled = streaming;
        if (streaming) {
            sendBtn.style.opacity = '0.5';
            inputEl.style.opacity = '0.5';
        } else {
            sendBtn.style.opacity = '1';
            inputEl.style.opacity = '1';
        }
    }

    async function sendMessage() {
        if (isStreaming) return;

        const text = inputEl.value.trim();
        if (!text) return;

        // Check API config
        const config = Storage.getApiConfig();
        if (!config.apiKey) {
            App.showToast('Please configure API Key in settings first', 'error');
            return;
        }

        // Clear input
        inputEl.value = '';
        autoResizeInput();

        // Add user message
        messageHistory.push({ role: 'user', content: text });
        appendMessageBubble('user', text);
        Storage.setHistory(currentCharacterId, messageHistory);

        // Show typing
        showTyping();
        setStreamingState(true);

        // Build messages for API
        const char = CHARACTERS[currentCharacterId];
        const apiMessages = [
            { role: 'system', content: char.systemPrompt },
            ...messageHistory.slice(-20), // Last 20 messages for context
        ];

        try {
            const response = await callLLM(config, apiMessages);
            messageHistory.push({ role: 'assistant', content: response });
            appendMessageBubble('character', response);
            Storage.setHistory(currentCharacterId, messageHistory);
        } catch (e) {
            App.showToast(`API Error: ${e.message}`, 'error');
            // Remove the user message from history since we didn't get a response
            messageHistory.pop();
            Storage.setHistory(currentCharacterId, messageHistory);
        }

        hideTyping();
        setStreamingState(false);
    }

    async function callLLM(config, messages) {
        const url = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
                model: config.model || 'gpt-4o',
                messages: messages,
                stream: true,
                temperature: 0.8,
                max_tokens: 1024,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorMsg;
            try {
                const errJson = JSON.parse(errorText);
                errorMsg = errJson.error?.message || `HTTP ${response.status}`;
            } catch {
                errorMsg = `HTTP ${response.status}: ${errorText.slice(0, 100)}`;
            }
            throw new Error(errorMsg);
        }

        // Process SSE stream
        let fullContent = '';
        const bubble = createStreamingBubble();

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: ')) continue;

                const data = trimmed.slice(6);
                if (data === '[DONE]') continue;

                try {
                    const parsed = JSON.parse(data);
                    const delta = parsed.choices?.[0]?.delta?.content;
                    if (delta) {
                        fullContent += delta;
                        bubble.innerHTML = renderLatex(fullContent);
                        scrollToBottom();
                    }
                } catch {}
            }
        }

        // Remove streaming bubble (it was inside bubbleRow inside .message div)
        const messageDiv = bubble.closest('.message');
        if (messageDiv) {
            messageDiv.remove();
        }
        return fullContent || '(empty response)';
    }

    function createStreamingBubble() {
        const welcome = messagesContainer.querySelector('.chat-welcome');
        if (welcome) welcome.style.display = 'none';

        const div = document.createElement('div');
        div.className = 'message character';

        const sender = document.createElement('div');
        sender.className = 'message-sender';
        sender.textContent = `OPERATOR // ${CHARACTERS[currentCharacterId].name.toUpperCase()}`;

        const bubbleRow = document.createElement('div');
        bubbleRow.className = 'message-bubble-row';

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.innerHTML = '';

        bubbleRow.appendChild(bubble);
        div.appendChild(sender);
        div.appendChild(bubbleRow);
        messagesContainer.appendChild(div);

        scrollToBottom();
        return bubble;
    }

    function onInputKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!isStreaming) sendMessage();
        }
    }

    function autoResizeInput() {
        inputEl.style.height = 'auto';
        inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
    }

    // Debounced input handler for better performance
    let inputDebounceTimer = null;
    function onInputDebounced() {
        clearTimeout(inputDebounceTimer);
        inputDebounceTimer = setTimeout(autoResizeInput, 16); // ~60fps
    }

    function clearChat() {
        messageHistory = [];
        Storage.clearHistory(currentCharacterId);
        messagesContainer.querySelectorAll('.message').forEach(m => m.remove());

        // Show welcome back
        let welcome = messagesContainer.querySelector('.chat-welcome');
        if (!welcome) {
            welcome = document.createElement('div');
            welcome.className = 'chat-welcome';
            welcome.innerHTML = `
                <div class="welcome-line">[RHODES ISLAND COMMS - CHANNEL OPEN]</div>
                <div class="welcome-sub">Chat cleared. Start a new conversation...</div>
            `;
            messagesContainer.appendChild(welcome);
        }
        welcome.style.display = '';
    }

    function switchCharacter(characterId) {
        if (!CHARACTERS[characterId]) {
            console.warn('Cannot switch to unknown character:', characterId);
            return;
        }
        if (characterId === currentCharacterId) return;

        // Save current history
        Storage.setHistory(currentCharacterId, messageHistory);

        // Switch
        currentCharacterId = characterId;
        Storage.setActiveCharacter(characterId);

        // Load new history
        messageHistory = Storage.getHistory(characterId);

        // Update UI
        updateCharacterDisplay();
        renderHistory();
    }

    return { init, switchCharacter, sendMessage, clearChat };
})();

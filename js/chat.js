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
    let uploadedImages = [];  // File objects
    let uploadedFiles = [];   // File objects

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
    // 实时读取（characters.js 定义 + 全量干员/自定义角色运行时合并）
    function getChars() { return window.ARKNIGHTS_CHARACTERS || {}; }

    // 聊天模式：'single' 单聊 | 'group' 群聊
    let chatMode = 'single';
    let currentGroupId = null;

    /* ============================================================
       Combined message rendering: Code blocks + KaTeX math
       ============================================================ */
    function renderMessage(text) {
        if (!text) return '';

        // Step 1: Parse content into segments (text / code / science)
        var segments = CodeHighlight.parseContent(text);
        var html = '';

        for (var i = 0; i < segments.length; i++) {
            var seg = segments[i];
            if (seg.type === 'text') {
                // Apply KaTeX math rendering to text segments
                html += '<div class="msg-text">' + renderLatex(seg.content) + '</div>';
            } else if (seg.type === 'code') {
                html += renderCodeBlockHtml(seg);
            } else if (seg.type === 'science') {
                html += renderScienceBlockHtml(seg);
            }
        }

        return html;
    }

    function renderCodeBlockHtml(seg) {
        var lines = CodeHighlight.tokenize(seg.rawCode, seg.language);
        var langLabel = seg.language ? seg.language.toUpperCase() : 'CODE';
        var codeHtml = '';
        for (var i = 0; i < lines.length; i++) {
            codeHtml += '<span class="code-line">';
            if (lines[i].length === 0 || (lines[i].length === 1 && lines[i][0].text === '')) {
                codeHtml += ' ';
            } else {
                for (var j = 0; j < lines[i].length; j++) {
                    var t = lines[i][j];
                    codeHtml += '<span style="color:' + t.color + ';">' + escapeCodeHtml(t.text) + '</span>';
                }
            }
            codeHtml += '</span>';
        }
        return (
            '<div class="code-block" data-folded="false">' +
                '<div class="code-block-header">' +
                    '<span class="code-lang-label">' + langLabel + '</span>' +
                    '<div class="code-block-actions">' +
                        '<button class="code-btn code-btn-fold" onclick="CodeHighlight.toggleFold(this)" title="折叠/展开">▾</button>' +
                        '<button class="code-btn code-btn-copy" onclick="CodeHighlight.copyCode(this)" title="复制代码">📋</button>' +
                    '</div>' +
                '</div>' +
                '<div class="code-block-body"><pre>' + codeHtml + '</pre></div>' +
            '</div>'
        );
    }

    function renderScienceBlockHtml(seg) {
        var formulaHtml = '';
        var lines = seg.rawCode.split('\n');
        for (var i = 0; i < lines.length; i++) {
            formulaHtml += '<span class="science-line">';
            var lineTokens = parseFormulaLineLocal(lines[i]);
            for (var j = 0; j < lineTokens.length; j++) {
                var t = lineTokens[j];
                var cls = t.format === 'sub' ? 'science-sub' : t.format === 'sup' ? 'science-sup' : '';
                formulaHtml += '<span class="' + cls + '" style="color:' + t.color + ';">' + escapeCodeHtml(t.text) + '</span>';
            }
            formulaHtml += '</span>';
        }
        return (
            '<div class="science-block">' +
                '<div class="code-block-header">' +
                    '<span class="code-lang-label">⚗ FORMULA</span>' +
                    '<div class="code-block-actions">' +
                        '<button class="code-btn code-btn-copy" onclick="CodeHighlight.copyScience(this)" title="复制公式">📋</button>' +
                    '</div>' +
                '</div>' +
                '<div class="science-block-body"><pre>' + formulaHtml + '</pre></div>' +
            '</div>'
        );
    }

    // Local formula line parser (mirrors codeHighlight's internal logic)
    var SCIENCE_COLORS = {
        normal: '#E8E4E0', sub: '#7EC8E3', sup: '#E8A87C',
        greek: '#B5EAD7', operator: '#FFB7B2', number: '#C7CEEA', unit: '#FFDAC1',
    };
    function parseFormulaLineLocal(line) {
        var tokens = [];
        var i = 0;
        while (i < line.length) {
            if (line[i] === '^' && line[i + 1] === '{') {
                var end = line.indexOf('}', i + 2);
                if (end > i) { tokens.push({ text: line.slice(i + 2, end), color: SCIENCE_COLORS.sup, format: 'sup' }); i = end + 1; continue; }
            }
            if (line[i] === '_' && line[i + 1] === '{') {
                var end2 = line.indexOf('}', i + 2);
                if (end2 > i) { tokens.push({ text: line.slice(i + 2, end2), color: SCIENCE_COLORS.sub, format: 'sub' }); i = end2 + 1; continue; }
            }
            if (line[i] === '^' && i + 1 < line.length && line[i + 1] !== '{') {
                tokens.push({ text: line[i + 1], color: SCIENCE_COLORS.sup, format: 'sup' }); i += 2; continue;
            }
            if (line[i] === '_' && i + 1 < line.length && line[i + 1] !== '{') {
                tokens.push({ text: line[i + 1], color: SCIENCE_COLORS.sub, format: 'sub' }); i += 2; continue;
            }
            if ('→⇌±≈≠≤≥·∂∫ΣΠ√∝∞°′″Å'.indexOf(line[i]) >= 0) {
                tokens.push({ text: line[i], color: SCIENCE_COLORS.operator, format: 'normal' }); i++; continue;
            }
            var cc = line.charCodeAt(i);
            if ((cc >= 0x0391 && cc <= 0x03C9) || (cc >= 0x1F00 && cc <= 0x1FFF)) {
                tokens.push({ text: line[i], color: SCIENCE_COLORS.greek, format: 'normal' }); i++; continue;
            }
            if (/[0-9]/.test(line[i])) {
                var ns = i;
                while (i < line.length && /[0-9.]/.test(line[i])) i++;
                tokens.push({ text: line.slice(ns, i), color: SCIENCE_COLORS.number, format: 'normal' }); continue;
            }
            var ns2 = i;
            while (i < line.length && line[i] !== '^' && line[i] !== '_' && !/[0-9]/.test(line[i]) &&
                   '→⇌±≈≠≤≥·∂∫ΣΠ√∝∞°′″Å'.indexOf(line[i]) < 0 &&
                   !((line.charCodeAt(i) >= 0x0391 && line.charCodeAt(i) <= 0x03C9) ||
                     (line.charCodeAt(i) >= 0x1F00 && line.charCodeAt(i) <= 0x1FFF))) { i++; }
            if (i > ns2) tokens.push({ text: line.slice(ns2, i), color: SCIENCE_COLORS.normal, format: 'normal' });
        }
        return tokens.length > 0 ? tokens : [{ text: ' ', color: SCIENCE_COLORS.normal, format: 'normal' }];
    }

    function escapeCodeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

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
            // 去掉 Markdown 代码块 (``` ... ```)
            .replace(/```[\s\S]*?```/g, '')
            // 去掉行内代码 (`...`)
            .replace(/`([^`]+)`/g, '$1')
            // 去掉 LaTeX 数学公式 ($$...$$, $...$, \(...\), \[...\])
            .replace(/\$\$[\s\S]*?\$\$/g, '')
            .replace(/\$([^$]+)\$/g, '$1')
            .replace(/\\\([\s\S]*?\\\)/g, '')
            .replace(/\\\[[\s\S]*?\\\]/g, '')
            // 去掉 LaTeX 命令残余 (\frac, \sqrt, \int, \sum 等)
            .replace(/\\[a-zA-Z]+(\{[^}]*\})*/g, '')
            // 去掉反斜杠残余
            .replace(/\\/g, '')
            // 去掉中文/英文括号内容（动作描述）
            .replace(/[（(][^）)]*[）)]/g, '')
            // 去掉 Markdown 格式标记
            .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
            .replace(/_{1,3}([^_]+)_{1,3}/g, '$1')
            .replace(/#{1,6}\s*/g, '')
            .replace(/~~([^~]+)~~/g, '$1')
            // 去掉 URL
            .replace(/https?:\/\/\S+/g, '链接')
            // 合并多余空白
            .replace(/\s+/g, ' ')
            .trim();
    }

    function createTtsPlayButton(text, characterId) {
        const ttsCharId = characterId || currentCharacterId;
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
                await TTSManager.speak(speakText, ttsCharId);
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

    /* ============================================================
       File upload handling
       ============================================================ */
    const MAX_IMAGES = 3;
    const MAX_FILES = 5;

    function onFilesSelected(e) {
        var files = Array.from(e.target.files);
        if (files.length === 0) return;

        // Split into images and documents
        var images = files.filter(function (f) { return f.type.startsWith('image/'); });
        var docs = files.filter(function (f) { return !f.type.startsWith('image/'); });

        var totalImages = uploadedImages.length + images.length;
        var totalDocs = uploadedFiles.length + docs.length;

        if (totalImages > MAX_IMAGES) {
            App.showToast('最多上传 ' + MAX_IMAGES + ' 张图片', 'error');
            e.target.value = '';
            return;
        }
        if (totalImages + totalDocs > MAX_FILES) {
            App.showToast('最多上传 ' + MAX_FILES + ' 个附件', 'error');
            e.target.value = '';
            return;
        }

        uploadedImages = uploadedImages.concat(images);
        uploadedFiles = uploadedFiles.concat(docs);
        renderAttachmentPreviews();
        e.target.value = ''; // Reset so same file can be re-selected
    }

    function renderAttachmentPreviews() {
        var previewContainer = document.getElementById('attachment-preview');
        var imageList = document.getElementById('image-preview-list');
        var fileList = document.getElementById('file-preview-list');
        if (!previewContainer || !imageList || !fileList) return;

        var hasAttachments = uploadedImages.length > 0 || uploadedFiles.length > 0;
        previewContainer.style.display = hasAttachments ? 'block' : 'none';

        // Image previews
        imageList.innerHTML = '';
        uploadedImages.forEach(function (file, index) {
            var url = URL.createObjectURL(file);
            var item = document.createElement('div');
            item.className = 'attach-preview-item';
            item.innerHTML = '<img src="' + url + '" alt="preview">' +
                '<button class="attach-remove-btn" onclick="ChatManager.removeImage(' + index + ')" title="移除">×</button>';
            imageList.appendChild(item);
        });

        // File previews
        fileList.innerHTML = '';
        uploadedFiles.forEach(function (file, index) {
            var item = document.createElement('div');
            item.className = 'attach-file-item';
            var icon = getFileIcon(file.name);
            item.innerHTML = '<span class="attach-file-icon">' + icon + '</span>' +
                '<span class="attach-file-name">' + escapeHtml(file.name) + '</span>' +
                '<button class="attach-remove-btn" onclick="ChatManager.removeFile(' + index + ')" title="移除">×</button>';
            fileList.appendChild(item);
        });
    }

    function getFileIcon(name) {
        var ext = (name || '').split('.').pop().toLowerCase();
        var map = { docx: '📄', xlsx: '📊', xls: '📊', txt: '📝', md: '📝', csv: '📊', json: '📋', pdf: '📕', py: '🐍', js: '📜', c: '⚙️', cpp: '⚙️', h: '⚙️', java: '☕', html: '🌐', css: '🎨' };
        return map[ext] || '📎';
    }

    function clearAttachments() {
        // Revoke object URLs
        var previewItems = document.querySelectorAll('.attach-preview-item img');
        previewItems.forEach(function (img) { URL.revokeObjectURL(img.src); });
        uploadedImages = [];
        uploadedFiles = [];
        renderAttachmentPreviews();
    }

    // Make these accessible via global ChatManager for onclick handlers
    function removeImage(index) {
        uploadedImages.splice(index, 1);
        renderAttachmentPreviews();
    }

    function removeFile(index) {
        uploadedFiles.splice(index, 1);
        renderAttachmentPreviews();
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
        currentCharacterId = getChars()[saved] ? saved : 'amiya';

        // Load history
        messageHistory = Storage.getHistory(currentCharacterId);

        // Events
        sendBtn.addEventListener('click', sendMessage);
        inputEl.addEventListener('keydown', onInputKeydown);
        inputEl.addEventListener('input', onInputDebounced);
        inputEl.addEventListener('input', onInputGroup);
        clearBtn.addEventListener('click', clearChat);

        // 群聊：返回单聊按钮
        const btnGroupBack = document.getElementById('btn-group-back');
        if (btnGroupBack) btnGroupBack.addEventListener('click', exitGroup);

        // 点击输入区外关闭 @ 选择器
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.at-picker') && !e.target.closest('#chat-input') && !e.target.closest('.member-chip')) {
                GroupChat.closeAtPicker();
            }
        });

        // 视频任务状态变化 → 原地刷新消息内卡片
        if (typeof SeedanceVideo !== 'undefined' && SeedanceVideo.onChange) {
            SeedanceVideo.onChange(function (taskId) {
                const card = messagesContainer.querySelector('.seedance-card[data-task-id="' + taskId + '"]');
                if (card) {
                    const msgEl = card.closest('.message');
                    if (msgEl) SeedanceVideo.renderCard(msgEl, taskId);
                }
            });
        }

        // File upload events
        const btnAttach = document.getElementById('btn-attach');
        const fileInput = document.getElementById('file-input');
        if (btnAttach && fileInput) {
            btnAttach.addEventListener('click', function () { fileInput.click(); });
            fileInput.addEventListener('change', onFilesSelected);
        }

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
        const char = getChars()[currentCharacterId];
        if (!char) {
            console.warn('Character not found:', currentCharacterId);
            return;
        }
        if (charNameEl) charNameEl.textContent = char.name;
        if (charRoleEl) charRoleEl.textContent = char.role.toUpperCase();
    }

    /* ============================================================
       群聊模式 UI（进入/退出/成员条/头部显示）
       ============================================================ */
    function updateGroupDisplay() {
        const isGroup = chatMode === 'group';
        const backBtn = document.getElementById('btn-group-back');
        const strip = document.getElementById('group-member-strip');
        const container = document.getElementById('chat-container');
        if (backBtn) backBtn.hidden = !isGroup;
        if (strip) strip.classList.toggle('hidden', !isGroup);
        if (container) container.classList.toggle('group-mode', isGroup);
        if (isGroup) {
            const group = GroupChat.getGroup(currentGroupId);
            if (charNameEl) charNameEl.textContent = group ? group.name : '群聊';
            if (charRoleEl) charRoleEl.textContent = (group ? group.memberIds.length : 0) + ' 位成员';
        } else {
            updateCharacterDisplay();
        }
    }

    function renderMemberStrip() {
        const strip = document.getElementById('group-member-strip');
        if (!strip) return;
        strip.innerHTML = '';
        const members = GroupChat.getMembers(currentGroupId);
        members.forEach(m => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'member-chip';
            chip.title = '提及 ' + m.name;
            const img = m.image;
            chip.innerHTML =
                '<span class="member-chip-avatar"' + (img ? ' style="background-image:url(\'' + img + '\')"' : '') + '>' +
                (img ? '' : escapeHtml(m.name.slice(0, 1))) + '</span>' +
                '<span class="member-chip-name">' + escapeHtml(m.name) + '</span>';
            chip.addEventListener('click', () => {
                insertMention(m.name);
            });
            strip.appendChild(chip);
        });
    }

    function insertMention(name) {
        const text = inputEl.value;
        const lastAt = text.lastIndexOf('@');
        const before = lastAt >= 0 ? text.slice(0, lastAt) : text;
        inputEl.value = before + '@' + name + ' ';
        inputEl.focus();
        GroupChat.closeAtPicker();
        autoResizeInput();
    }

    /** 进入群聊 */
    function enterGroup(groupId) {
        const group = GroupChat.getGroup(groupId);
        if (!group) return;
        // 保存当前单聊历史
        Storage.setHistory(currentCharacterId, messageHistory);
        chatMode = 'group';
        currentGroupId = groupId;
        GroupChat.currentGroupId = groupId;
        GroupChat.touchGroup(groupId);
        // 加载群历史
        messageHistory = GroupChat.getHistory(groupId);
        // UI
        updateGroupDisplay();
        renderHistory();
        renderMemberStrip();
    }

    /** 退出群聊，回到单聊 */
    function exitGroup() {
        if (chatMode !== 'group') return;
        GroupChat.setHistory(currentGroupId, messageHistory);
        chatMode = 'single';
        currentGroupId = null;
        GroupChat.currentGroupId = null;
        messageHistory = Storage.getHistory(currentCharacterId);
        updateGroupDisplay();
        renderHistory();
        GroupChat.closeAtPicker();
    }

    /** 当前群模式状态：返回群 id 或 null */
    function getGroupMode() {
        return chatMode === 'group' ? currentGroupId : null;
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
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

        // 生效图片列表：用户自定义背景优先，否则内置轮播
        let imgs = null;
        if (typeof ChatBackground !== 'undefined' && ChatBackground.getEffectiveUrls) {
            imgs = ChatBackground.getEffectiveUrls();
        }
        if (!imgs || imgs.length === 0) imgs = CHAT_BG_IMAGES;

        // Preload first two images lazily
        imgs.slice(0, 2).forEach(src => {
            const img = new Image();
            img.src = src;
        });

        chatBgImageIndex = 0;
        chatBgActiveLayer = 0;
        chatBgLayers[chatBgActiveLayer].style.backgroundImage = `url('${imgs[chatBgImageIndex]}')`;
        chatBgLayers[chatBgActiveLayer].classList.add('active');

        // Cycle every 8 seconds
        chatBgInterval = setInterval(() => {
            chatBgImageIndex = (chatBgImageIndex + 1) % imgs.length;
            const nextLayer = 1 - chatBgActiveLayer;

            chatBgLayers[nextLayer].style.backgroundImage = `url('${imgs[chatBgImageIndex]}')`;
            chatBgLayers[chatBgActiveLayer].classList.remove('active');
            chatBgLayers[nextLayer].classList.add('active');

            chatBgActiveLayer = nextLayer;
        }, 8000);
    }

    /** 背景设置变更后重载轮播 */
    function reloadBackground() {
        initChatBackground();
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
        const isGroup = chatMode === 'group';
        messageHistory.forEach(msg => {
            if (isGroup) {
                appendMessageBubble(msg.role, msg.content, {
                    isGroup: true,
                    speakerId: msg.characterId || null,
                    msgId: msg.id || null,
                });
            } else {
                appendMessageBubble(msg.role, msg.content, { msgId: msg.id || null });
            }
        });

        scrollToBottom();
    }

    function appendMessageBubble(role, content, opts) {
        opts = opts || {};
        // Hide welcome
        const welcome = messagesContainer.querySelector('.chat-welcome');
        if (welcome) welcome.style.display = 'none';

        const div = document.createElement('div');
        div.className = `message ${role === 'user' ? 'user' : 'character'}`;
        if (opts.isGroup) div.classList.add('group');
        if (opts.msgId) div.dataset.msgId = opts.msgId;

        const sender = document.createElement('div');
        sender.className = 'message-sender';
        let senderText;
        if (opts.senderLabel) {
            senderText = opts.senderLabel;
        } else if (opts.isGroup) {
            const spName = opts.speakerId ? getChars()[opts.speakerId]?.name || GroupChat.getCharName(opts.speakerId) : '群聊成员';
            senderText = role === 'user'
                ? 'DOCTOR // ' + (typeof UserProfile !== 'undefined' ? UserProfile.getNickname().toUpperCase() : '博士')
                : 'OPERATOR // ' + spName.toUpperCase();
        } else {
            const c = getChars()[currentCharacterId];
            senderText = role === 'user' ? 'DOCTOR // YOU' : 'OPERATOR // ' + ((c && c.name) || '').toUpperCase();
        }
        sender.textContent = senderText;

        // 群聊成员消息：发送人前挂头像
        if (opts.isGroup && role !== 'user' && opts.speakerId) {
            const imgUrl = GroupChat.resolvePortrait(opts.speakerId);
            if (imgUrl) {
                sender.innerHTML = '<span class="msg-sender-avatar" style="background-image:url(\'' + imgUrl + '\')"></span>' + escapeHtml(senderText);
            }
        }

        const bubbleRow = document.createElement('div');
        bubbleRow.className = 'message-bubble-row';

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.innerHTML = renderMessage(content);

        bubbleRow.appendChild(bubble);

        // Add TTS play button for characters with TTS voice support
        const ttsCharId = opts.isGroup ? opts.speakerId : currentCharacterId;
        if (role !== 'user' && ttsCharId && TTSManager.hasCharacterVoice(ttsCharId)) {
            const playBtn = createTtsPlayButton(content, ttsCharId);
            bubbleRow.appendChild(playBtn);
        }

        // 单聊助手消息：手动生成视频按钮（群聊不触发视频）
        if (!opts.isGroup && role !== 'user' &&
            typeof SeedanceVideo !== 'undefined' && SeedanceVideo.hasConfig && SeedanceVideo.hasConfig()) {
            const videoBtn = document.createElement('button');
            videoBtn.className = 'btn-msg-video';
            videoBtn.title = '生成视频 (Seedance)';
            videoBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" fill="currentColor"/></svg>';
            videoBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                handleManualVideo(currentCharacterId, content, opts.msgId);
            });
            bubbleRow.appendChild(videoBtn);
        }

        const time = document.createElement('div');
        time.className = 'message-time';
        time.textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

        div.appendChild(sender);
        div.appendChild(bubbleRow);
        div.appendChild(time);
        messagesContainer.appendChild(div);

        // 历史渲染时恢复视频卡片
        if (!opts.isGroup && opts.msgId && typeof SeedanceVideo !== 'undefined') {
            attachVideoCardIfAny(div, opts.msgId);
        }

        scrollToBottom();
        return div;
    }

    /* ============================================================
       视频生成钩子（单聊）
       ============================================================ */
    /** 渲染某条消息已关联的视频任务卡片 */
    function attachVideoCardIfAny(msgEl, msgId) {
        if (!msgId || typeof SeedanceVideo === 'undefined') return;
        const task = SeedanceVideo.findTaskByMessage(msgId);
        if (task) SeedanceVideo.renderCard(msgEl, task.id);
    }

    /** 查找某条助手消息对应的用户发言文本 */
    function findUserTextFor(assistantMsgId) {
        if (!assistantMsgId) return '';
        const idx = messageHistory.findIndex(m => m.id === assistantMsgId);
        if (idx < 0) {
            for (let i = messageHistory.length - 1; i >= 0; i--) {
                if (messageHistory[i].role === 'user') return messageHistory[i].content || '';
            }
            return '';
        }
        for (let i = idx - 1; i >= 0; i--) {
            if (messageHistory[i].role === 'user') return messageHistory[i].content || '';
        }
        return '';
    }

    /** 手动触发视频生成 */
    async function handleManualVideo(charId, assistantText, msgId) {
        if (typeof SeedanceVideo === 'undefined') return;
        if (!SeedanceVideo.hasConfig()) {
            App.showToast('请先在设置中配置 Seedance 视频服务', 'error');
            return;
        }
        const userText = findUserTextFor(msgId);
        const context = messageHistory.slice(-8).map(m => ({ role: m.role, content: m.content }));
        try {
            const task = await SeedanceVideo.triggerManual(charId, userText, assistantText, msgId, 'single:' + charId, context);
            const msgEl = msgId ? messagesContainer.querySelector('.message[data-msg-id="' + msgId + '"]') : null;
            if (msgEl) SeedanceVideo.renderCard(msgEl, task.id);
            App.showToast('🎬 视频生成任务已创建', 'success');
        } catch (e) {
            App.showToast('视频生成失败: ' + (e && e.message ? e.message : e), 'error');
        }
    }

    /** 自动视频：回复完成后按开关触发 */
    function maybeAutoVideo(charId, userText, assistantText, assistantMsgId, msgEl, context) {
        try {
            if (chatMode === 'group') return;
            if (typeof SeedanceVideo === 'undefined' || !SeedanceVideo.hasConfig) return;
            const cfg = SeedanceVideo.getConfig();
            if (!cfg.autoEnabled) return;
            if (!SeedanceVideo.hasConfig()) return;
            SeedanceVideo.triggerAuto(charId, userText, assistantText, assistantMsgId, 'single:' + charId, context)
                .then(task => {
                    if (task && msgEl) SeedanceVideo.renderCard(msgEl, task.id);
                })
                .catch(err => console.warn('[Video] 自动视频触发失败', err));
        } catch (e) {
            console.warn('[Video] 自动视频异常', e);
        }
    }

    function scrollToBottom() {
        requestAnimationFrame(() => {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        });
    }

    function showTyping(label) {
        const labelEl = document.getElementById('chat-typing-label');
        if (labelEl) labelEl.textContent = label || '';
        typingEl.classList.remove('hidden');
        scrollToBottom();
    }

    function hideTyping() {
        const labelEl = document.getElementById('chat-typing-label');
        if (labelEl) labelEl.textContent = '';
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

        // 群聊模式走群聊发送链路
        if (chatMode === 'group') {
            return sendGroupMessage();
        }

        var text = inputEl.value.trim();
        var imageFiles = uploadedImages.slice();
        var docFiles = uploadedFiles.slice();

        // Nothing to send
        if (!text && imageFiles.length === 0 && docFiles.length === 0) return;

        // Check API config
        var config = Storage.getApiConfig();
        if (!config.apiKey) {
            App.showToast('Please configure API Key in settings first', 'error');
            return;
        }

        // Clear input and attachments
        inputEl.value = '';
        autoResizeInput();
        var displayImages = uploadedImages.slice();
        var displayFiles = uploadedFiles.slice();
        clearAttachments();

        // Process media (images + files) before sending
        var displayText = text;
        var processedContent;
        try {
            var result = await MediaHandler.processMedia(text, imageFiles, docFiles, config);
            processedContent = result.content;
            displayImages = result.displayImages;
            displayFiles = result.displayFiles;
            if (!displayText) {
                if (imageFiles.length > 0 && docFiles.length === 0) displayText = '[图片]';
                else if (docFiles.length > 0 && imageFiles.length === 0) displayText = '[文件]';
                else if (imageFiles.length > 0 && docFiles.length > 0) displayText = '[图片+文件]';
            }
        } catch (err) {
            console.error('Media processing failed:', err);
            App.showToast('附件处理失败: ' + err.message, 'error');
            return;
        }

        // Add user message to history
        var userMsg = { id: 'm_' + Date.now() + '_' + Math.floor(Math.random() * 1000), role: 'user', content: displayText };
        if (displayImages.length > 0) userMsg.images = displayImages;
        if (displayFiles.length > 0) userMsg.files = displayFiles.map(function (f) { return f.name; });
        messageHistory.push(userMsg);
        appendMessageBubbleWithAttachments('user', displayText, displayImages, displayFiles, { msgId: userMsg.id });
        Storage.setHistory(currentCharacterId, messageHistory);

        // Show typing
        showTyping();
        setStreamingState(true);

        // Build messages for API - use processed content for the last user message
        var char = getChars()[currentCharacterId];
        var historyMsgs = messageHistory.slice(-20).map(function (msg) {
            return { role: msg.role, content: msg.content };
        });
        // Replace last user message's content with the processed version (which may include multimodal content or OCR text)
        if (historyMsgs.length > 0 && historyMsgs[historyMsgs.length - 1].role === 'user') {
            historyMsgs[historyMsgs.length - 1].content = processedContent;
        }
        var userDirective = (typeof UserProfile !== 'undefined' && UserProfile.getDirectiveText) ? UserProfile.getDirectiveText() : '';
        var apiMessages = [
            { role: 'system', content: (char ? char.systemPrompt : '') + userDirective },
        ].concat(historyMsgs);

        try {
            var response = await callLLM(config, apiMessages);
            var assistantId = 'm_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
            messageHistory.push({ id: assistantId, role: 'assistant', content: response });
            var msgEl = appendMessageBubble('character', response, { msgId: assistantId });
            Storage.setHistory(currentCharacterId, messageHistory);
            // 自动视频生成（按设置开关）
            maybeAutoVideo(currentCharacterId, displayText, response, assistantId, msgEl,
                messageHistory.slice(-10).filter(m => m.id !== assistantId && m.id !== userMsg.id).map(m => ({ role: m.role, content: m.content })));
        } catch (e) {
            App.showToast('API Error: ' + e.message, 'error');
            messageHistory.pop();
            Storage.setHistory(currentCharacterId, messageHistory);
        }

        hideTyping();
        setStreamingState(false);
    }

    /* ============================================================
       群聊发送：多位成员串行流式回复（移植安卓 GroupChatViewModel.sendMessage）
       ============================================================ */
    async function sendGroupMessage() {
        if (isStreaming) return;
        const group = GroupChat.getGroup(currentGroupId);
        if (!group) return;

        const text = inputEl.value.trim();
        const imageFiles = uploadedImages.slice();
        const docFiles = uploadedFiles.slice();

        if (!text && imageFiles.length === 0 && docFiles.length === 0) return;

        const config = Storage.getApiConfig();
        if (!config.apiKey) {
            App.showToast('Please configure API Key in settings first', 'error');
            return;
        }

        const members = GroupChat.getMembers(currentGroupId);
        if (members.length < GroupChat.MIN_MEMBERS) {
            App.showToast('群成员不足，无法发起群聊', 'error');
            return;
        }

        // 清空输入与附件
        inputEl.value = '';
        autoResizeInput();
        const displayImages = uploadedImages.slice();
        const displayFiles = uploadedFiles.slice();
        clearAttachments();
        GroupChat.closeAtPicker();

        // 附件处理（复用单聊链路）
        let displayText = text;
        let processedContent;
        try {
            const result = await MediaHandler.processMedia(text, imageFiles, docFiles, config);
            processedContent = result.content;
            if (!displayText) {
                if (imageFiles.length > 0 && docFiles.length === 0) displayText = '[图片]';
                else if (docFiles.length > 0 && imageFiles.length === 0) displayText = '[文件]';
                else if (imageFiles.length > 0 && docFiles.length > 0) displayText = '[图片+文件]';
            }
        } catch (err) {
            App.showToast('附件处理失败: ' + err.message, 'error');
            return;
        }

        // 用户消息入库 + 渲染
        const userMsg = {
            id: 'm_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            role: 'user',
            content: displayText,
            characterId: null,
            ts: Date.now(),
        };
        if (displayImages.length > 0) userMsg.images = displayImages;
        if (displayFiles.length > 0) userMsg.files = displayFiles.map(f => f.name);
        let history = GroupChat.getHistory(currentGroupId);
        history.push(userMsg);
        GroupChat.setHistory(currentGroupId, history);
        GroupChat.touchGroup(currentGroupId);
        appendMessageBubbleWithAttachments('user', displayText, displayImages, displayFiles, { isGroup: true, msgId: userMsg.id });

        // @ 解析 + 发言人挑选
        const names = members.map(m => m.name);
        const mentionedNames = GroupChat.extractMentions(text, names);
        const mentionedIds = mentionedNames
            .map(n => members.find(m => m.name === n))
            .filter(Boolean)
            .map(m => m.id);
        const count = GroupChat.randomReplyCount(members.length, mentionedIds.length);
        const speakerIds = GroupChat.pickRandom(group.memberIds, mentionedIds, count);
        const userDirective = (typeof UserProfile !== 'undefined' && UserProfile.getDirectiveText) ? UserProfile.getDirectiveText() : '';

        showTyping('等待回应...');
        setStreamingState(true);

        let repliesOk = 0;
        for (const sid of speakerIds) {
            const speaker = members.find(m => m.id === sid);
            if (!speaker) continue;
            const targeted = mentionedIds.includes(sid);

            showTyping(speaker.name + ' 正在输入...');
            const bubble = createStreamingBubble('', sid);
            try {
                const apiMessages = GroupChat.buildApiMessages(members, speaker, history, {
                    targeted: targeted,
                    userDirective: userDirective,
                });
                const response = await callLLM(config, apiMessages, bubble);
                const clean = GroupChat.stripSpeakerPrefix(response, names);
                // 流式气泡定稿
                const sender = bubble.closest('.message').querySelector('.message-sender');
                if (sender && !sender.dataset.finalized) {
                    const imgUrl = GroupChat.resolvePortrait(sid);
                    sender.innerHTML = '<span class="msg-sender-avatar" style="background-image:url(\'' + imgUrl + '\')"></span>OPERATOR // ' + escapeHtml(speaker.name.toUpperCase());
                    sender.dataset.finalized = '1';
                }
                bubble.innerHTML = renderMessage(clean);

                const msg = {
                    id: 'm_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                    role: 'assistant',
                    content: clean,
                    characterId: sid,
                    ts: Date.now(),
                };
                history.push(msg);
                GroupChat.setHistory(currentGroupId, history);
                repliesOk++;
            } catch (e) {
                // 移除未完成的流式气泡
                const msgDiv = bubble.closest('.message');
                if (msgDiv) msgDiv.remove();
                if (repliesOk === 0) {
                    // 全部失败：回滚用户消息 + 恢复输入
                    history.pop();
                    GroupChat.setHistory(currentGroupId, history);
                    inputEl.value = text;
                    autoResizeInput();
                    App.showToast('群聊失败: ' + e.message, 'error');
                } else {
                    App.showToast('部分成员回复失败: ' + e.message, 'error');
                }
                break;
            }
        }

        hideTyping();
        setStreamingState(false);
        GroupChat.renderGroupList();
    }

    // Render user message with attachment previews
    function appendMessageBubbleWithAttachments(role, content, images, files, opts) {
        opts = opts || {};
        var welcome = messagesContainer.querySelector('.chat-welcome');
        if (welcome) welcome.style.display = 'none';

        var div = document.createElement('div');
        div.className = 'message ' + (role === 'user' ? 'user' : 'character');
        if (opts.isGroup) div.classList.add('group');
        if (opts.msgId) div.dataset.msgId = opts.msgId;

        var sender = document.createElement('div');
        sender.className = 'message-sender';
        if (opts.isGroup) {
            var nick = (typeof UserProfile !== 'undefined') ? UserProfile.getNickname() : '博士';
            sender.textContent = 'DOCTOR // ' + nick.toUpperCase();
        } else {
            sender.textContent = role === 'user' ? 'DOCTOR // YOU' : 'OPERATOR // ' + (getChars()[currentCharacterId] ? getChars()[currentCharacterId].name.toUpperCase() : '');
        }

        var bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.innerHTML = renderMessage(content);

        div.appendChild(sender);
        div.appendChild(bubble);

        // Image previews in message
        if (images && images.length > 0) {
            var imgContainer = document.createElement('div');
            imgContainer.className = 'msg-image-gallery';
            images.forEach(function (src) {
                var img = document.createElement('img');
                img.src = src;
                img.className = 'msg-image-thumb';
                img.loading = 'lazy';
                img.addEventListener('click', function () {
                    // Simple lightbox: open in new tab
                    window.open(src, '_blank');
                });
                imgContainer.appendChild(img);
            });
            div.appendChild(imgContainer);
        }

        // File attachments in message
        if (files && files.length > 0) {
            var fileContainer = document.createElement('div');
            fileContainer.className = 'msg-file-list';
            files.forEach(function (f) {
                var name = typeof f === 'string' ? f : (f.name || 'unknown');
                var ext = name.split('.').pop().toLowerCase();
                var icon = getFileIcon(name);
                var span = document.createElement('span');
                span.className = 'msg-file-tag';
                span.textContent = icon + ' ' + name;
                fileContainer.appendChild(span);
            });
            div.appendChild(fileContainer);
        }

        var time = document.createElement('div');
        time.className = 'message-time';
        time.textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

        div.appendChild(time);
        messagesContainer.appendChild(div);
        scrollToBottom();
    }

    async function callLLM(config, messages, bubble) {
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
        const useProvidedBubble = !!bubble;
        const streamBubble = useProvidedBubble ? bubble : createStreamingBubble();
        const isMobileView = window.matchMedia('(max-width: 768px)').matches;
        let lastStreamRender = 0;

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
                        // 流式渲染节流：移动端 150ms / 桌面 100ms，且仅在靠近底部时跟随滚动
                        const now = performance.now();
                        if (now - lastStreamRender > (isMobileView ? 150 : 100)) {
                            streamBubble.innerHTML = renderMessage(fullContent);
                            lastStreamRender = now;
                            if (nearBottom()) scrollToBottom();
                        }
                    }
                } catch {}
            }
        }

        // 定稿渲染
        streamBubble.innerHTML = renderMessage(fullContent);
        if (nearBottom()) scrollToBottom();

        // 自建气泡时移除（群聊/调用方传入气泡时保留）
        if (!useProvidedBubble) {
            const messageDiv = streamBubble.closest('.message');
            if (messageDiv) {
                messageDiv.remove();
            }
        }
        return fullContent || '(empty response)';
    }

    /** 是否靠近消息列表底部（用户上翻历史时不强制拉底） */
    function nearBottom() {
        return messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 120;
    }

    function createStreamingBubble(senderLabel, speakerId) {
        const welcome = messagesContainer.querySelector('.chat-welcome');
        if (welcome) welcome.style.display = 'none';

        const isGroupBubble = chatMode === 'group' && speakerId;
        const div = document.createElement('div');
        div.className = 'message character' + (isGroupBubble ? ' group' : '');

        const sender = document.createElement('div');
        sender.className = 'message-sender';
        if (isGroupBubble) {
            const spName = GroupChat.getCharName(speakerId);
            sender.textContent = 'OPERATOR // ' + spName.toUpperCase();
            const imgUrl = GroupChat.resolvePortrait(speakerId);
            if (imgUrl) {
                sender.innerHTML = '<span class="msg-sender-avatar" style="background-image:url(\'' + imgUrl + '\')"></span>' + escapeHtml(sender.textContent);
            }
        } else {
            const c = getChars()[currentCharacterId];
            sender.textContent = senderLabel || ('OPERATOR // ' + ((c && c.name) || '').toUpperCase());
        }

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

    /** 输入区视频按钮：针对当前单聊最后一条助手回复生成视频 */
    function requestVideoForLastReply() {
        if (chatMode === 'group') return;
        for (let i = messageHistory.length - 1; i >= 0; i--) {
            if (messageHistory[i].role === 'assistant') {
                handleManualVideo(currentCharacterId, messageHistory[i].content, messageHistory[i].id || null);
                return;
            }
        }
        App.showToast('还没有可生成视频的回复，先让角色说一句吧', 'error');
    }

    // 群聊模式：输入 @ 时弹出成员选择器
    function onInputGroup() {
        if (chatMode !== 'group') {
            GroupChat.closeAtPicker();
            return;
        }
        const text = inputEl.value;
        const lastAt = text.lastIndexOf('@');
        if (lastAt >= 0) {
            const after = text.slice(lastAt + 1);
            if (/^[一-龥A-Za-z0-9·\-']*$/.test(after)) {
                GroupChat.openAtPicker(after);
                return;
            }
        }
        GroupChat.closeAtPicker();
    }

    function clearChat() {
        messageHistory = [];
        if (chatMode === 'group') {
            GroupChat.clearHistory(currentGroupId);
        } else {
            Storage.clearHistory(currentCharacterId);
        }
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
        if (!getChars()[characterId]) {
            console.warn('Cannot switch to unknown character:', characterId);
            return;
        }
        // 群聊模式下切换角色：先退出群聊
        if (chatMode === 'group') {
            GroupChat.setHistory(currentGroupId, messageHistory);
            chatMode = 'single';
            currentGroupId = null;
            GroupChat.currentGroupId = null;
            updateGroupDisplay();
            GroupChat.closeAtPicker();
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

    return {
        init, switchCharacter, sendMessage, clearChat, removeImage, removeFile,
        enterGroup, exitGroup, getGroupMode, reloadBackground,
        callLLM, createStreamingBubble, appendMessageBubble, renderHistory,
        requestVideoForLastReply,
    };
})();

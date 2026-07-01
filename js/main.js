/* ============================================================
   main.js — App initialization, global state, event wiring
   ============================================================ */

const App = (() => {
    // Character switch cards
    let characterCards = {};

    // Character voice lines (played on card click)
    const CHARACTER_VOICES = {
        'la-pluma': new Audio('music/任命助理.wav'),
        'goldenglow': new Audio('music/任命助理_goldenglow.wav'),
        'amiya': new Audio('music/干员报到.wav'),
        'mudrock': new Audio('music/干员报到_mudrock.wav'),
        'eyjafjalla': new Audio('music/编入队伍.wav'),
        'logos': new Audio('music/任命助理_logos.wav'),
        'honeyberry': new Audio('music/任命助理_honeyberry.wav'),
        'haruka': new Audio('music/干员报到_haruka.wav'),
        'wisdel': new Audio('music/作战中4_wisdel.wav'),
        'zuole': new Audio('music/任命助理_zuole.wav'),
    };

    // Voice line subtitles (JP + CN bilingual)
    const VOICE_LINES = {
        'la-pluma': {
            jp: 'ドクターの護衛、ですか？はい。',
            cn: '做博士的护卫？好哦。',
        },
        'goldenglow': {
            jp: '本当に、足手まといになったりしませんか？……うん、わかりました。そこまで言うなら……',
            cn: '我真的不会帮倒忙吗？唔，好吧，既然你都这么说了……',
        },
        'amiya': {
            jp: 'ロドスのリーダー、アーミヤです。あなたがドクターですね。これから、よろしくお願いします。',
            cn: '我是罗德岛的领袖，阿米娅。您就是博士吧。今后，请多指教。',
        },
        'mudrock': {
            jp: 'サカズの傭兵……マドロック。あなたの指揮に従います、ドクター。',
            cn: '萨卡兹雇佣兵……泥岩。我会遵从您的指挥，博士。',
        },
        'eyjafjalla': {
            jp: 'わかりました、先輩。',
            cn: '我知道了，前辈。',
        },
        'logos': {
            jp: 'これらの書類にかけられていた暗号呪文はすべて解除しました。',
            cn: '这些档案上的加密咒文均已解除，除了一本名册上的咒言过于繁琐难以完全消除外，其余的均可放心翻阅。不过，博士，您为何自刚才起便缄默不言？',
        },
        'honeyberry': {
            jp: '毎日こんなにたくさんの仕事をするんですか？わあ......大変そう......',
            cn: '每天要做这么多工作吗？哇......好辛苦......博士，如果感觉有压力，千万不要憋在心里，随时可以找我聊天。',
        },
        'haruka': {
            jp: 'ちょっと待って、紹介された人の話とはいえ、契約書を調べさせてください——',
            cn: '等等，虽说是熟人推荐，但签这些合同前，请让我先研究一下条款——没有超长合同期，没有超高违约金......看来不是黑心事务所，可以放心签字了！',
        },
        'wisdel': {
            jp: 'バン！誰が、私が毎回カウントダウンすると言ったの？',
            cn: '砰！是谁告诉你，我每次都会倒数的？',
        },
        'zuole': {
            jp: '',
            cn: '我刚当上秉烛人的时候，花了三个月整，才读完司岁台的所有卷宗，而堆积在您这里的文件，数量也......相当可观。我想，我应该有足够的时间来熟悉工作吧？',
        },
    };

    // Loading screen audio
    const loadingAudio = new Audio('music/标题.wav');
    loadingAudio.volume = 0.6;

    // Subtitle DOM refs
    let subtitleJpEl;
    let subtitleCnEl;

    async function init() {
        try {
            // Cache subtitle elements
            subtitleJpEl = document.getElementById('subtitle-jp');
            subtitleCnEl = document.getElementById('subtitle-cn');

            // Play loading audio
            loadingAudio.play().catch(() => {});

            // Show loading animation
            simulateLoading();

            // Cache character card refs (skip null refs)
            const cardIds = ['amiya', 'eyjafjalla', 'goldenglow', 'mudrock', 'la-pluma', 'logos', 'honeyberry', 'haruka', 'wisdel', 'zuole'];
            cardIds.forEach(id => {
                const card = document.getElementById('card-' + id);
                if (card) {
                    characterCards[id] = card;
                    card.addEventListener('click', () => switchCharacter(id));
                } else {
                    console.warn('Character card not found: card-' + id);
                }
            });

            // Restore saved settings to form
            restoreSettings();

            // Mobile character switcher dropdown
            const mobileCharSelect = document.getElementById('mobile-char-select');
            if (mobileCharSelect) {
                mobileCharSelect.addEventListener('change', () => {
                    switchCharacter(mobileCharSelect.value);
                });
            }

            // Settings collapse toggle (mobile)
            const btnToggleSettings = document.getElementById('btn-toggle-settings');
            const settingsPanel = document.getElementById('settings-panel');
            if (btnToggleSettings && settingsPanel) {
                const isMobile = window.matchMedia('(max-width: 768px)').matches;
                if (isMobile) {
                    settingsPanel.classList.add('collapsed');
                }
                btnToggleSettings.addEventListener('click', () => {
                    settingsPanel.classList.toggle('collapsed');
                });
                window.matchMedia('(max-width: 768px)').addEventListener('change', (e) => {
                    if (e.matches) {
                        settingsPanel.classList.add('collapsed');
                    } else {
                        settingsPanel.classList.remove('collapsed');
                    }
                });
            }

            // Bind settings (null-safe)
            const btnSave = document.getElementById('btn-save-settings');
            const btnTogglePw = document.getElementById('btn-toggle-pw');
            if (btnSave) btnSave.addEventListener('click', saveSettings);
            if (btnTogglePw) btnTogglePw.addEventListener('click', togglePassword);

            // Bind provider dropdown → auto-fill base URL
            const providerSelect = document.getElementById('api-provider');
            const apiBaseInput = document.getElementById('api-base');
            if (providerSelect && apiBaseInput) {
                providerSelect.addEventListener('change', () => {
                    if (providerSelect.value !== 'custom') {
                        apiBaseInput.value = providerSelect.value;
                    }
                });
            }

            // Bind model dropdown → auto-fill model input
            const modelSelect = document.getElementById('api-model-select');
            const modelInput = document.getElementById('api-model');
            if (modelSelect && modelInput) {
                modelSelect.addEventListener('change', () => {
                    if (modelSelect.value !== 'custom') {
                        modelInput.value = modelSelect.value;
                    } else {
                        modelInput.value = '';
                    }
                });
            }

            // Initialize sub-modules
            ChatManager.init();
            MusicPlayer.init();
            TiltEffect.init();

            // Initialize Live2D with timeout (max 8s)
            try {
                const live2dPromise = Live2DManager.init();
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Live2D init timeout')), 8000)
                );
                await Promise.race([live2dPromise, timeoutPromise]);
            } catch (e) {
                console.warn('Live2D failed to init, using fallback:', e);
            }

            // Mark active character card
            const activeChar = Storage.getActiveCharacter();
            if (activeChar) {
                setActiveCard(activeChar);
            }

            // Sync mobile dropdown initial value
            const mobileCharSelectInit = document.getElementById('mobile-char-select');
            if (mobileCharSelectInit && activeChar) {
                mobileCharSelectInit.value = activeChar;
            }

            // Show app
            finishLoading();
        } catch (e) {
            console.error('App init error:', e);
            // Force dismiss loading screen even on error
            finishLoading();
        }
    }

    function simulateLoading() {
        const bar = document.getElementById('loading-bar');
        const percent = document.getElementById('loading-percent');

        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 25;
            if (progress >= 100) {
                progress = 100;
                clearInterval(interval);
            }
            bar.style.width = Math.floor(progress) + '%';
            percent.textContent = Math.floor(progress);
        }, 200);

        // Store interval for cleanup
        window._loadingInterval = interval;
        window._loadingTarget = 100;
    }

    function finishLoading() {
        const bar = document.getElementById('loading-bar');
        const percent = document.getElementById('loading-percent');
        const loadingScreen = document.getElementById('loading-screen');
        const appContainer = document.getElementById('app-container');

        // Ensure 100%
        if (window._loadingInterval) clearInterval(window._loadingInterval);
        if (bar) bar.style.width = '100%';
        if (percent) percent.textContent = '100';

        // Stop loading audio with fade
        const fadeOut = setInterval(() => {
            loadingAudio.volume = Math.max(0, loadingAudio.volume - 0.05);
            if (loadingAudio.volume <= 0) {
                clearInterval(fadeOut);
                loadingAudio.pause();
                loadingAudio.currentTime = 0;
                loadingAudio.volume = 0.6;
            }
        }, 50);

        // Brief delay for the 100% to render, then dismiss
        setTimeout(() => {
            if (loadingScreen) loadingScreen.classList.add('hidden');
            if (appContainer) appContainer.classList.add('ready');
        }, 400);
    }

    function switchCharacter(characterId) {
        // Update cards
        setActiveCard(characterId);

        // Sync mobile dropdown
        const mobileCharSelect = document.getElementById('mobile-char-select');
        if (mobileCharSelect) {
            mobileCharSelect.value = characterId;
        }

        // Play character voice if available
        const voice = CHARACTER_VOICES[characterId];
        if (voice) {
            voice.currentTime = 0;
            voice.play().catch(() => {});
        }

        // Show bilingual subtitle
        showSubtitle(characterId);

        // Update chat
        ChatManager.switchCharacter(characterId);

        // Update Live2D
        Live2DManager.switchCharacter(characterId);
    }

    function showSubtitle(characterId) {
        const lines = VOICE_LINES[characterId];
        if (lines && subtitleJpEl && subtitleCnEl) {
            subtitleJpEl.textContent = lines.jp;
            subtitleCnEl.textContent = lines.cn;
        } else if (subtitleJpEl && subtitleCnEl) {
            subtitleJpEl.textContent = '';
            subtitleCnEl.textContent = '';
        }
    }

    function setActiveCard(characterId) {
        Object.entries(characterCards).forEach(([id, card]) => {
            card.classList.toggle('active', id === characterId);
        });
    }

    function restoreSettings() {
        const config = Storage.getApiConfig();
        document.getElementById('api-base').value = config.baseUrl || '';
        document.getElementById('api-key').value = config.apiKey || '';
        document.getElementById('api-model').value = config.model || '';

        // Try to match saved base URL to a provider preset
        const providerSelect = document.getElementById('api-provider');
        const matched = [...providerSelect.options].find(opt => opt.value === config.baseUrl);
        providerSelect.value = matched ? config.baseUrl : 'custom';

        // Try to match saved model to a model preset
        const modelSelect = document.getElementById('api-model-select');
        const modelMatched = [...modelSelect.options].find(opt => opt.value === config.model);
        modelSelect.value = modelMatched ? config.model : 'custom';
    }

    function saveSettings() {
        const baseUrl = document.getElementById('api-base').value.trim();
        const apiKey = document.getElementById('api-key').value.trim();
        const model = document.getElementById('api-model').value.trim();

        const config = {
            baseUrl: baseUrl || 'https://api.openai.com/v1',
            apiKey: apiKey,
            model: model || 'gpt-4o',
        };

        Storage.setApiConfig(config);
        showToast('CONFIG SAVED // Settings updated', 'success');
    }

    function togglePassword() {
        const input = document.getElementById('api-key');
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
    }

    /** Show a toast notification */
    function showToast(message, type = '') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        // Auto remove after 3s
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Expose for other modules
    return { init, switchCharacter, showToast };
})();

// Boot
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

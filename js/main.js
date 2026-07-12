/* ============================================================
   main.js — App initialization, global state, event wiring
   ============================================================ */

const App = (() => {
    // Character switch cards
    let characterCards = {};

    // Character voice lines (played on card click)
    // Use a factory so Audio objects get fresh load each time, avoiding stalled state
    const VOICE_FILES = {
        'la-pluma': 'music/任命助理.wav',
        'goldenglow': 'music/任命助理_goldenglow.wav',
        'amiya': 'music/干员报到.wav',
        'mudrock': 'music/干员报到_mudrock.wav',
        'eyjafjalla': 'music/编入队伍.wav',
        'logos': 'music/任命助理_logos.wav',
        'honeyberry': 'music/任命助理_honeyberry.wav',
        'haruka': 'music/干员报到_haruka.wav',
        'wisdel': 'music/作战中4_wisdel.wav',
        'zuole': 'music/任命助理_zuole.wav',
        // 小程序新增角色
        'magallan': 'music/任命助理_magallan.wav',
        'shu': 'music/任命助理_shu.wav',
        'surtr': 'music/任命助理_surtr.wav',
        'xinoge': 'music/任命助理_xinoge.wav',
        'lin': 'music/任命助理_lin.wav',
        'lappland': 'music/任命助理_lappland.wav',
        'executor': 'music/任命助理_executor.wav',
        'mon3tr': 'music/任命助理_mon3tr.wav',
        'xingyuan': 'music/任命助理_xingyuan.wav',
        'texas': 'music/任命助理_texas.wav',
    };

    // Pool of preloaded Audio objects
    const voicePool = {};

    function preloadVoice(characterId) {
        if (voicePool[characterId]) return voicePool[characterId];
        const file = VOICE_FILES[characterId];
        if (!file) return null;
        const audio = new Audio();
        audio.preload = 'auto';
        audio.src = file;
        audio.load();
        voicePool[characterId] = audio;
        return audio;
    }

    function getVoiceAudio(characterId) {
        // Reuse pooled audio, reset it for fresh playback
        const file = VOICE_FILES[characterId];
        if (!file) return null;
        let audio = voicePool[characterId];
        if (!audio) {
            audio = new Audio();
            audio.preload = 'auto';
            voicePool[characterId] = audio;
        }
        audio.src = file;
        audio.load();
        return audio;
    }

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
        // 小程序新增角色
        'magallan': {
            jp: 'ライフサイエンス科学調査員、マゼランです。あなたがロドスのドクターですね。私の探検隊に入りませんか？',
            cn: '莱茵生命科考专员麦哲伦！你就是博士吧？要不要加入我的探险队呢？很有趣的！',
        },
        'shu': {
            jp: 'ドクター、日光と水分はどちらも成長に必要な条件です。この鉢植えは今日のノルマをきちんと達成しましたが、あなたはまだ十杯の水を飲んでいないようですよ。',
            cn: '博士，阳光与水分都是生长的必要条件，这株盆栽今天已经好好地完成了它的指标，但你好像还没喝够十杯水哦。',
        },
        'surtr': {
            jp: 'あ、あなたがいた。',
            cn: '啊，你在这里。',
        },
        'xinoge': {
            jp: '博士、足音が聞こえましたよ。',
            cn: '听到你的脚步声了呢，博士。',
        },
        'lin': {
            jp: '私はあなたを守ることができる。面倒なことも処理できる。でも、その価値を証明してみせて。',
            cn: '我可以保护你，也可以帮你处理一些麻烦。但你最好向我证明这样做的价值。',
        },
        'lappland': {
            jp: 'やあ、ドクター。武器をここに持ち込んでも、許してくれるんだろ？じゃあ、ここに座らせてもらうよ。',
            cn: '哟，博士。就算我把武器带进这里，你也会原谅我的对吧。那我就坐在这里了。',
        },
        'executor': {
            jp: 'ドクター、安心してください。地雷を設置しておきましたので、何人たりともあなたの仕事と休息を妨害することはできません。',
            cn: '你可以安心值班，博士。破片地雷已经架设完毕，没有人能干扰你的工作和休息。',
        },
        'mon3tr': {
            jp: '安心するといいよ。どれも通常業務だ。正しい手順なら何度も見てきた。それで、権限記録の変更はどうするのだったか？',
            cn: '放心好了，都是常规工作，正确的处理流程我看过很多次。更改权限记录怎么操作来着？',
        },
        'xingyuan': {
            jp: 'オッケー、これ全部やったことあるから、問題ないよ！ただ一つだけ先に言っておくけど、ドクター、夜中に書類の山を持ってきて今晩中によろしくとかはなしだからね。',
            cn: '行，这些我都做过，不会碰到什么困难的。但是有一点我得和你说清楚，博士，可不能大晚上拿着一堆文件让我当晚就出结果哦。',
        },
        'texas': {
            jp: '次の任務はドクターの身辺警護か。',
            cn: '我接下来的任务是保护博士你的安全。',
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
            const cardIds = ['amiya', 'eyjafjalla', 'goldenglow', 'mudrock', 'la-pluma', 'logos', 'honeyberry', 'haruka', 'wisdel', 'zuole', 'magallan', 'shu', 'surtr', 'xinoge', 'lin', 'lappland', 'executor', 'mon3tr', 'xingyuan', 'texas'];
            cardIds.forEach(id => {
                const card = document.getElementById('card-' + id);
                if (card) {
                    characterCards[id] = card;
                    card.addEventListener('click', () => switchCharacter(id));
                    // Keyboard accessibility
                    card.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            switchCharacter(id);
                        }
                    });
                } else {
                    console.warn('Character card not found: card-' + id);
                }
            });

            // Restore saved settings to form
            restoreSettings();
            restoreTtsSettings();

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

            // Bind TTS settings
            const btnSaveTts = document.getElementById('btn-save-tts-settings');
            if (btnSaveTts) btnSaveTts.addEventListener('click', saveTtsSettings);

            // Bind 添加角色音色按钮
            const btnAddVoice = document.getElementById('btn-add-character-voice');
            if (btnAddVoice) {
                btnAddVoice.addEventListener('click', () => {
                    const container = document.getElementById('character-voice-rows');
                    if (container) {
                        addCharacterVoiceRowTo(container, getCharacterNameMap(), '', '', '');
                    }
                });
            }

            // Bind guide button
            const btnOpenGuide = document.getElementById('btn-open-guide');
            const btnCloseGuide = document.getElementById('btn-close-guide');
            const guideOverlay = document.getElementById('guide-overlay');
            if (btnOpenGuide) btnOpenGuide.addEventListener('click', () => guideOverlay.classList.add('active'));
            if (btnCloseGuide) btnCloseGuide.addEventListener('click', () => guideOverlay.classList.remove('active'));
            if (guideOverlay) {
                guideOverlay.querySelector('.guide-backdrop').addEventListener('click', () => guideOverlay.classList.remove('active'));
                // ESC to close
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape' && guideOverlay.classList.contains('active')) {
                        guideOverlay.classList.remove('active');
                    }
                });
            }

            // Bind TTS password toggle buttons
            const btnToggleTtsPw = document.querySelector('.btn-toggle-tts-pw');
            const btnToggleTtsAkPw = document.querySelector('.btn-toggle-tts-ak-pw');
            if (btnToggleTtsPw) btnToggleTtsPw.addEventListener('click', () => toggleTtsPassword('tts-api-key', btnToggleTtsPw));
            if (btnToggleTtsAkPw) btnToggleTtsAkPw.addEventListener('click', () => toggleTtsPassword('tts-access-key', btnToggleTtsAkPw));

            // Bind language toggle button
            const btnLangToggle = document.getElementById('btn-lang-toggle');
            if (btnLangToggle) {
                btnLangToggle.addEventListener('click', toggleTtsLanguage);
                updateLangToggleDisplay();
            }

            // 官网动效 · 右侧面板滚动暗示
            initScrollHint();

            // Initialize sub-modules
            TTSManager.init();
            ChatManager.init();
            MusicPlayer.init();
            TiltEffect.init();

            // Preload only first 3 voice files to avoid bandwidth spike (rest load on demand)
            cardIds.slice(0, 3).forEach(id => preloadVoice(id));

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

            // Mark active character card and sync chat display
            const activeChar = Storage.getActiveCharacter();
            if (activeChar) {
                setActiveCard(activeChar);
                updateWatermark(activeChar);
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

    let _loadingInterval = null;

    function simulateLoading() {
        const bar = document.getElementById('loading-bar');
        const percent = document.getElementById('loading-percent');

        // 官网动效 · 几何引导线入场
        const geoGuides = document.getElementById('geo-guides');
        if (geoGuides) {
            geoGuides.classList.add('entering');
        }

        let progress = 0;
        _loadingInterval = setInterval(() => {
            progress += Math.random() * 25;
            if (progress >= 100) {
                progress = 100;
                clearInterval(_loadingInterval);
                _loadingInterval = null;
            }
            if (bar) bar.style.width = Math.floor(progress) + '%';
            if (percent) percent.textContent = Math.floor(progress);
        }, 200);
    }

    function finishLoading() {
        const bar = document.getElementById('loading-bar');
        const percent = document.getElementById('loading-percent');
        const loadingScreen = document.getElementById('loading-screen');
        const appContainer = document.getElementById('app-container');

        // 官网动效 · 几何引导线退场
        const geoGuides = document.getElementById('geo-guides');
        if (geoGuides) {
            geoGuides.classList.remove('entering');
            geoGuides.classList.add('exiting');
            // 退场动画完成后隐藏
            setTimeout(() => {
                geoGuides.classList.add('hidden');
            }, 800);
        }

        // Ensure 100%
        if (_loadingInterval) { clearInterval(_loadingInterval); _loadingInterval = null; }
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
        if (!characterId) return;

        // 1. Update chat name+role FIRST (before anything else)
        ChatManager.switchCharacter(characterId);

        // 2. Update card UI
        setActiveCard(characterId);

        // 3. Sync mobile dropdown
        const mobileCharSelect = document.getElementById('mobile-char-select');
        if (mobileCharSelect) {
            mobileCharSelect.value = characterId;
        }

        // 4. Play character voice
        const voice = getVoiceAudio(characterId);
        if (voice) {
            voice.currentTime = 0;
            voice.muted = false;
            const playPromise = voice.play();
            if (playPromise !== undefined) {
                playPromise.catch(err => {
                    console.warn('Voice play failed for', characterId, ':', err.message);
                    // Retry once after a short delay (WAV may still be buffering)
                    setTimeout(() => {
                        voice.currentTime = 0;
                        voice.play().catch(() => {});
                    }, 300);
                });
            }
        }

        // 5. Show bilingual subtitle
        showSubtitle(characterId);

        // 6. Update Live2D (non-blocking, wrapped to prevent errors)
        try {
            Live2DManager.switchCharacter(characterId);
        } catch (e) {
            console.warn('Live2D switch error:', e);
        }

        // 7. 官网动效 · 更新背景水印文字
        updateWatermark(characterId);
    }

    const WATERMARK_NAMES = {
        'amiya': 'AMIYA',
        'eyjafjalla': 'EYJAFJALLA',
        'goldenglow': 'GOLDENGLOW',
        'mudrock': 'MUDROCK',
        'la-pluma': 'LA PLUMA',
        'logos': 'LOGOS',
        'honeyberry': 'HONEYBERRY',
        'haruka': 'HARUKA',
        'wisdel': "WIS'ADEL",
        'zuole': 'ZUO LE',
        'magallan': 'MAGALLAN',
        'shu': 'SHU',
        'surtr': 'SURTR',
        'xinoge': 'CANTABILE',
        'lin': 'LIN',
        'lappland': 'LAPPLAND',
        'executor': 'EXECUTOR',
        'mon3tr': 'Mon3tr',
        'xingyuan': 'ASTGENNE',
        'texas': 'TEXAS',
    };
    function updateWatermark(characterId) {
        const watermark = document.querySelector('.live2d-watermark');
        if (watermark) {
            const name = WATERMARK_NAMES[characterId];
            if (name) {
                watermark.style.opacity = '0';
                setTimeout(() => {
                    watermark.textContent = name;
                    watermark.style.opacity = '1';
                }, 200);
            }
        }
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
            const isActive = id === characterId;
            card.classList.toggle('active', isActive);
            card.setAttribute('aria-pressed', String(isActive));
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

        // 按钮闪烁反馈
        const btn = document.getElementById('btn-save-settings');
        if (btn) {
            btn.classList.add('saved');
            setTimeout(() => btn.classList.remove('saved'), 800);
        }
    }

    /* ============================================================
       TTS Settings (火山引擎 + Cloudflare Worker)
       ============================================================ */
    function restoreTtsSettings() {
        const ttsConfig = Storage.getTtsConfig();
        const proxyUrl = Storage.getTtsProxyUrl();
        document.getElementById('tts-proxy-url').value = proxyUrl || '';
        document.getElementById('tts-api-key').value = ttsConfig.apiKey || '';
        document.getElementById('tts-app-id').value = ttsConfig.appId || '';
        document.getElementById('tts-access-key').value = ttsConfig.accessKey || '';

        // 角色音色映射 — 动态行
        renderCharacterVoiceRows(Storage.getCharacterVoices());
    }

    /* 获取角色 ID → 显示名称的映射 */
    function getCharacterNameMap() {
        const map = {};
        if (window.ARKNIGHTS_CHARACTERS) {
            for (const [id, def] of Object.entries(window.ARKNIGHTS_CHARACTERS)) {
                map[id] = def.name || id;
            }
        }
        // 兜底：从 DOM 卡片提取
        if (Object.keys(map).length === 0) {
            document.querySelectorAll('.character-card').forEach(card => {
                const id = card.dataset.character;
                const nameEl = card.querySelector('.character-card-name');
                if (id && nameEl) map[id] = nameEl.textContent.trim();
            });
        }
        return map;
    }

    /* 渲染音色映射动态行 */
    function renderCharacterVoiceRows(voices) {
        const container = document.getElementById('character-voice-rows');
        if (!container) return;
        container.innerHTML = '';

        const nameMap = getCharacterNameMap();
        const entries = Object.entries(voices);

        // 确保至少显示一行空行
        if (entries.length === 0) {
            entries.push(['', { zh: '', ja: '' }]);
        }

        entries.forEach(([charId, langs]) => {
            addCharacterVoiceRowTo(container, nameMap, charId, langs.zh || '', langs.ja || '');
        });
    }

    /* 向容器追加一行音色映射 */
    function addCharacterVoiceRowTo(container, nameMap, charId, zh, ja) {
        const row = document.createElement('div');
        row.className = 'character-voice-row';
        row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:4px;';

        // 角色下拉
        const sel = document.createElement('select');
        sel.style.cssText = 'flex:1.5;min-width:0;font-size:12px;padding:4px 6px;background:#1a1a2e;color:#ccc;border:1px solid #333;border-radius:4px;';
        sel.innerHTML = '<option value="">选择角色...</option>';
        for (const [id, name] of Object.entries(nameMap).sort((a, b) => a[1].localeCompare(b[1], 'zh'))) {
            sel.innerHTML += `<option value="${id}" ${id === charId ? 'selected' : ''}>${name}</option>`;
        }

        // 中文音色输入
        const inpZh = document.createElement('input');
        inpZh.type = 'text';
        inpZh.placeholder = '中文音色 S_';
        inpZh.value = zh;
        inpZh.style.cssText = 'flex:1.5;min-width:0;font-size:12px;padding:4px 6px;background:#1a1a2e;color:#ccc;border:1px solid #333;border-radius:4px;';

        // 日文音色输入
        const inpJa = document.createElement('input');
        inpJa.type = 'text';
        inpJa.placeholder = '日文音色 S_';
        inpJa.value = ja;
        inpJa.style.cssText = 'flex:1.5;min-width:0;font-size:12px;padding:4px 6px;background:#1a1a2e;color:#ccc;border:1px solid #333;border-radius:4px;';

        // 删除按钮
        const btnDel = document.createElement('button');
        btnDel.type = 'button';
        btnDel.textContent = '✕';
        btnDel.title = '移除';
        btnDel.style.cssText = 'flex:0 0 28px;height:28px;font-size:14px;line-height:1;padding:0;background:transparent;color:#f66;border:1px solid #533;border-radius:4px;cursor:pointer;';
        btnDel.addEventListener('click', () => {
            row.remove();
            ensureAtLeastOneRow();
        });

        row.appendChild(sel);
        row.appendChild(inpZh);
        row.appendChild(inpJa);
        row.appendChild(btnDel);
        container.appendChild(row);
    }

    /* 确保始终至少有一行空行 */
    function ensureAtLeastOneRow() {
        const container = document.getElementById('character-voice-rows');
        if (container && container.querySelectorAll('.character-voice-row').length === 0) {
            addCharacterVoiceRowTo(container, getCharacterNameMap(), '', '', '');
        }
    }

    function saveTtsSettings() {
        const proxyUrl = document.getElementById('tts-proxy-url').value.trim();
        const apiKey = document.getElementById('tts-api-key').value.trim();
        const appId = document.getElementById('tts-app-id').value.trim();
        const accessKey = document.getElementById('tts-access-key').value.trim();

        Storage.setTtsProxyUrl(proxyUrl);
        Storage.setTtsConfig({ apiKey, appId, accessKey });

        // 收集所有音色映射行
        const voices = {};
        document.querySelectorAll('#character-voice-rows .character-voice-row').forEach(row => {
            const sel = row.querySelector('select');
            const inputs = row.querySelectorAll('input');
            const charId = sel.value.trim();
            const zh = inputs[0].value.trim();
            const ja = inputs[1].value.trim();
            if (charId && (zh || ja)) {
                voices[charId] = {};
                if (zh) voices[charId].zh = zh;
                if (ja) voices[charId].ja = ja;
            }
        });
        Storage.setCharacterVoices(voices);

        TTSManager.reloadConfig();

        // 按钮闪烁反馈
        const btn = document.getElementById('btn-save-tts-settings');
        if (btn) {
            btn.classList.add('saved');
            setTimeout(() => btn.classList.remove('saved'), 800);
        }

        const status = document.getElementById('tts-settings-status');
        if (status) {
            status.textContent = 'TTS 设置已保存';
            status.className = 'settings-status success';
            setTimeout(() => {
                status.textContent = '';
                status.className = 'settings-status';
            }, 2000);
        }
    }

    function toggleTtsPassword(inputId, btn) {
        const input = document.getElementById(inputId);
        if (!input) return;
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
    }

    /* ============================================================
       Language Toggle (TTS Voice Language: zh ↔ ja)
       ============================================================ */
    function toggleTtsLanguage() {
        const currentLang = TTSManager.getLanguage();
        const newLang = currentLang === 'zh' ? 'ja' : 'zh';
        TTSManager.setLanguage(newLang);
        updateLangToggleDisplay();
        showToast(`TTS 语音语言切换为: ${newLang === 'zh' ? '中文' : '日本語'}`, 'success');
    }

    function updateLangToggleDisplay() {
        const btn = document.getElementById('btn-lang-toggle');
        const langChar = document.getElementById('lang-char');
        if (!btn || !langChar) return;

        const lang = TTSManager.getLanguage();
        btn.setAttribute('data-lang', lang);
        langChar.textContent = lang === 'zh' ? '中' : '日';
    }

    function togglePassword() {
        const input = document.getElementById('api-key');
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
    }

    /* 官网动效 · 滚动暗示控制器 */
    function initScrollHint() {
        const scrollHint = document.getElementById('scroll-hint');
        const rightPanel = document.getElementById('right-panel');
        if (!scrollHint || !rightPanel) return;

        let ticking = false;
        const onScroll = () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    scrollHint.classList.toggle('hidden', rightPanel.scrollTop > 60);
                    ticking = false;
                });
                ticking = true;
            }
        };
        rightPanel.addEventListener('scroll', onScroll, { passive: true });

        // 初始显示，2s 后如果未滚动过则显示
        setTimeout(() => {
            if (rightPanel.scrollTop <= 60) {
                scrollHint.classList.remove('hidden');
            }
        }, 1500);
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

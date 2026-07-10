/* ============================================================
   tts.js — 火山引擎 豆包语音合成 2.0 (seed-tts-2.0)
   HTTP V3 API via Cloudflare Worker 代理

   架构:
   浏览器 → Cloudflare Worker (CORS 代理) → 火山引擎 TTS API
   Worker 代码: workers/tts-proxy.js

   API 参考: https://www.volcengine.com/docs/6561/1598757
   ============================================================ */

const TTSManager = (() => {
    // ================================================================
    // Configuration
    // ================================================================
    // 默认音色（未匹配到角色时使用）
    const VOICE_IDS = {
        zh: 'S_c1jmOCG72',   // 豆包 2.0 中文女声（羽毛笔）
        ja: 'S_d1jmOCG72',   // 豆包 2.0 日文女声（羽毛笔）
    };

    // 角色专用音色码（按角色 ID → 语言 → 音色码）
    const CHARACTER_VOICE_IDS = {
        'la-pluma': {
            zh: 'S_c1jmOCG72',   // 羽毛笔 中文
            ja: 'S_d1jmOCG72',   // 羽毛笔 日文
        },
        'amiya': {
            zh: 'S_b1jmOCG72',   // 阿米娅 中文
            ja: 'S_dXhmOCG72',   // 阿米娅 日文
        },
    };

    function getVoiceId(lang, characterId) {
        // 优先使用角色专用音色
        if (characterId && CHARACTER_VOICE_IDS[characterId] && CHARACTER_VOICE_IDS[characterId][lang]) {
            return CHARACTER_VOICE_IDS[characterId][lang];
        }
        // 回退到默认音色
        return VOICE_IDS[lang];
    }

    const RESOURCE_ID = 'seed-icl-2.0';

    // 火山引擎 HTTP V3 端点 (由 Worker 代理转发)
    const VOLC_ENDPOINT = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional';

    // State
    let currentLanguage = 'zh';
    let isPlaying = false;
    let currentAudio = null;
    let ttsConfig = { apiKey: '', appId: '', accessKey: '', proxyUrl: '' };

    // ================================================================
    // Init & Config
    // ================================================================
    function init() {
        ttsConfig = Storage.getTtsConfig();
        ttsConfig.proxyUrl = Storage.getTtsProxyUrl();
        currentLanguage = Storage.getTtsLanguage();
        console.log('[TTS] 已初始化 — 语言:', currentLanguage,
            'API Key:', !!ttsConfig.apiKey,
            '代理:', ttsConfig.proxyUrl || '(未设置)');
    }

    function setLanguage(lang) {
        if (lang !== 'zh' && lang !== 'ja') return;
        currentLanguage = lang;
        Storage.setTtsLanguage(lang);
        console.log('[TTS] 语言:', lang);
    }

    function getLanguage() { return currentLanguage; }

    // 检查角色是否配置了专用 TTS 音色
    function hasCharacterVoice(characterId) {
        return !!(characterId && CHARACTER_VOICE_IDS[characterId]);
    }

    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function hasCredentials() {
        const config = Storage.getTtsConfig();
        return !!(config.apiKey || (config.appId && config.accessKey));
    }

    function hasProxy() {
        return !!Storage.getTtsProxyUrl();
    }

    // ================================================================
    // Synthesis: HTTP V3 via Cloudflare Worker proxy
    // ================================================================
    async function synthesize(text, characterId) {
        const config = Storage.getTtsConfig();
        const proxyUrl = Storage.getTtsProxyUrl();
        const voiceId = getVoiceId(currentLanguage, characterId);
        const requestId = generateUUID();

        // 验证配置
        // 默认使用公共代理，用户可在设置中覆盖
        const actualProxy = proxyUrl || 'https://tts-proxy.lanfanqie.workers.dev';
        console.log('[TTS] 代理:', actualProxy);

        if (!hasCredentials()) {
            throw new Error('请先配置火山引擎 API Key (控制台 → API Key 管理)');
        }

        console.log('[TTS] 合成:', text.slice(0, 50) + (text.length > 50 ? '...' : ''),
            '音色:', voiceId, '语言:', currentLanguage);

        // 构建请求头 (鉴权信息通过代理转发)
        const headers = {
            'Content-Type': 'application/json',
        };

        if (config.apiKey) {
            headers['X-Api-Key'] = config.apiKey;
            headers['X-Api-Resource-Id'] = RESOURCE_ID;
            headers['X-Api-Request-Id'] = requestId;
        }

        if (config.appId) {
            headers['X-Api-App-Key'] = config.appId;
        }

        if (config.accessKey) {
            headers['X-Api-Access-Key'] = config.accessKey;
        }

        // V3 请求体
        const body = {
            req_params: {
                text: text.trim(),
                speaker: voiceId,
                audio_params: {
                    format: 'mp3',
                    sample_rate: 24000,
                },
            },
        };

        // 通过代理发送请求
        const proxyEndpoint = actualProxy.replace(/\/$/, '');
        console.log('[TTS] 通过代理:', proxyEndpoint);

        const response = await fetch(proxyEndpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body),
        });

        console.log('[TTS] 响应状态:', response.status);
        console.log('[TTS] Content-Type:', response.headers.get('content-type'));

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[TTS] 错误响应体:', errorText.slice(0, 500));
            let errorMsg = `HTTP ${response.status}`;
            try {
                const errJson = JSON.parse(errorText);
                errorMsg = errJson.message || errJson.error || errJson.code || errorMsg;
            } catch {
                errorMsg += ': ' + errorText.slice(0, 200);
            }
            if (response.status === 502) {
                errorMsg = '代理连接失败 — 请检查 Cloudflare Worker 是否正常运行';
            }
            throw new Error('TTS 错误: ' + errorMsg);
        }

        // 先读取所有数据再判断格式
        const rawData = await response.arrayBuffer();
        console.log('[TTS] 收到数据:', rawData.byteLength, 'bytes');

        if (rawData.byteLength === 0) {
            throw new Error('火山引擎返回空数据');
        }

        const rawBytes = new Uint8Array(rawData);

        // JSON 响应 (火山引擎 V3 返回 JSON, base64 音频在 data 字段)
        if (rawBytes[0] === 0x7B) {
            const text = new TextDecoder().decode(rawData);
            console.log('[TTS] JSON 响应, 长度:', text.length);

            let allBase64 = '';
            const lines = text.split('\n').filter(l => l.trim());

            console.log('[TTS] JSON 行数:', lines.length);

            for (let i = 0; i < lines.length; i++) {
                let json;
                try {
                    json = JSON.parse(lines[i].trim());
                } catch (parseErr) {
                    continue;
                }

                // 只收集有 data 的行, 其他的都是状态行忽略即可
                if (json.data) {
                    allBase64 += json.data.replace(/\s/g, '');
                }
            }

            if (!allBase64) {
                throw new Error('火山引擎返回无音频数据');
            }

            // Base64 解码所有音频
            console.log('[TTS] 合并 Base64 长度:', allBase64.length);

            let binaryStr;
            try {
                binaryStr = atob(allBase64);
            } catch (b64Err) {
                throw new Error('Base64 解码失败: ' + b64Err.message);
            }

            console.log('[TTS] 解码后总大小:', binaryStr.length, 'bytes');

            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
            }

            const blob = new Blob([bytes], { type: 'audio/mp3' });
            console.log('[TTS] 合成完成, 大小:', blob.size, 'bytes');
            return blob;
        }

        // 二进制音频 (不应该到这里, 火山引擎 V3 始终返回 JSON)
    }

    // ================================================================
    // Audio playback
    // ================================================================
    function playAudio(audioBlob) {
        return new Promise((resolve, reject) => {
            stopAll();

            const url = URL.createObjectURL(audioBlob);
            console.log('[TTS] Blob URL:', url, 'type:', audioBlob.type, 'size:', audioBlob.size);

            const audio = new Audio(url);
            currentAudio = audio;
            audio.volume = (Storage.getVolume() || 60) / 100;

            audio.onended = () => {
                isPlaying = false;
                currentAudio = null;
                URL.revokeObjectURL(url);
                console.log('[TTS] 播放完成');
                resolve();
            };

            audio.onerror = (e) => {
                isPlaying = false;
                currentAudio = null;
                URL.revokeObjectURL(url);
                const err = audio.error;
                const code = err ? (err.code || 'unknown') : 'unknown';
                const msg = err ? (err.message || '') : '';
                console.error('[TTS] 播放错误 — code:', code, 'message:', msg);
                reject(new Error(
                    code === 4 ? '音频格式不支持，浏览器无法播放此格式' :
                    code === 3 ? '音频数据解码失败，文件可能已损坏' :
                    code === 2 ? '加载音频超时，请检查网络' :
                    '音频播放失败 (' + code + ')'
                ));
            };

            audio.oncanplaythrough = () => {
                isPlaying = true;
                console.log('[TTS] 音频加载成功, 时长:', audio.duration, 's');
                audio.play().catch(err => {
                    isPlaying = false;
                    currentAudio = null;
                    URL.revokeObjectURL(url);
                    console.error('[TTS] play() 失败:', err);
                    reject(err);
                });
            };

            audio.onloadedmetadata = () => {
                console.log('[TTS] 元数据加载 — duration:', audio.duration);
            };

            audio.load();
        });
    }

    // ================================================================
    // Stop / state
    // ================================================================
    function stopAll() {
        if (currentAudio) {
            try { currentAudio.pause(); currentAudio.currentTime = 0; } catch (e) {}
            currentAudio = null;
        }
        isPlaying = false;
    }

    function getIsPlaying() { return isPlaying; }

    function reloadConfig() {
        ttsConfig = Storage.getTtsConfig();
        ttsConfig.proxyUrl = Storage.getTtsProxyUrl();
        console.log('[TTS] 配置已重载');
    }

    // ================================================================
    // Main: speak text
    // ================================================================
    async function speak(text, characterId) {
        if (!text || !text.trim()) throw new Error('没有可朗读的文本');

        // 仅允许配置了 TTS 音色的角色使用语音
        if (characterId && !hasCharacterVoice(characterId)) {
            throw new Error('当前角色不支持 TTS 语音');
        }

        if (isPlaying) stopAll();

        console.log('[TTS] 开始合成... 角色:', characterId || '(默认)');
        const audioBlob = await synthesize(text, characterId);
        await playAudio(audioBlob);
    }

    return {
        init, setLanguage, getLanguage, hasCharacterVoice,
        speak, stopAll, getIsPlaying, reloadConfig,
    };
})();

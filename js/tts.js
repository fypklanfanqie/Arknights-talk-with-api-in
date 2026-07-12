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
        // 1. 优先使用用户自定义音色 ID（从设置面板填入）
        const userVoices = Storage.getCharacterVoices();
        if (characterId && userVoices[characterId] && userVoices[characterId][lang]) {
            return userVoices[characterId][lang];
        }
        // 2. 回退到硬编码的默认音色（开发者账号的复刻音色）
        if (characterId && CHARACTER_VOICE_IDS[characterId] && CHARACTER_VOICE_IDS[characterId][lang]) {
            return CHARACTER_VOICE_IDS[characterId][lang];
        }
        // 3. 全局默认
        return VOICE_IDS[lang];
    }

    const RESOURCE_ID = 'seed-icl-2.0';   // 即时克隆音色 (S_xxxOCG72 系列)

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

    // 检查角色是否配置了 TTS 音色（硬编码默认 或 用户自定义）
    function hasCharacterVoice(characterId) {
        if (!characterId) return true; // 无角色 = 全局默认音色
        // 用户自定义音色
        const userVoices = Storage.getCharacterVoices();
        if (userVoices[characterId] && (userVoices[characterId].zh || userVoices[characterId].ja)) {
            return true;
        }
        // 硬编码默认音色
        if (CHARACTER_VOICE_IDS[characterId]) return true;
        return false;
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
        let proxyUrl = Storage.getTtsProxyUrl();
        const voiceId = getVoiceId(currentLanguage, characterId);
        const requestId = generateUUID();

        // 默认回退到自建 CloudBase TTS 代理 (已部署)。
        // 用户也可在设置中填写自己的代理地址进行覆盖。
        const DEFAULT_TTS_PROXY = 'https://lanfanqie-d8go1l51d56f44d20.service.tcloudbase.com/tts';

        // 若未设置代理，或仍在使用旧的 Cloudflare Workers 代理
        // (workers.dev 域名在中国大陆被 GFW 封锁，需自动切换)
        if (!proxyUrl || proxyUrl.includes('workers.dev')) {
            proxyUrl = DEFAULT_TTS_PROXY;
            console.log('[TTS] 已自动切换到 CloudBase 代理 (workers.dev 在中国不可用)');
        }

        const actualProxy = proxyUrl;
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

        // V3 请求体 (参考: https://www.volcengine.com/docs/6561/1598757)
        const body = {
            user: {
                uid: 'mrfz-talk-terminal',
            },
            namespace: 'BidirectionalTTS',
            req_params: {
                text: text.trim(),
                speaker: voiceId,
                audio_params: {
                    format: 'mp3',
                    sample_rate: 24000,
                },
                additions: JSON.stringify({ disable_markdown_filter: true }),
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
                errorMsg = '代理连接失败 — 请检查你部署的 TTS 代理 (Cloudflare Worker / CloudBase 云托管) 是否正常运行';
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
            let errorInfo = null;
            const lines = text.split('\n').filter(l => l.trim());

            console.log('[TTS] JSON 行数:', lines.length);

            for (let i = 0; i < lines.length; i++) {
                let json;
                try {
                    json = JSON.parse(lines[i].trim());
                } catch (parseErr) {
                    continue;
                }

                // 收集音频 data (注意: 空字符串是 falsy, 需显式判断)
                if (json.data != null && json.data !== '') {
                    allBase64 += json.data.replace(/\s/g, '');
                }

                // 捕获错误信息（火山引擎 V3 错误格式，code != 0 才算错误）
                const isError = (json.code && json.code !== 0) || json.error
                    || (json.message && json.message !== 'success');
                if (!errorInfo && isError) {
                    errorInfo = json;
                }
            }

            if (!allBase64) {
                // 尝试提取火山引擎返回的具体错误
                if (errorInfo) {
                    const errMsg = errorInfo.message || errorInfo.error
                        || (typeof errorInfo.status === 'object' ? JSON.stringify(errorInfo.status) : '');
                    const errCode = errorInfo.code || '';
                    const errDesc = [errCode, errMsg].filter(Boolean).join(': ');
                    console.error('[TTS] 火山引擎错误:', JSON.stringify(errorInfo));
                    throw new Error('火山引擎错误: ' + (errDesc || JSON.stringify(errorInfo)));
                }
                // 兜底：把原始响应的关键字段拼入异常消息，方便诊断
                console.error('[TTS] 无音频数据 — 原始响应 (全文):', text);
                let snippet = text.slice(0, 300);
                // 尝试提取嵌套的错误信息
                let extraHint = '';
                for (const line of lines) {
                    try {
                        const j = JSON.parse(line.trim());
                        const hdr = j.header || j.Header || {};
                        const nestedCode = hdr.code || hdr.Code || '';
                        const nestedMsg = hdr.message || hdr.Message || '';
                        if (nestedCode || nestedMsg) {
                            extraHint = ' [' + nestedCode + '] ' + nestedMsg;
                            break;
                        }
                    } catch (_) {}
                }
                throw new Error('火山引擎返回无音频数据' + extraHint + ' — 响应: ' + snippet);
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
            throw new Error('该角色未配置 TTS 音色，请在设置中「角色音色映射」添加');
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

/* ============================================================
   storage.js — localStorage wrapper for settings & history
   （API / TTS 等关键配置同时备份到 IndexedDB，localStorage 被清空时自动恢复）
   ============================================================ */

const Storage = (() => {
    const PREFIX = 'arknights_chat_';

    // ── IndexedDB 备份（比 localStorage 更持久，Safari 等清理 localStorage 时仍可恢复）──
    const IDB_NAME = 'arknights_terminal_backup';
    const IDB_STORE = 'config_backup';
    let _dbPromise = null;

    function openDb() {
        if (_dbPromise) return _dbPromise;
        _dbPromise = new Promise((resolve) => {
            try {
                const req = indexedDB.open(IDB_NAME, 1);
                req.onupgradeneeded = () => {
                    try { req.result.createObjectStore(IDB_STORE); } catch (e) {}
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve(null);
                req.onblocked = () => resolve(null);
            } catch (e) {
                resolve(null);
            }
        });
        return _dbPromise;
    }

    // 写入 IndexedDB 备份（fire-and-forget）
    async function idbBackup(key, value) {
        try {
            const db = await openDb();
            if (!db) return;
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).put({ key, value, ts: Date.now() }, key);
        } catch (e) {}
    }

    // 从 IndexedDB 备份读取
    async function idbRead(key) {
        try {
            const db = await openDb();
            if (!db) return null;
            return new Promise((resolve) => {
                try {
                    const tx = db.transaction(IDB_STORE, 'readonly');
                    const rq = tx.objectStore(IDB_STORE).get(key);
                    rq.onsuccess = () => resolve(rq.result ? rq.result.value : null);
                    rq.onerror = () => resolve(null);
                } catch (e) { resolve(null); }
            });
        } catch (e) { return null; }
    }

    const KEYS = {
        API_KEY: 'api_key',
        API_BASE: 'api_base',
        API_MODEL: 'api_model',
        ACTIVE_CHAR: 'active_character',
        VOLUME: 'volume',
        TTS_API_KEY: 'tts_api_key',
        TTS_APP_ID: 'tts_app_id',
        TTS_ACCESS_KEY: 'tts_access_key',
        TTS_LANGUAGE: 'tts_language',
        TTS_PROXY_URL: 'tts_proxy_url',
        TTS_CHARACTER_VOICES: 'tts_character_voices',
    };

    function key(k) {
        return PREFIX + k;
    }

    return {
        /** Get a stored value */
        get(k) {
            try {
                const raw = localStorage.getItem(key(k));
                return raw !== null ? JSON.parse(raw) : null;
            } catch {
                return null;
            }
        },

        /** Set a stored value */
        set(k, value) {
            try {
                localStorage.setItem(key(k), JSON.stringify(value));
            } catch (e) {
                console.warn('localStorage set failed:', e);
            }
            // 同时备份到 IndexedDB（不阻塞主流程）
            idbBackup(k, value);
        },

        /** Remove a stored value */
        remove(k) {
            try {
                localStorage.removeItem(key(k));
            } catch {}
        },

        /** Get chat history for a character */
        getHistory(characterId) {
            try {
                const raw = localStorage.getItem(key('history_' + characterId));
                return raw ? JSON.parse(raw) : [];
            } catch {
                return [];
            }
        },

        /** Save chat history for a character */
        setHistory(characterId, messages) {
            try {
                // Keep max 50 messages
                const trimmed = messages.slice(-50);
                localStorage.setItem(key('history_' + characterId), JSON.stringify(trimmed));
            } catch (e) {
                console.warn('Failed to save chat history:', e);
            }
        },

        /** Clear chat history for a character */
        clearHistory(characterId) {
            try {
                localStorage.removeItem(key('history_' + characterId));
            } catch {}
        },

        /** Get API config as object */
        getApiConfig() {
            return {
                baseUrl: this.get(KEYS.API_BASE) || 'https://api.openai.com/v1',
                apiKey: this.get(KEYS.API_KEY) || '',
                model: this.get(KEYS.API_MODEL) || 'gpt-4o',
            };
        },

        /** Save API config */
        setApiConfig(config) {
            if (config.baseUrl !== undefined) this.set(KEYS.API_BASE, config.baseUrl);
            if (config.apiKey !== undefined) this.set(KEYS.API_KEY, config.apiKey);
            if (config.model !== undefined) this.set(KEYS.API_MODEL, config.model);
        },

        /** Get active character */
        getActiveCharacter() {
            return this.get(KEYS.ACTIVE_CHAR) || 'amiya';
        },

        /** Set active character */
        setActiveCharacter(charId) {
            this.set(KEYS.ACTIVE_CHAR, charId);
        },

        /** Get volume */
        getVolume() {
            const v = this.get(KEYS.VOLUME);
            return v !== null ? v : 60;
        },

        /** Set volume */
        setVolume(vol) {
            this.set(KEYS.VOLUME, vol);
        },

        /** Get TTS config */
        getTtsConfig() {
            return {
                apiKey: this.get(KEYS.TTS_API_KEY) || '',
                appId: this.get(KEYS.TTS_APP_ID) || '',
                accessKey: this.get(KEYS.TTS_ACCESS_KEY) || '',
            };
        },

        /** Save TTS config */
        setTtsConfig(config) {
            if (config.apiKey !== undefined) this.set(KEYS.TTS_API_KEY, config.apiKey);
            if (config.appId !== undefined) this.set(KEYS.TTS_APP_ID, config.appId);
            if (config.accessKey !== undefined) this.set(KEYS.TTS_ACCESS_KEY, config.accessKey);
        },

        /** Get TTS language preference ('zh' or 'ja') */
        getTtsLanguage() {
            return this.get(KEYS.TTS_LANGUAGE) || 'zh';
        },

        /** Set TTS language preference */
        setTtsLanguage(lang) {
            this.set(KEYS.TTS_LANGUAGE, lang);
        },

        /** Get TTS proxy URL */
        getTtsProxyUrl() {
            return this.get(KEYS.TTS_PROXY_URL) || '';
        },

        /** Set TTS proxy URL */
        setTtsProxyUrl(url) {
            this.set(KEYS.TTS_PROXY_URL, url || '');
        },

        /** Get character voice IDs config — { characterId: { zh: 'S_xxx', ja: 'S_yyy' }, ... } */
        getCharacterVoices() {
            return this.get(KEYS.TTS_CHARACTER_VOICES) || {};
        },

        /**
         * 从 IndexedDB 备份恢复配置（localStorage 被浏览器清理时调用）。
         * 仅当 localStorage 中该 key 为空时才写回，避免覆盖用户手动修改的新值。
         */
        async restoreFromBackup(keys) {
            const list = Array.isArray(keys) ? keys : Object.keys(KEYS);
            for (const k of list) {
                try {
                    if (localStorage.getItem(key(k)) !== null) continue; // 已有值，跳过
                    const backed = await idbRead(k);
                    if (backed !== null && backed !== undefined) {
                        this.set(k, backed);
                    }
                } catch (e) {}
            }
        },

        /** Save character voice IDs config */
        setCharacterVoices(voices) {
            // 清理空值：去除所有空语言的条目
            const cleaned = {};
            for (const [charId, langs] of Object.entries(voices)) {
                const entry = {};
                if (langs.zh && langs.zh.trim()) entry.zh = langs.zh.trim();
                if (langs.ja && langs.ja.trim()) entry.ja = langs.ja.trim();
                if (Object.keys(entry).length > 0) cleaned[charId] = entry;
            }
            this.set(KEYS.TTS_CHARACTER_VOICES, cleaned);
        },

        KEYS,
    };
})();

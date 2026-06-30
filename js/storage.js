/* ============================================================
   storage.js — localStorage wrapper for settings & history
   ============================================================ */

const Storage = (() => {
    const PREFIX = 'arknights_chat_';

    const KEYS = {
        API_KEY: 'api_key',
        API_BASE: 'api_base',
        API_MODEL: 'api_model',
        ACTIVE_CHAR: 'active_character',
        VOLUME: 'volume',
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

        KEYS,
    };
})();

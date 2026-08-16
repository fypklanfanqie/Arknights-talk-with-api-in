/* ============================================================
   chatBackground.js — 自定义聊天背景图片管理
   - 配置（enabled + 图片 key 列表）存 localStorage
   - 图片 blob 存 IndexedDB
   - getEffectiveUrls() 返回生效的图片 URL 列表（自定义或内置回退）
   移植自安卓版 ChatBackgroundRepository（enabled + paths[]，最多 20 张，8 秒轮播）
   ============================================================ */

const ChatBackground = (() => {
    const DB_NAME = 'arknights_chat_backgrounds';
    const STORE = 'images';
    const KEY_ENABLED = 'arknights_chat_bg_enabled';
    const KEY_PATHS = 'arknights_chat_bg_paths';
    const MAX_BACKGROUNDS = 20;

    let enabled = false;
    let paths = [];          // IndexedDB 键列表（'bg_<ts>'）
    let urls = {};           // 键 → object URL（会话内有效）

    /* ---------- IndexedDB 封装 ---------- */
    function openDB() {
        return new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') {
                reject(new Error('IndexedDB 不可用'));
                return;
            }
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    db.createObjectStore(STORE);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    function idbGet(db, key) {
        return new Promise((resolve, reject) => {
            try {
                const tx = db.transaction(STORE, 'readonly');
                const req = tx.objectStore(STORE).get(key);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error);
            } catch (e) { reject(e); }
        });
    }

    function idbPut(db, key, blob) {
        return new Promise((resolve, reject) => {
            try {
                const tx = db.transaction(STORE, 'readwrite');
                tx.objectStore(STORE).put(blob, key);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            } catch (e) { reject(e); }
        });
    }

    function idbDelete(db, key) {
        return new Promise((resolve) => {
            try {
                const tx = db.transaction(STORE, 'readwrite');
                tx.objectStore(STORE).delete(key);
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            } catch (e) { resolve(); }
        });
    }

    /* ---------- 配置读写 ---------- */
    function readConfig() {
        try {
            const e = localStorage.getItem(KEY_ENABLED);
            enabled = e === 'true';
        } catch { enabled = false; }
        try {
            const raw = localStorage.getItem(KEY_PATHS);
            paths = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(paths)) paths = [];
        } catch { paths = []; }
    }

    function writeConfig() {
        try {
            localStorage.setItem(KEY_ENABLED, String(enabled));
            localStorage.setItem(KEY_PATHS, JSON.stringify(paths));
        } catch (e) {
            console.warn('ChatBackground: 保存配置失败', e);
        }
    }

    function revokeAll() {
        for (const k of Object.keys(urls)) {
            const u = urls[k];
            if (u && u.startsWith('blob:')) URL.revokeObjectURL(u);
        }
        urls = {};
    }

    /* ---------- 公共 API ---------- */
    /** 加载配置并解析图片（App.init 时调用） */
    async function load() {
        readConfig();
        let db = null;
        try {
            db = await openDB();
        } catch (e) {
            console.warn('ChatBackground: IndexedDB 不可用，自定义背景不可用', e);
        }
        revokeAll();
        for (const key of paths) {
            if (db) {
                try {
                    const blob = await idbGet(db, key);
                    if (blob) urls[key] = URL.createObjectURL(blob);
                } catch { /* 跳过坏项 */ }
            }
        }
        return { enabled, paths: paths.slice() };
    }

    function isEnabled() { return enabled; }

    function setEnabled(value) {
        enabled = !!value;
        writeConfig();
    }

    /** 添加多张背景图（File[]），超出上限丢弃最旧的 */
    async function addFiles(files) {
        const list = Array.from(files || []).filter(f => f && f.type && f.type.startsWith('image/'));
        if (list.length === 0) throw new Error('请选择图片文件');
        let db = null;
        try {
            db = await openDB();
        } catch (e) {
            throw new Error('IndexedDB 不可用，无法保存背景图');
        }
        for (const file of list) {
            const key = 'bg_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
            await idbPut(db, key, file);
            paths.push(key);
            urls[key] = URL.createObjectURL(file);
        }
        // 超出上限截断（删最旧）
        while (paths.length > MAX_BACKGROUNDS) {
            const old = paths.shift();
            try { await idbDelete(db, old); } catch {}
            const u = urls[old];
            if (u && u.startsWith('blob:')) URL.revokeObjectURL(u);
            delete urls[old];
        }
        writeConfig();
        return paths.slice();
    }

    /** 删除一张背景图 */
    async function remove(key) {
        const idx = paths.indexOf(key);
        if (idx < 0) return;
        paths.splice(idx, 1);
        try {
            const db = await openDB();
            await idbDelete(db, key);
        } catch (e) {
            console.warn('ChatBackground: 删除失败', e);
        }
        const u = urls[key];
        if (u && u.startsWith('blob:')) URL.revokeObjectURL(u);
        delete urls[key];
        writeConfig();
    }

    /** 清空全部自定义背景 */
    async function clearAll() {
        let db = null;
        try {
            db = await openDB();
        } catch {}
        for (const key of paths.slice()) {
            if (db) { try { await idbDelete(db, key); } catch {} }
        }
        paths = [];
        revokeAll();
        writeConfig();
    }

    /** 生效的图片 URL 列表：自定义开启且有图时返回自定义，否则返回 null（调用方回退内置轮播） */
    function getEffectiveUrls() {
        if (!enabled || paths.length === 0) return null;
        const out = [];
        for (const key of paths) {
            if (urls[key]) out.push(urls[key]);
        }
        return out.length > 0 ? out : null;
    }

    /** 当前配置（用于设置面板渲染） */
    function getConfig() {
        return {
            enabled,
            paths: paths.slice(),
            urls: paths.map(k => urls[k] || null),
        };
    }

    return {
        load, isEnabled, setEnabled, addFiles, remove, clearAll,
        getEffectiveUrls, getConfig,
    };
})();

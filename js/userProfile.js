/* ============================================================
   userProfile.js — 我的形象设置（博士档案）
   - 元数据（昵称 / 人设 / 关系）存 localStorage
   - 头像图片存 IndexedDB blob
   - getDirectiveText() 生成注入 system prompt 的「用户信息」块
   移植自安卓版 UserProfileConfig（avatarPath / persona / relationship）
   ============================================================ */

const UserProfile = (() => {
    const META_KEY = 'arknights_chat_user_profile';
    const DB_NAME = 'arknights_user_profile';
    const STORE = 'assets';
    const AVATAR_KEY = 'avatar';

    let meta = {
        nickname: '',      // 昵称（默认显示「博士」）
        persona: '',       // 人设（我是谁）
        relationship: '',  // 与角色之间的关系
        avatarMode: 'none', // 'none' | 'url' | 'blob'
        avatarUrl: '',     // 仅 url 模式
    };
    let avatarObjectUrl = null; // blob 模式解析出的 object URL

    /* ---------- IndexedDB 封装（与 customCharacters.js 同款模式） ---------- */
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

    /* ---------- 元数据读写 ---------- */
    function readMeta() {
        try {
            const raw = localStorage.getItem(META_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                return Object.assign({}, meta, parsed);
            }
        } catch (e) {
            console.warn('UserProfile: 读取档案失败', e);
        }
        return Object.assign({}, meta);
    }

    function writeMeta() {
        try {
            const toSave = Object.assign({}, meta);
            // 持久化时不带 blob 解析出的 object URL
            delete toSave.avatarObjectUrl;
            localStorage.setItem(META_KEY, JSON.stringify(toSave));
        } catch (e) {
            console.warn('UserProfile: 保存档案失败', e);
        }
    }

    function revokeAvatar() {
        if (avatarObjectUrl) {
            URL.revokeObjectURL(avatarObjectUrl);
            avatarObjectUrl = null;
        }
    }

    /* ---------- 公共 API ---------- */
    /** 加载档案（App.init 时调用），返回 meta */
    async function load() {
        meta = readMeta();
        if (meta.avatarMode === 'blob') {
            try {
                const db = await openDB();
                const blob = await idbGet(db, AVATAR_KEY);
                if (blob) {
                    revokeAvatar();
                    avatarObjectUrl = URL.createObjectURL(blob);
                } else {
                    meta.avatarMode = 'none';
                    writeMeta();
                }
            } catch (e) {
                console.warn('UserProfile: 头像加载失败', e);
                meta.avatarMode = 'none';
            }
        }
        return meta;
    }

    /** 保存文本档案字段（nickname/persona/relationship，可缺省） */
    function saveText(updates) {
        if (updates.nickname !== undefined) meta.nickname = (updates.nickname || '').trim();
        if (updates.persona !== undefined) meta.persona = (updates.persona || '').trim();
        if (updates.relationship !== undefined) meta.relationship = (updates.relationship || '').trim();
        writeMeta();
    }

    /** 上传/替换头像（File 或 Blob） */
    async function setAvatar(file) {
        if (!file) throw new Error('未选择文件');
        try {
            const db = await openDB();
            await idbPut(db, AVATAR_KEY, file);
        } catch (e) {
            throw new Error('头像保存失败: ' + e.message);
        }
        revokeAvatar();
        avatarObjectUrl = URL.createObjectURL(file);
        meta.avatarMode = 'blob';
        meta.avatarUrl = '';
        writeMeta();
        return avatarObjectUrl;
    }

    /** 移除头像 */
    async function clearAvatar() {
        revokeAvatar();
        meta.avatarMode = 'none';
        meta.avatarUrl = '';
        writeMeta();
        try {
            const db = await openDB();
            await idbDelete(db, AVATAR_KEY);
        } catch (e) {
            console.warn('UserProfile: 删除头像失败', e);
        }
    }

    /** 生成注入 system prompt 的「用户信息」指令块（安卓 toDirectiveText 移植） */
    function getDirectiveText() {
        const p = (meta.persona || '').trim();
        const r = (meta.relationship || '').trim();
        if (!p && !r) return '';
        let out = '\n[用户信息] 用户是罗德岛的博士。';
        if (p) out += '人设：' + p + '。';
        if (r) out += '博士与你的关系：' + r + '。';
        out += '请在对话中自然体现以上设定。';
        return out;
    }

    /** 当前头像可显示 URL（无则 null） */
    function getAvatarUrl() {
        if (meta.avatarMode === 'url') return meta.avatarUrl || null;
        return avatarObjectUrl;
    }

    /** 展示昵称（默认博士） */
    function getNickname() {
        return (meta.nickname || '').trim() || '博士';
    }

    function getProfile() {
        return Object.assign({}, meta);
    }

    return {
        load, saveText, setAvatar, clearAvatar,
        getDirectiveText, getAvatarUrl, getNickname, getProfile,
    };
})();

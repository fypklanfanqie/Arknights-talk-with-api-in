/* ============================================================
   customCharacters.js — 自定义导入角色管理
   - 二进制素材（选择立绘 / live2d 区立绘 / 点击语音）存 IndexedDB
   - 元数据（名字 / prompt / 音色码 / URL / 资源模式）存 localStorage
   - load() 时把自定义角色并入 window.ARKNIGHTS_CHARACTERS，
     使 chat.js / TTS 音色下拉 / 移动端下拉自动包含自定义角色
   ============================================================ */

const CustomCharacters = (() => {
    const META_KEY = 'arknights_chat_custom_characters';
    const DB_NAME = 'arknights_custom_chars';
    const STORE = 'assets';
    const ASSET_TYPES = ['select', 'live2d', 'voice'];

    // 内存中已解析的资源 URL（object URL 或外链），仅会话内有效
    let resolved = {};   // { [charId]: { select, live2d, voice } }
    let metas = [];      // 元数据数组（持久化到 localStorage）

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
                tx.onerror = () => resolve(); // 删除失败不阻断
            } catch (e) { resolve(); }
        });
    }

    /* ---------- Blob <-> dataURL(base64) ---------- */
    function blobToDataURL(blob) {
        return new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result);
            fr.onerror = () => reject(fr.error);
            fr.readAsDataURL(blob);
        });
    }

    function dataURLToBlob(dataURL) {
        const [head, b64] = dataURL.split(',');
        const mime = (head.match(/:(.*?);/) || [])[1] || 'application/octet-stream';
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return new Blob([arr], { type: mime });
    }

    /* ---------- localStorage 元数据 ---------- */
    function readMetas() {
        try {
            const raw = localStorage.getItem(META_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }

    function writeMetas() {
        try {
            localStorage.setItem(META_KEY, JSON.stringify(metas));
        } catch (e) {
            console.warn('保存自定义角色元数据失败:', e);
            throw e;
        }
    }

    /* ---------- 并入全局角色表 ---------- */
    function mergeIntoGlobal(meta) {
        if (!window.ARKNIGHTS_CHARACTERS) window.ARKNIGHTS_CHARACTERS = {};
        window.ARKNIGHTS_CHARACTERS[meta.id] = {
            name: meta.name,
            code: meta.code || '',
            role: meta.role || '',
            race: meta.race || '',
            systemPrompt: meta.systemPrompt || '',
            _custom: true,
        };
    }

    function unmergeFromGlobal(id) {
        if (window.ARKNIGHTS_CHARACTERS) delete window.ARKNIGHTS_CHARACTERS[id];
    }

    /* ---------- 资源 URL 解析 ---------- */
    function resolveAssets(db, meta) {
        const out = {};
        const jobs = [];
        for (const type of ASSET_TYPES) {
            const a = meta[type];
            if (!a || a.mode === 'none') { out[type] = null; continue; }
            if (a.mode === 'url') {
                out[type] = a.url || null;
            } else if (a.mode === 'blob') {
                // 先从 IndexedDB 取 blob → object URL
                jobs.push(
                    idbGet(db, meta.id + ':' + type).then(blob => {
                        out[type] = blob ? URL.createObjectURL(blob) : null;
                    }).catch(() => { out[type] = null; })
                );
            }
        }
        return Promise.all(jobs).then(() => out);
    }

    /* ---------- 公共 API ---------- */
    async function load() {
        metas = readMetas();
        let db = null;
        try {
            db = await openDB();
        } catch (e) {
            console.warn('CustomCharacters: IndexedDB 打开失败，仅使用 URL 模式素材', e);
        }
        resolved = {};
        for (const meta of metas) {
            mergeIntoGlobal(meta);
            if (db) {
                try {
                    resolved[meta.id] = await resolveAssets(db, meta);
                } catch {
                    resolved[meta.id] = {};
                }
            } else {
                // 无 IndexedDB：仅 URL 模式可用
                resolved[meta.id] = {};
                for (const type of ASSET_TYPES) {
                    const a = meta[type];
                    resolved[meta.id][type] = (a && a.mode === 'url') ? a.url : null;
                }
            }
        }
        return metas;
    }

    function list() {
        return metas.slice();
    }

    function get(id) {
        return metas.find(m => m.id === id) || null;
    }

    function isCustom(id) {
        return !!get(id);
    }

    /**
     * 保存（新建或更新）一个自定义角色。
     * def 结构：
     * {
     *   id?, name, code?, role?, race?, systemPrompt,
     *   voiceZh?, voiceJa?, subtitleJp?, subtitleCn?,
     *   select:{mode,url?,file?}, live2d:{...}, voice:{...}
     * }
     */
    async function save(def) {
        const isNew = !def.id || !get(def.id);
        const id = def.id || ('custom_' + Date.now() + '_' + Math.floor(Math.random() * 1000));
        const meta = {
            id,
            name: (def.name || '').trim(),
            code: (def.code || '').trim(),
            role: (def.role || '').trim(),
            race: (def.race || '').trim(),
            systemPrompt: (def.systemPrompt || '').trim(),
            voiceZh: (def.voiceZh || '').trim(),
            voiceJa: (def.voiceJa || '').trim(),
            subtitleJp: (def.subtitleJp || '').trim(),
            subtitleCn: (def.subtitleCn || '').trim(),
            createdAt: def.createdAt || Date.now(),
            select: normalizeAsset(def.select),
            live2d: normalizeAsset(def.live2d),
            voice: normalizeAsset(def.voice),
        };

        if (!meta.name || !meta.systemPrompt) {
            throw new Error('角色名称与系统提示词为必填项');
        }

        // 持久化元数据（去掉 File 对象）
        if (isNew) {
            metas.push(meta);
        } else {
            const idx = metas.findIndex(m => m.id === id);
            metas[idx] = meta;
        }
        writeMetas();
        mergeIntoGlobal(meta);

        // 写入 IndexedDB（blob 模式携带 File）
        let db = null;
        try {
            db = await openDB();
        } catch (e) {
            console.warn('CustomCharacters: IndexedDB 不可用，blob 素材不会被持久化', e);
        }
        if (!resolved[id]) resolved[id] = {};
        const urlOut = { select: null, live2d: null, voice: null };

        for (const type of ASSET_TYPES) {
            const a = meta[type];
            if (a.mode === 'url') {
                urlOut[type] = a.url || null;
            } else if (a.mode === 'blob' && a.file) {
                if (db) await idbPut(db, id + ':' + type, a.file);
                urlOut[type] = URL.createObjectURL(a.file);
            } else if (a.mode === 'blob' && !a.file) {
                // 编辑但未改文件：沿用已解析的 object URL
                urlOut[type] = (resolved[id] && resolved[id][type]) || null;
            } else {
                urlOut[type] = null;
            }
        }
        resolved[id] = urlOut;
        return id;
    }

    function normalizeAsset(a) {
        if (!a || !a.mode || a.mode === 'none') return { mode: 'none' };
        if (a.mode === 'url') return { mode: 'url', url: (a.url || '').trim() };
        return { mode: 'blob', file: a.file || null };
    }

    async function remove(id) {
        const meta = get(id);
        if (!meta) return;
        metas = metas.filter(m => m.id !== id);
        writeMetas();
        unmergeFromGlobal(id);

        // 撤销 object URL
        if (resolved[id]) {
            for (const type of ASSET_TYPES) {
                const u = resolved[id][type];
                if (u && u.startsWith('blob:')) URL.revokeObjectURL(u);
            }
            delete resolved[id];
        }

        // 删除 IndexedDB blob
        try {
            const db = await openDB();
            for (const type of ASSET_TYPES) await idbDelete(db, id + ':' + type);
        } catch (e) {
            console.warn('CustomCharacters: 删除 blob 失败', e);
        }
    }

    /* ---------- Getter（供其他模块调用，返回可直接用于 src 的字符串或 null） ---------- */
    function getSelectImg(id) {
        return (resolved[id] && resolved[id].select) || null;
    }
    function getLive2dImg(id) {
        return (resolved[id] && resolved[id].live2d) || null;
    }
    function getVoiceUrl(id) {
        return (resolved[id] && resolved[id].voice) || null;
    }
    function getVoiceLine(id) {
        const m = get(id);
        if (!m) return null;
        if (!m.subtitleJp && !m.subtitleCn) return null;
        return { jp: m.subtitleJp || '', cn: m.subtitleCn || '' };
    }
    function getVoiceCodes(id) {
        const m = get(id);
        if (!m) return null;
        if (!m.voiceZh && !m.voiceJa) return null;
        return { zh: m.voiceZh || '', ja: m.voiceJa || '' };
    }

    /* ---------- JSON 导出 / 导入（备份与分享） ---------- */
    async function exportJSON(id) {
        const meta = get(id);
        if (!meta) throw new Error('未找到角色');
        const pkg = {
            _type: 'arknights_custom_character',
            version: 1,
            meta: {
                name: meta.name, code: meta.code, role: meta.role, race: meta.race,
                systemPrompt: meta.systemPrompt, voiceZh: meta.voiceZh, voiceJa: meta.voiceJa,
                subtitleJp: meta.subtitleJp, subtitleCn: meta.subtitleCn,
                select: meta.select, live2d: meta.live2d, voice: meta.voice,
            },
            assets: {},
        };
        try {
            const db = await openDB();
            for (const type of ASSET_TYPES) {
                const a = meta[type];
                if (a.mode === 'url') {
                    pkg.assets[type] = { mode: 'url', url: a.url };
                } else if (a.mode === 'blob') {
                    const blob = await idbGet(db, id + ':' + type);
                    if (blob) pkg.assets[type] = { mode: 'blob', dataURL: await blobToDataURL(blob) };
                }
            }
        } catch (e) {
            console.warn('导出素材读取失败，仅导出元信息', e);
        }
        return pkg;
    }

    async function importJSON(pkg) {
        if (!pkg || !pkg.meta) throw new Error('JSON 格式不正确');
        const m = pkg.meta;
        const def = {
            name: m.name, code: m.code, role: m.role, race: m.race,
            systemPrompt: m.systemPrompt, voiceZh: m.voiceZh, voiceJa: m.voiceJa,
            subtitleJp: m.subtitleJp, subtitleCn: m.subtitleCn,
        };
        const assets = pkg.assets || {};
        for (const type of ASSET_TYPES) {
            const a = assets[type];
            if (a && a.mode === 'url') {
                def[type] = { mode: 'url', url: a.url };
            } else if (a && a.mode === 'blob' && a.dataURL) {
                // 转回 Blob，作为新文件写入（保存时落 IndexedDB）
                def[type] = { mode: 'blob', file: dataURLToBlob(a.dataURL) };
            } else if (m[type] && m[type].mode === 'url') {
                def[type] = { mode: 'url', url: m[type].url };
            } else {
                def[type] = { mode: 'none' };
            }
        }
        return await save(def);
    }

    return {
        load, list, get, isCustom, save, remove,
        getSelectImg, getLive2dImg, getVoiceUrl, getVoiceLine, getVoiceCodes,
        exportJSON, importJSON,
    };
})();

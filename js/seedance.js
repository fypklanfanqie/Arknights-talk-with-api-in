/* ============================================================
   seedance.js — Seedance 对话视频生成（火山方舟 / 中转站 双协议）
   - 配置（地址/密钥/模型/分辨率/时长等）存 localStorage
   - 任务元数据存 localStorage，成品视频存 IndexedDB
   - 状态机移植自安卓版 SeedancePipelineCoordinator（20 状态简化版）
   - 安全不变量：POST 绝不自动重发（歧义需用户确认，防重复计费）
   ============================================================ */

const SeedanceVideo = (() => {
    const CFG_KEY = 'arknights_chat_seedance_config';
    const TASKS_KEY = 'arknights_chat_seedance_tasks';
    const DB_NAME = 'arknights_seedance';
    const STORE = 'assets';
    const VIDEO_STORE = 'videos';

    /* ---------- 默认配置（对齐安卓 SeedanceConfig） ---------- */
    const DEFAULTS = {
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        apiKey: '',
        relayModelId: 'kwvideo-v2-ref',
        variant: 'STANDARD',          // STANDARD | FAST
        resolution: 'P720',           // P480|P720|P1080|P4K
        ratio: '9:16',                // 9:16|16:9|1:1|3:4|4:3|21:9|adaptive
        durationSeconds: 5,           // 4-15
        watermark: false,
        sceneDescription: '',
        backgroundMode: 'none',       // none|blob|url
        backgroundUrl: '',
    };
    const MODEL_IDS = {
        STANDARD: 'doubao-seedance-2-0-260128',
        FAST: 'doubao-seedance-2-0-fast-260128',
    };
    const RESOLUTION_VALUES = { P480: '480p', P720: '720p', P1080: '1080p', P4K: '4k' };
    const POLL_INTERVAL_MS = 10000;
    const URL_TTL_MS = 24 * 60 * 60 * 1000;
    const MIN_DESCRIPTION_LENGTH = 100;
    const MAX_AUTO_RETRIES = 5;
    const BASE_BACKOFF_MS = 15000;
    const MAX_BACKOFF_MS = 5 * 60 * 1000;
    const REF_MAX_BYTES = 30 * 1024 * 1024;
    const RELAY_REF_MAX_BYTES = 10 * 1024 * 1024;
    const REF_MIN_SIDE = 300;
    const REF_MAX_SIDE = 6000;

    let config = Object.assign({}, DEFAULTS);
    let tasks = [];
    let backgroundBlobUrl = null;   // 背景图 object URL（会话内）
    let videoUrls = {};             // taskId → object URL
    let pollTimers = {};            // taskId → setTimeout

    /* ============================================================
       IndexedDB 封装
       ============================================================ */
    function openDB() {
        return new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB 不可用')); return; }
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
                if (!db.objectStoreNames.contains(VIDEO_STORE)) db.createObjectStore(VIDEO_STORE);
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
    function idbGet(db, store, key) {
        return new Promise((resolve, reject) => {
            try {
                const tx = db.transaction(store, 'readonly');
                const req = tx.objectStore(store).get(key);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error);
            } catch (e) { reject(e); }
        });
    }
    function idbPut(db, store, key, blob) {
        return new Promise((resolve, reject) => {
            try {
                const tx = db.transaction(store, 'readwrite');
                tx.objectStore(store).put(blob, key);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            } catch (e) { reject(e); }
        });
    }
    function idbDelete(db, store, key) {
        return new Promise((resolve) => {
            try {
                const tx = db.transaction(store, 'readwrite');
                tx.objectStore(store).delete(key);
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            } catch (e) { resolve(); }
        });
    }

    /* ============================================================
       配置读写
       ============================================================ */
    function readConfig() {
        try {
            const raw = localStorage.getItem(CFG_KEY);
            if (raw) config = Object.assign({}, DEFAULTS, JSON.parse(raw));
        } catch (e) {
            console.warn('Seedance: 配置读取失败', e);
        }
        return config;
    }

    function saveConfig(updates) {
        config = Object.assign({}, config, updates || {});
        try {
            localStorage.setItem(CFG_KEY, JSON.stringify(config));
        } catch (e) {
            console.warn('Seedance: 配置保存失败', e);
        }
        return config;
    }

    function getConfig() { return Object.assign({}, config); }

    function hasConfig() {
        return !!(config.apiKey && config.baseUrl);
    }

    /** 协议识别：含 /media/generate → 中转站；否则方舟 */
    function protocolFor(baseUrl) {
        const b = (baseUrl || '').toLowerCase();
        if (b.includes('/media/generate')) return 'relay';
        const relayHosts = ['api.lk888.ai', 'api.lingkeai.ai', 'dm1124.com', 'lingkeai.vip'];
        const host = (baseUrl || '').replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
        if (relayHosts.includes(host) && !/[a-z0-9]+\.(?:com|ai|vip)\/[^/]/.test(b)) return 'relay';
        return 'ark';
    }

    function resolveTaskEndpoint(baseUrl) {
        const b = String(baseUrl || '').replace(/\/+$/, '');
        const proto = protocolFor(b);
        if (proto === 'relay') {
            if (b.includes('/media/generate')) return b;
            if (/\/v\d+$/.test(b)) return b + '/media/generate';
            if (/^https?:\/\/[^/]+$/.test(b)) return b + '/v1/media/generate';
            return b + '/v1/media/generate';
        }
        // 方舟
        if (b.endsWith('/contents/generations/tasks')) return b;
        if (/\/v\d+$/.test(b) || /\/api\/v\d+$/.test(b) || /\/api$/.test(b) || /^https?:\/\/[^/]+$/.test(b)) {
            return b + '/contents/generations/tasks';
        }
        return b + '/contents/generations/tasks';
    }

    /* ============================================================
       任务存储
       ============================================================ */
    function readTasks() {
        try {
            const raw = localStorage.getItem(TASKS_KEY);
            tasks = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(tasks)) tasks = [];
        } catch { tasks = []; }
        return tasks;
    }

    function writeTasks() {
        try {
            localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
        } catch (e) {
            console.warn('Seedance: 任务保存失败', e);
        }
    }

    function getTask(id) { return tasks.find(t => t.id === id) || null; }

    function updateTask(id, patch) {
        const t = getTask(id);
        if (!t) return null;
        Object.assign(t, patch, { updatedAt: Date.now() });
        writeTasks();
        return t;
    }

    function deleteTask(id) {
        tasks = tasks.filter(t => t.id !== id);
        writeTasks();
        if (pollTimers[id]) { clearTimeout(pollTimers[id]); delete pollTimers[id]; }
        const u = videoUrls[id];
        if (u && u.startsWith('blob:')) URL.revokeObjectURL(u);
        delete videoUrls[id];
    }

    /** 加载会话内的视频 URL（App.init 时调用） */
    async function load() {
        readConfig();
        readTasks();
        let db = null;
        try { db = await openDB(); } catch (e) { console.warn('Seedance: IndexedDB 不可用', e); }
        for (const t of tasks) {
            if (t.state === 'READY' && db) {
                try {
                    const blob = await idbGet(db, VIDEO_STORE, t.id);
                    if (blob) videoUrls[t.id] = URL.createObjectURL(blob);
                } catch {}
            }
        }
        // 恢复进行中的任务（中断恢复语义）
        const recoverable = tasks.filter(t => ['PROMPT_PENDING', 'SUBMISSION_PENDING', 'QUEUED', 'RUNNING', 'DOWNLOAD_PENDING']
            .includes(t.state));
        recoverable.forEach(t => scheduleRun(t.id, 0));
        return tasks;
    }

    /* ============================================================
       参考图处理：URL → Blob → 校验 → 压缩 → dataURL
       ============================================================ */
    function fetchBlob(url) {
        return fetch(url, { mode: 'cors' }).then(r => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.blob();
        });
    }

    /** 图片校验与压缩（对齐 SeedanceReferenceStore：>300 且 <6000、宽高比 0.4-2.5、<30MB） */
    async function prepareImage(blob, maxBytes) {
        const limit = maxBytes || REF_MAX_BYTES;
        if (blob.size >= limit) throw new Error('参考图不能超过 ' + Math.round(limit / 1024 / 1024) + 'MB');
        const mimeOk = /image\/(jpeg|png|webp|bmp|gif)/.test(blob.type || '');
        if (!mimeOk && !/\.(jpe?g|png|webp|bmp|gif)$/i.test(blob.name || '')) {
            throw new Error('参考图格式不支持（仅支持 JPG/PNG/WebP/BMP/GIF）');
        }

        const dataUrl = await blobToDataURL(blob);
        // 读取尺寸
        let width = 0, height = 0;
        try {
            const dims = await readImageSize(dataUrl);
            width = dims.width; height = dims.height;
        } catch { /* 读取失败不阻断，由服务端判定 */ }

        if (width && height) {
            const short = Math.min(width, height);
            const long = Math.max(width, height);
            const aspect = width / height;
            if (short <= REF_MIN_SIDE) throw new Error('参考图单边像素需大于 ' + REF_MIN_SIDE);
            if (long >= REF_MAX_SIDE) throw new Error('参考图单边像素需小于 ' + REF_MAX_SIDE);
            if (aspect < 0.4 || aspect > 2.5) throw new Error('参考图宽高比需在 0.4-2.5 之间');
        }
        return dataUrl;
    }

    function blobToDataURL(blob) {
        return new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result);
            fr.onerror = () => reject(fr.error);
            fr.readAsDataURL(blob);
        });
    }

    function readImageSize(dataUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
            img.onerror = () => reject(new Error('图片解析失败'));
            img.src = dataUrl;
        });
    }

    /* ============================================================
       分镜提示词生成（移植 SeedancePromptGenerator）
       ============================================================ */
    const DIRECTOR_SYSTEM = `你是资深 Seedance 视频分镜导演。根据角色设定、前情对话与本次对话，生成一段可直接用于视频生成的详细中文分镜提示词。

硬性要求：
1. 本次视频必须直接演绎「角色回复」这句话：画面就是角色正在说出这句话的瞬间——动作、手势、神态、口型与情绪都要与这句话的内容逐句对应；回复中提到的事物、场景、事件必须真实出现在画面里（例如回复提到"下雨"，画面就要下雨；提到"递来一杯茶"，就要有递茶的动作）。禁止编造与本次对话无关的剧情。
2. 全片只有一个可见角色，即当前角色本人；不得出现第二人、路人或其他人物（仅允许环境中的非人物元素）。角色外貌、服装、发型、配饰在全片保持完全一致（身份与服饰连续性），并且必须与参考人设图（第 1 张参考图 = 角色形象图）完全一致。
3. 外貌与服装必须写足细节：从「角色设定」中提炼发色、发型、瞳色、服装款式与颜色、配饰、体型、气质等，写成至少 60 字的完整描述填入 appearance 字段；设定未提及的细节可合理补全，但不得与设定矛盾，也不得因此引入第二个人。
4. 环境（environment）按参考图角色映射确定：若提供了第 2 张参考图（背景场景图），必须严格以它为准，地点/时间/天气/氛围与之完全一致，不得凭空改换；没有第 2 张参考图时，优先严格采用「场景补充」（文字），仍无则根据对话内容推断具体地点/时间/天气/氛围。
5. 动作要有电影感与连贯运动感（cinematic motion），写成完整连贯的运动过程并按需分阶段描述（是否分阶段、分几阶段遵循第 9 条「时长适配」）；镜头语言明确（景别、运动方向）；光影与色调具体。
6. 视频必须包含原生声音与音效（native audio）：环境音、动作音效，以及角色说话时的语气与口型状态；音频描述需与画面动作一致。
7. 严格只输出一个 JSON 对象，不要输出任何解释或多余文字，不要输出思考过程。
8. 参考图角色映射（重要）：本次生成会按顺序附带参考图——第 1 张参考图固定为角色形象图（人物外貌/服装/发型/配饰的唯一依据），第 2 张参考图（若有）固定为背景场景图（环境/地点/时间/天气/氛围的唯一依据）。appearance 必须与第 1 张参考图一致，environment 必须与第 2 张参考图一致，绝不混淆两张图的用途。
9. 时长适配（重要）：动作、镜头与音效的编排数量必须与视频总时长严格匹配，视频越短越精简。具体秒数与该时长下的编排要求见用户消息「视频时长」小节：4-5 秒短片只能是单个连续瞬间，不得分多阶段展开；10-15 秒长片才可写成完整多阶段运动。禁止在短时长视频中堆砌多个动作阶段或多个场景。

JSON 字段（均为字符串，使用中文）：
- subject：画面主体（只能是当前这一个角色）
- appearance：角色外貌与服装的详细描述（至少 60 字）
- action：角色的动作与运动全过程（分阶段，如开场→发展→收尾）
- environment：环境与场景（具体到地点/时间/天气/氛围）
- camera：镜头与运镜（含景别与运动方向）
- lighting：光线与色调
- audio：原生声音、音效与角色说话状态
- continuity：身份与服饰连续性说明
- technical：技术参数（版本/分辨率/画幅/时长/音频，留空即可，由系统补全）
- finalPrompt：整合以上所有要素的最终成片提示词（留空即可，由系统补全）

质量红线：
- 除 technical 与 finalPrompt 外，每个字段必须写具体、写满（30 字以上，appearance 至少 60 字）；禁止空洞形容词（如"美丽""好看""帅气"）与短语拼接；
- finalPrompt 与 technical 可以留空，其余字段不得为空。`;

    function durationGuidance(seconds) {
        if (seconds <= 5) {
            return '4-5 秒的短片只能是一个连贯瞬间：动作写成单个连续动作（可含一句台词与伴随的小动作），不允许分多阶段展开、不允许出现多个场景或多次转场；镜头一镜到底或仅一次轻微运镜；音效只保留与当前动作直接相关的一两样。';
        }
        if (seconds <= 9) {
            return '6-9 秒的中短片是一个完整动作过程：最多两个自然阶段（开场到收尾），镜头允许一次景别变化，运镜简洁。';
        }
        return '10-15 秒的长片可以写成完整的两到三阶段运动（开场、发展、收尾），允许更丰富的运镜层次与音效编排。';
    }

    /**
     * 生成分镜（走主对话 LLM 配置，非流式）
     * 返回 { promptJson, finalPrompt }
     */
    async function generatePrompt(task, userText, assistantText) {
        const apiConfig = Storage.getApiConfig();
        if (!apiConfig.apiKey) throw new Error('请先配置对话 API Key（用于生成分镜）');

        const char = getCharacterMeta(task.characterId);
        // 前情：任务创建时已传入 context
        const ctx = task.promptContext || [];
        const recentContext = ctx.map(m =>
            (m.role === 'user' ? '用户：' : '角色：') + String(m.content || '').slice(0, 200)
        ).join('\n');

        const guidance = durationGuidance(config.durationSeconds);
        const hasBg = !!(task.backgroundImage && task.backgroundImage.dataUrl);
        let userMsg = '【角色信息】\n' +
            '角色名称：' + char.name + '\n' +
            '角色身份：' + (char.role || '罗德岛干员') + '\n' +
            '角色设定：' + String(char.systemPrompt || '').trim().slice(0, 800) + '\n';
        if (recentContext) {
            userMsg += '\n【前情对话】（用于理解本次对话的来龙去脉，视频只演绎「本次对话」）\n' +
                recentContext.slice(0, 1500) + '\n';
        }
        userMsg += '\n【本次对话】（视频要演绎的就是下面这条「角色回复」）\n' +
            '用户发言：' + String(userText || '').trim().slice(0, 500) + '\n' +
            '角色回复：' + String(assistantText || '').trim().slice(0, 1000) + '\n';
        userMsg += '\n【参考图】（生成视频时会按顺序附带，请据此理解画面）\n' +
            '第 1 张参考图 = 角色形象图：角色的外貌、服装、发型、配饰必须以它为准，appearance 与它完全一致。\n';
        if (hasBg) {
            userMsg += '第 2 张参考图 = 背景场景图：environment 必须以它为准，画面背景、地点、时间、天气、氛围与它一致，不得凭空改换。\n';
        }
        const sceneDesc = String(config.sceneDescription || '').trim().slice(0, 300);
        if (sceneDesc) {
            userMsg += '场景补充（文字，' + (hasBg ? '仅作环境细节参考，不得与背景参考图冲突' : 'environment 以此为依据') + '）：' + sceneDesc + '\n';
        }
        userMsg += '\n【视频时长】（动作、镜头与音效的编排数量必须与总时长严格匹配）\n' +
            '本次视频总时长为 ' + config.durationSeconds + ' 秒。' + guidance + '\n' +
            '\n请生成结构化视频提示词 JSON。';

        const response = await callChatOnce(apiConfig, [
            { role: 'system', content: DIRECTOR_SYSTEM },
            { role: 'user', content: userMsg },
        ]);

        // 解析 JSON：去 ```json 围栏，取首个 { 到最后一个 }
        const parsed = parsePromptJson(response);
        // 质量门禁
        if (!parsed.subject && !parsed.action && !parsed.environment) {
            throw new Error('分镜生成缺少关键要素');
        }
        const desc = [parsed.subject, parsed.appearance, parsed.action, parsed.environment,
                      parsed.camera, parsed.lighting, parsed.audio, parsed.continuity]
            .filter(s => s && String(s).trim())
            .map(s => String(s).trim())
            .join('；');
        if (desc.length < MIN_DESCRIPTION_LENGTH) {
            throw new Error('分镜描述过短（< ' + MIN_DESCRIPTION_LENGTH + ' 字），请重试');
        }

        // technical + finalPrompt 确定性覆盖
        const technical = '版本：' + (config.variant === 'FAST' ? '快速版' : '标准版') +
            '；分辨率：' + RESOLUTION_VALUES[config.resolution] +
            '；画幅：' + config.ratio + '；时长：' + config.durationSeconds + '秒；音频：开启';
        const referenceDirective = hasBg
            ? '角色形象以第 1 张参考图为准，背景场景以第 2 张参考图为准'
            : '角色形象以参考图为准';
        const finalPrompt = [referenceDirective, desc, technical].filter(Boolean).join('。');

        return { promptJson: parsed, finalPrompt };
    }

    function parsePromptJson(raw) {
        let text = String(raw || '');
        // 剥离 think
        text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        // 去围栏
        text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        const first = text.indexOf('{');
        const last = text.lastIndexOf('}');
        if (first < 0 || last <= first) throw new Error('分镜返回不是有效 JSON');
        text = text.slice(first, last + 1);
        const obj = JSON.parse(text);
        if (!obj || typeof obj !== 'object') throw new Error('分镜解析失败');
        return obj;
    }

    /** 非流式 OpenAI 兼容调用（分镜用） */
    async function callChatOnce(config_, messages) {
        const url = String(config_.baseUrl || '').replace(/\/$/, '') + '/chat/completions';
        const resp = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + config_.apiKey,
            },
            body: JSON.stringify({
                model: config_.model || 'gpt-4o',
                messages: messages,
                stream: false,
                temperature: 0.7,
                max_tokens: 2000,
            }),
        });
        if (!resp.ok) {
            const errText = await resp.text();
            let msg = 'HTTP ' + resp.status;
            try { msg = JSON.parse(errText).error?.message || msg; } catch {}
            throw new Error(msg);
        }
        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error('分镜 LLM 返回空内容');
        return content;
    }

    function getCharacterMeta(id) {
        const chars = (typeof window.ARKNIGHTS_CHARACTERS !== 'undefined') ? window.ARKNIGHTS_CHARACTERS : {};
        const c = chars[id] || {};
        return {
            id: id,
            name: c.name || id || '',
            role: c.role || '',
            systemPrompt: c.systemPrompt || '',
        };
    }

    /* ============================================================
       任务创建与触发
       ============================================================ */
    /** 手动触发：把角色图（+可选背景图）准备好后进入流程 */
    async function triggerManual(charId, userText, assistantText, assistantMessageId, conversationKey, context, triggerType) {
        if (!hasConfig()) {
            throw new Error('请先在设置中配置 Seedance 视频服务');
        }
        const task = {
            id: 'sv_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
            triggerType: triggerType === 'auto' ? 'auto' : 'manual',
            state: 'PROMPT_PENDING',
            characterId: charId,
            assistantMessageId: assistantMessageId || null,
            conversationKey: conversationKey || null,
            userText: String(userText || '').slice(0, 500),
            assistantText: String(assistantText || '').slice(0, 1000),
            promptContext: (context || []).slice(-8),
            promptBaseUrl: Storage.getApiConfig().baseUrl || '',
            promptModel: Storage.getApiConfig().model || '',
            characterImage: null,
            backgroundImage: null,
            promptJson: null,
            finalPrompt: null,
            remoteTaskId: null,
            remoteVideoUrl: null,
            remoteVideoUrlExpiresAt: null,
            errorStage: null,
            errorCode: null,
            errorMessage: null,
            requiresCostConfirmation: false,
            automaticRetryCount: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        tasks.push(task);
        writeTasks();
        scheduleRun(task.id, 0);
        return task;
    }

    /** 自动触发（回复完成后调用；调用方先判断开关与条件） */
    function triggerAuto(charId, userText, assistantText, assistantMessageId, conversationKey, context) {
        // 唯一约束：同一 assistantMessageId 只允许一条 auto 任务
        const dup = tasks.find(t => t.triggerType === 'auto' && t.assistantMessageId === assistantMessageId);
        if (dup) return dup;
        return triggerManual(charId, userText, assistantText, assistantMessageId, conversationKey, context, 'auto');
    }

    /* ============================================================
       状态机推进（异步循环 + 持久化）
       ============================================================ */
    function scheduleRun(taskId, delayMs) {
        if (pollTimers[taskId]) clearTimeout(pollTimers[taskId]);
        pollTimers[taskId] = setTimeout(() => {
            delete pollTimers[taskId];
            run(taskId).catch(err => {
                console.error('[Seedance] 任务推进异常', taskId, err);
            });
        }, Math.max(0, delayMs || 0));
    }

    async function run(taskId) {
        const task = getTask(taskId);
        if (!task) return;
        // 终态不再推进
        if (['READY', 'CANCELLED'].includes(task.state)) return;

        try {
            switch (task.state) {
                case 'PROMPT_PENDING': await stepPrompt(task); break;
                case 'SUBMISSION_PENDING': await stepSubmit(task); break;
                case 'QUEUED':
                case 'RUNNING':
                case 'CANCEL_REQUESTED': await stepPoll(task); break;
                case 'DOWNLOAD_PENDING': await stepDownload(task); break;
                case 'FAILED_PROMPT':
                case 'FAILED_SUBMISSION':
                case 'FAILED_REMOTE':
                case 'FAILED_QUERY':
                case 'FAILED_DOWNLOAD':
                case 'EXPIRED':
                    // 手动重试入口
                    break;
                default:
                    // FAILED_* / READY 等不再推进
                    break;
            }
        } catch (err) {
            console.error('[Seedance] 状态机异常', taskId, task.state, err);
            // 瞬时类错误有界退避重试（仅限可安全重试的步骤）
            const transient = isTransientError(err);
            if (transient && task.automaticRetryCount < MAX_AUTO_RETRIES) {
                task.automaticRetryCount++;
                writeTasks();
                const delay = Math.min(BASE_BACKOFF_MS * Math.pow(2, task.automaticRetryCount), MAX_BACKOFF_MS);
                scheduleRun(taskId, delay);
            } else {
                failTask(task, { stage: task.state, code: 'INTERNAL', message: err.message || '内部错误' });
            }
        }
    }

    function isTransientError(err) {
        const m = String(err && err.message ? err.message : '').toLowerCase();
        return /network|fetch|timeout|abort|temporar|繁忙|暂/i.test(m);
    }

    function failTask(task, info) {
        const stage = info.stage || 'PROMPT';
        const stateMap = {
            PROMPT: 'FAILED_PROMPT',
            SUBMIT: 'FAILED_SUBMISSION',
            REMOTE: 'FAILED_REMOTE',
            QUERY: 'FAILED_QUERY',
            DOWNLOAD: 'FAILED_DOWNLOAD',
        };
        updateTask(task.id, {
            state: stateMap[stage] || 'FAILED_SUBMISSION',
            errorStage: stage,
            errorCode: info.code || 'ERROR',
            errorMessage: info.message || '生成失败',
            requiresCostConfirmation: !!info.costConfirm,
        });
        notifyTaskChanged(task.id);
    }

    /* ---------- 各步骤 ---------- */
    async function stepPrompt(task) {
        // 配置变更门禁
        const api = Storage.getApiConfig();
        if (task.promptBaseUrl && task.promptBaseUrl !== (api.baseUrl || '')) {
            updateTask(task.id, { state: 'FAILED_PROMPT', errorStage: 'PROMPT', errorCode: 'CONFIG_CHANGED', errorMessage: '对话模型/服务地址已变更，请确认后重试' });
            notifyTaskChanged(task.id);
            return;
        }
        if (!api.apiKey) {
            updateTask(task.id, { state: 'FAILED_PROMPT', errorStage: 'PROMPT', errorCode: 'MISSING_API_KEY', errorMessage: '未配置对话 API Key，无法生成分镜' });
            notifyTaskChanged(task.id);
            return;
        }
        // 准备参考图（立绘 + 可选背景）
        try {
            const charImg = await prepareCharacterImage(task.characterId);
            let bgImg = null;
            if (config.backgroundMode !== 'none' || config.backgroundUrl) {
                bgImg = await prepareBackgroundImage();
            }
            updateTask(task.id, { characterImage: charImg, backgroundImage: bgImg });
        } catch (e) {
            failTask(task, { stage: 'PROMPT', code: 'SNAPSHOT_FAILED', message: '参考图准备失败：' + e.message });
            notifyTaskChanged(task.id);
            return;
        }

        // LLM 生成分镜（失败绝不重试二次调用 → 直接转 FAILED_PROMPT）
        try {
            const { promptJson, finalPrompt } = await generatePrompt(task, task.userText, task.assistantText);
            updateTask(task.id, { promptJson: promptJson, finalPrompt: finalPrompt, state: 'SUBMISSION_PENDING' });
            notifyTaskChanged(task.id);
            scheduleRun(task.id, 0); // 立即推进下一步
        } catch (e) {
            failTask(task, { stage: 'PROMPT', code: 'PROMPT_PARSE', message: '分镜生成失败：' + e.message });
            notifyTaskChanged(task.id);
        }
    }

    async function prepareCharacterImage(charId) {
        const portrait = (typeof GroupChat !== 'undefined' && GroupChat.resolvePortrait)
            ? GroupChat.resolvePortrait(charId)
            : null;
        if (!portrait) throw new Error('角色立绘缺失');
        let blob;
        try {
            blob = await fetchBlob(portrait);
        } catch (e) {
            // 兜底：<img> + canvas（同源/带 CORS 的图片可用）
            blob = await fetchBlobViaCanvas(portrait);
        }
        const dataUrl = await prepareImage(blob);
        return { dataUrl: dataUrl, mime: (blob.type || 'image/png') };
    }

    function fetchBlobViaCanvas(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    canvas.toBlob(b => {
                        if (b) resolve(b);
                        else reject(new Error('图片转换失败'));
                    }, 'image/png');
                } catch (e) {
                    reject(new Error('图片跨域不可读'));
                }
            };
            img.onerror = () => reject(new Error('立绘加载失败'));
            img.src = url;
        });
    }

    async function prepareBackgroundImage() {
        let blob = null;
        if (config.backgroundMode === 'blob' && backgroundBlobUrl) {
            try {
                blob = await fetchBlob(backgroundBlobUrl);
            } catch {}
        }
        if (!blob && config.backgroundUrl) {
            try { blob = await fetchBlob(config.backgroundUrl); } catch {}
        }
        if (!blob) return null;
        const dataUrl = await prepareImage(blob, RELAY_REF_MAX_BYTES);
        return { dataUrl: dataUrl, mime: (blob.type || 'image/png') };
    }

    async function stepSubmit(task) {
        if (!hasConfig()) {
            failTask(task, { stage: 'SUBMIT', code: 'NO_CONFIG', message: '未配置 Seedance 视频服务' });
            notifyTaskChanged(task.id);
            return;
        }
        const proto = protocolFor(config.baseUrl);
        try {
            const resp = await createRemoteTask(task, proto);
            if (resp.status === 'queued' || resp.status === 'running' || resp.status === 'succeeded') {
                if (resp.status === 'succeeded' && resp.videoUrl) {
                    updateTask(task.id, {
                        remoteTaskId: resp.taskId,
                        remoteVideoUrl: resp.videoUrl,
                        remoteVideoUrlExpiresAt: Date.now() + URL_TTL_MS,
                        state: 'DOWNLOAD_PENDING',
                    });
                } else {
                    updateTask(task.id, {
                        remoteTaskId: resp.taskId,
                        state: resp.status === 'running' ? 'RUNNING' : 'QUEUED',
                    });
                }
                notifyTaskChanged(task.id);
                // succeeded → 立即下载；queued/running → 进入轮询
                scheduleRun(task.id, resp.status === 'succeeded' && resp.videoUrl ? 0 : POLL_INTERVAL_MS);
            } else {
                failTask(task, { stage: 'REMOTE', code: 'REMOTE_FAILED', message: '视频服务创建任务失败' });
                notifyTaskChanged(task.id);
            }
        } catch (e) {
            const costConfirm = e.costConfirm === true;
            failTask(task, {
                stage: 'SUBMIT',
                code: e.code || 'SUBMIT_FAILED',
                message: e.message || '提交失败',
                costConfirm: costConfirm,
            });
            notifyTaskChanged(task.id);
        }
    }

    /** 创建远端任务（双协议），返回 {taskId, status, videoUrl} */
    async function createRemoteTask(task, proto) {
        const finalPrompt = task.finalPrompt || '';
        const charImg = task.characterImage ? task.characterImage.dataUrl : null;
        const bgImg = task.backgroundImage ? task.backgroundImage.dataUrl : null;

        if (proto === 'relay') {
            const endpoint = resolveTaskEndpoint(config.baseUrl);
            const params = { images: [] };
            if (charImg) params.images.push(charImg);
            if (bgImg) params.images.push(bgImg);
            params.version = config.variant === 'FAST' ? '快速' : '标准';
            params.duration = String(config.durationSeconds);
            params.aspect_ratio = config.ratio;
            params.resolution = config.resolution === 'P4K' ? '4K' : RESOLUTION_VALUES[config.resolution];

            let resp;
            try {
                resp = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + config.apiKey },
                    body: JSON.stringify({
                        model: config.relayModelId || 'kwvideo-v2-ref',
                        prompt: finalPrompt,
                        params: params,
                    }),
                });
            } catch (e) {
                const err = new Error('网络错误，无法确认任务状态');
                err.code = 'AMBIGUOUS_POST';
                err.costConfirm = true; // 可能已产生费用，绝不自动重发
                throw err;
            }

            const body = await parseJsonSafely(resp);
            // 业务码判定
            if (resp.ok && body && body.code != null && Number(body.code) !== 200 && !body.task_id && !(body.data && body.data.task_id)) {
                const err = new Error(String(body.msg || body.message || '视频服务业务失败'));
                err.code = Number(body.code) === 429 ? 'TRANSIENT' : 'REMOTE_FAILED';
                if (Number(body.code) === 429) err.costConfirm = false;
                throw err;
            }
            if (!resp.ok) {
                const err = new Error(extractRemoteError(body, resp.status));
                err.code = classifyHttpError(resp.status, body);
                throw err;
            }
            const taskId = (body && (body.task_id || (body.data && body.data.task_id))) || null;
            if (!taskId) {
                const err = new Error('服务端未返回任务 ID，请确认是否已产生费用');
                err.code = 'AMBIGUOUS_POST';
                err.costConfirm = true;
                throw err;
            }
            return { taskId: String(taskId), status: 'queued', videoUrl: null };
        }

        // 方舟协议
        const endpoint = resolveTaskEndpoint(config.baseUrl);
        const content = [{ type: 'text', text: finalPrompt }];
        if (charImg) content.push({ type: 'image_url', role: 'reference_image', image_url: { url: charImg } });
        if (bgImg) content.push({ type: 'image_url', role: 'reference_image', image_url: { url: bgImg } });

        let resp;
        try {
            resp = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + config.apiKey },
                body: JSON.stringify({
                    model: MODEL_IDS[config.variant] || MODEL_IDS.STANDARD,
                    content: content,
                    resolution: RESOLUTION_VALUES[config.resolution] || '720p',
                    ratio: config.ratio,
                    duration: config.durationSeconds,
                    generate_audio: true,
                    watermark: config.watermark,
                }),
            });
        } catch (e) {
            const err = new Error('网络错误，无法确认任务状态');
            err.code = 'AMBIGUOUS_POST';
            err.costConfirm = true;
            throw err;
        }

        const body = await parseJsonSafely(resp);
        if (!resp.ok) {
            const err = new Error(extractRemoteError(body, resp.status));
            err.code = classifyHttpError(resp.status, body);
            throw err;
        }
        return {
            taskId: body.id ? String(body.id) : null,
            status: body.status || 'queued',
            videoUrl: body.output && body.output.video_url ? body.output.video_url : null,
        };
    }

    function parseJsonSafely(resp) {
        return resp.text().then(t => {
            try { return t ? JSON.parse(t) : null; } catch { return null; }
        });
    }

    function extractRemoteError(body, httpStatus) {
        if (body && (body.error && (body.error.message || body.error.code))) {
            return 'HTTP ' + httpStatus + '：' + (body.error.message || body.error.code);
        }
        if (body && (body.message || body.msg)) {
            return 'HTTP ' + httpStatus + '：' + (body.message || body.msg);
        }
        return 'HTTP ' + httpStatus;
    }

    function classifyHttpError(httpStatus, body) {
        if (httpStatus === 401 || httpStatus === 403) return 'AUTH';
        if (httpStatus === 429 || httpStatus >= 500) return 'TRANSIENT';
        const text = JSON.stringify(body || '').toLowerCase();
        if (/modelnotopen|not activated|activate the model/.test(text)) return 'MODEL_NOT_OPEN';
        if (/sensitive|contentreview|content_review|审核|敏感|违规|moderation|unsafe/.test(text)) return 'SENSITIVE';
        if (/quota|exceed|insufficient|余额|额度|配额|欠费|balance|limit|限额/.test(text)) return 'QUOTA';
        if (/unauthorized|unauthenticated|invalid key|credential|签名|鉴权|凭证/.test(text)) return 'AUTH';
        if (/invalid|parameter|param|参数|不合法|bad request|validation/.test(text)) return 'PARAM';
        return 'OTHER';
    }

    async function stepPoll(task) {
        const proto = protocolFor(config.baseUrl);
        try {
            const resp = await queryRemoteTask(task, proto);
            if (resp.status === 'succeeded' && resp.videoUrl) {
                updateTask(task.id, {
                    remoteVideoUrl: resp.videoUrl,
                    remoteVideoUrlExpiresAt: Date.now() + URL_TTL_MS,
                    state: 'DOWNLOAD_PENDING',
                });
                notifyTaskChanged(task.id);
                scheduleRun(task.id, 0);
            } else if (resp.status === 'failed') {
                failTask(task, { stage: 'REMOTE', code: 'REMOTE_FAILED', message: resp.message || '远端视频生成失败' });
                notifyTaskChanged(task.id);
            } else if (resp.status === 'cancelled') {
                updateTask(task.id, { state: 'CANCELLED' });
                notifyTaskChanged(task.id);
            } else if (resp.status === 'expired') {
                updateTask(task.id, { state: 'EXPIRED', errorCode: 'EXPIRED', errorMessage: '远端视频任务已过期', requiresCostConfirmation: true });
                notifyTaskChanged(task.id);
            } else {
                // queued / running → 继续轮询
                updateTask(task.id, { state: resp.status === 'running' ? 'RUNNING' : 'QUEUED' });
                notifyTaskChanged(task.id);
                scheduleRun(task.id, POLL_INTERVAL_MS);
            }
        } catch (e) {
            // 查询失败：有界退避，耗尽转 FAILED_QUERY（复用同一 remoteTaskId）
            if (task.automaticRetryCount < MAX_AUTO_RETRIES) {
                task.automaticRetryCount++;
                writeTasks();
                const delay = Math.min(BASE_BACKOFF_MS * Math.pow(2, task.automaticRetryCount), MAX_BACKOFF_MS);
                scheduleRun(task.id, delay);
            } else {
                failTask(task, { stage: 'QUERY', code: 'QUERY_FAILED', message: '查询任务状态失败：' + (e.message || '') });
                notifyTaskChanged(task.id);
            }
        }
    }

    async function queryRemoteTask(task, proto) {
        const taskId = task.remoteTaskId;
        if (!taskId) throw new Error('缺少远端任务 ID');
        if (proto === 'relay') {
            let statusEndpoint = resolveTaskEndpoint(config.baseUrl)
                .replace('/media/generate', '/media/status');
            const sep = statusEndpoint.includes('?') ? '&' : '?';
            const resp = await fetch(statusEndpoint + sep + 'task_id=' + encodeURIComponent(taskId), {
                headers: { 'Authorization': 'Bearer ' + config.apiKey },
            });
            const body = await parseJsonSafely(resp);
            if (!resp.ok) {
                const err = new Error(extractRemoteError(body, resp.status));
                err.code = classifyHttpError(resp.status, body);
                throw err;
            }
            const data = body && body.data ? body.data : body;
            const state = data.state || '';
            const isFinal = data.is_final === true;
            if (state === 'success') {
                if (data.result_url) return { status: 'succeeded', videoUrl: data.result_url };
                return { status: 'running', videoUrl: null }; // 成功但 URL 未就绪，继续轮询
            }
            if (state === 'failed') {
                return { status: 'failed', message: data.error || data.message || '远端生成失败' };
            }
            if (state === 'pending') return { status: 'queued', videoUrl: null };
            if (state === 'running') return { status: 'running', videoUrl: null };
            // 未知状态：保守处理
            if (isFinal) return { status: 'failed', message: data.error || '未知终态' };
            return { status: 'running', videoUrl: null };
        }
        // 方舟
        const endpoint = resolveTaskEndpoint(config.baseUrl) + '/' + encodeURIComponent(taskId);
        const resp = await fetch(endpoint, {
            headers: { 'Authorization': 'Bearer ' + config.apiKey },
        });
        const body = await parseJsonSafely(resp);
        if (!resp.ok) {
            const err = new Error(extractRemoteError(body, resp.status));
            err.code = classifyHttpError(resp.status, body);
            throw err;
        }
        const status = body.status || '';
        const videoUrl = body.output && body.output.video_url ? body.output.video_url : null;
        if (status === 'succeeded') return { status: 'succeeded', videoUrl: videoUrl };
        if (status === 'failed') {
            const msg = (body.error && (body.error.message || body.error.code)) || '远端视频生成失败';
            return { status: 'failed', message: String(msg).slice(0, 200) };
        }
        if (status === 'cancelled') return { status: 'cancelled' };
        if (status === 'expired') return { status: 'expired' };
        if (status === 'running') return { status: 'running', videoUrl: null };
        return { status: 'queued', videoUrl: null };
    }

    async function stepDownload(task) {
        const url = task.remoteVideoUrl;
        if (!url) {
            updateTask(task.id, { state: 'QUEUED' });
            notifyTaskChanged(task.id);
            scheduleRun(task.id, POLL_INTERVAL_MS);
            return;
        }
        if (task.remoteVideoUrlExpiresAt && Date.now() > task.remoteVideoUrlExpiresAt) {
            updateTask(task.id, { state: 'EXPIRED', errorCode: 'URL_EXPIRED', errorMessage: '视频下载地址已过期，请重新生成', requiresCostConfirmation: true });
            notifyTaskChanged(task.id);
            return;
        }
        try {
            const resp = await fetch(url, { mode: 'cors' });
            if (!resp.ok) throw new Error('下载失败 HTTP ' + resp.status);
            const blob = await resp.blob();
            if (!blob || blob.size === 0) throw new Error('视频下载内容为空');
            const type = blob.type || (url.toLowerCase().endsWith('.webm') ? 'video/webm' : 'video/mp4');
            if (!/^video\//.test(type)) {
                throw new Error('下载内容不是受支持的视频格式');
            }
            let db = null;
            try { db = await openDB(); } catch (e) { throw new Error('IndexedDB 不可用'); }
            await idbPut(db, VIDEO_STORE, task.id, blob);
            const u = videoUrls[task.id];
            if (u && u.startsWith('blob:')) URL.revokeObjectURL(u);
            videoUrls[task.id] = URL.createObjectURL(blob);
            updateTask(task.id, { state: 'READY', videoMime: type, videoSize: blob.size });
            notifyTaskChanged(task.id);
        } catch (e) {
            if (task.automaticRetryCount < MAX_AUTO_RETRIES) {
                task.automaticRetryCount++;
                writeTasks();
                const delay = Math.min(BASE_BACKOFF_MS * Math.pow(2, task.automaticRetryCount), MAX_BACKOFF_MS);
                scheduleRun(task.id, delay);
            } else {
                failTask(task, { stage: 'DOWNLOAD', code: 'DOWNLOAD_FAILED', message: e.message || '下载失败' });
                notifyTaskChanged(task.id);
            }
        }
    }

    /* ============================================================
       手动操作：重试 / 删除
       ============================================================ */
    /** 手动重试（用户确认后调用；重置重试计数） */
    function retry(taskId) {
        const task = getTask(taskId);
        if (!task) return;
        const entryMap = {
            FAILED_PROMPT: 'PROMPT_PENDING',
            FAILED_SUBMISSION: 'SUBMISSION_PENDING',
            FAILED_REMOTE: 'SUBMISSION_PENDING',
            EXPIRED: 'SUBMISSION_PENDING',
            FAILED_QUERY: 'QUEUED',
            FAILED_DOWNLOAD: 'DOWNLOAD_PENDING',
        };
        const next = entryMap[task.state];
        if (!next) return;
        task.automaticRetryCount = 0;
        task.requiresCostConfirmation = false;
        if (next === 'SUBMISSION_PENDING') {
            // 重新生成语义：清掉旧远端信息
            task.remoteTaskId = null;
            task.remoteVideoUrl = null;
            task.remoteVideoUrlExpiresAt = null;
            task.promptJson = null;
            task.finalPrompt = null;
        }
        updateTask(task.id, { state: next });
        notifyTaskChanged(task.id);
        scheduleRun(taskId, 0);
    }

    /* ============================================================
       界面：视频卡片渲染 / 任务变更通知
       ============================================================ */
    const listeners = new Set();
    function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
    function notifyTaskChanged(taskId) {
        listeners.forEach(fn => { try { fn(taskId); } catch (e) {} });
    }

    /** 在消息下方渲染/刷新视频卡片。container 为消息元素。 */
    function renderCard(container, taskId) {
        if (!container) return;
        const task = getTask(taskId);
        let card = container.querySelector('.seedance-card');
        if (!task) {
            if (card) card.remove();
            return;
        }
        if (!card) {
            card = document.createElement('div');
            card.className = 'seedance-card';
            card.dataset.taskId = taskId;
            container.appendChild(card);
        }
        renderCardInner(card, task);
    }

    function renderCardInner(card, task) {
        const url = task.state === 'READY' ? (videoUrls[task.id] || null) : null;
        const stateText = {
            PROMPT_PENDING: '分镜准备中...',
            SUBMISSION_PENDING: '提交视频生成...',
            QUEUED: '排队中...',
            RUNNING: '生成中（约 1-3 分钟）...',
            DOWNLOAD_PENDING: '下载视频...',
            READY: '',
            CANCELLED: '已取消',
            EXPIRED: '任务已过期',
            FAILED_PROMPT: '分镜生成失败',
            FAILED_SUBMISSION: '提交失败',
            FAILED_REMOTE: '生成失败',
            FAILED_QUERY: '查询失败',
            FAILED_DOWNLOAD: '下载失败',
        }[task.state] || '处理中...';

        if (url) {
            card.innerHTML =
                '<div class="seedance-card-ready">' +
                '<video class="seedance-video" src="' + url + '" controls playsinline preload="metadata"></video>' +
                '<div class="seedance-card-actions">' +
                '<button type="button" class="seedance-btn" data-act="delete">删除</button>' +
                '</div></div>';
        } else if (task.state === 'READY') {
            card.innerHTML = '<div class="seedance-card-state">视频加载中...</div>';
        } else {
            const costWarn = task.requiresCostConfirmation && ['FAILED_SUBMISSION', 'FAILED_REMOTE', 'EXPIRED'].includes(task.state);
            const retriable = ['FAILED_PROMPT', 'FAILED_SUBMISSION', 'FAILED_REMOTE', 'FAILED_QUERY', 'FAILED_DOWNLOAD', 'EXPIRED'].includes(task.state);
            card.innerHTML =
                '<div class="seedance-card-state' + (costWarn ? ' warn' : '') + '">' +
                '<span class="seedance-state-dot"></span>' +
                '<span class="seedance-state-text">' + stateText +
                (task.errorMessage ? ' — ' + escapeHtml(task.errorMessage) : '') +
                '</span></div>' +
                (retriable
                    ? '<div class="seedance-card-actions"><button type="button" class="seedance-btn" data-act="retry">' +
                      (costWarn ? '重试（可能产生费用）' : '重试') + '</button>' +
                      '<button type="button" class="seedance-btn ghost" data-act="delete">删除</button></div>'
                    : '<div class="seedance-card-actions"><button type="button" class="seedance-btn ghost" data-act="delete">删除</button></div>');
        }

        // 事件绑定
        const retryBtn = card.querySelector('[data-act="retry"]');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                const costConfirm = task.requiresCostConfirmation;
                if (costConfirm && !window.confirm('重新生成视频可能产生新的 API 费用，是否继续？')) return;
                retry(task.id);
            });
        }
        const delBtn = card.querySelector('[data-act="delete"]');
        if (delBtn) {
            delBtn.addEventListener('click', () => {
                deleteTask(task.id);
                card.remove();
            });
        }
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    /** 按 assistantMessageId 找到对应视频任务（auto 优先） */
    function findTaskByMessage(assistantMessageId) {
        if (!assistantMessageId) return null;
        const matches = tasks.filter(t => t.assistantMessageId === assistantMessageId);
        return matches.sort((a, b) => {
            if (a.triggerType === 'auto' && b.triggerType !== 'auto') return -1;
            if (b.triggerType === 'auto' && a.triggerType !== 'auto') return 1;
            return b.createdAt - a.createdAt;
        })[0] || null;
    }

    /** 某条消息下是否已有任务（渲染时防重复建卡） */
    function hasTaskForMessage(assistantMessageId) {
        return !!findTaskByMessage(assistantMessageId);
    }

    /** 统计进行中任务数（设置面板显示） */
    function activeCount() {
        return tasks.filter(t => !['READY', 'CANCELLED', 'FAILED_PROMPT', 'FAILED_SUBMISSION',
            'FAILED_REMOTE', 'FAILED_QUERY', 'FAILED_DOWNLOAD', 'EXPIRED'].includes(t.state)).length;
    }

    function listTasks() {
        return tasks.slice().sort((a, b) => b.createdAt - a.createdAt);
    }

    /** 保存全局背景图（blob） */
    async function setBackgroundBlob(file) {
        if (!file) throw new Error('未选择文件');
        if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
        let db = null;
        try { db = await openDB(); } catch (e) { throw new Error('IndexedDB 不可用'); }
        await idbPut(db, STORE, 'scene', file);
        if (backgroundBlobUrl && backgroundBlobUrl.startsWith('blob:')) URL.revokeObjectURL(backgroundBlobUrl);
        backgroundBlobUrl = URL.createObjectURL(file);
        config.backgroundMode = 'blob';
        config.backgroundUrl = '';
        saveConfig();
    }

    /** 加载背景 blob（load 时调用） */
    async function loadBackgroundBlob() {
        if (config.backgroundMode !== 'blob') return;
        try {
            const db = await openDB();
            const blob = await idbGet(db, STORE, 'scene');
            if (blob) backgroundBlobUrl = URL.createObjectURL(blob);
        } catch (e) {
            console.warn('Seedance: 背景图加载失败', e);
        }
    }

    function getBackgroundUrl() {
        if (config.backgroundMode === 'blob') return backgroundBlobUrl;
        if (config.backgroundMode === 'url') return config.backgroundUrl;
        return null;
    }

    /** 测试连接：发最小只读请求（不创建任务、不产生费用） */
    async function testConnection(baseUrl, apiKey) {
        const proto = protocolFor(baseUrl);
        if (proto === 'relay') {
            const statusEndpoint = resolveTaskEndpoint(baseUrl).replace('/media/generate', '/media/status');
            const resp = await fetch(statusEndpoint + '?task_id=__seedance_probe_check__', {
                headers: { 'Authorization': 'Bearer ' + apiKey },
            });
            // 任意 HTTP 响应都说明网络与服务可达；5xx 视为服务异常
            return resp.status < 500;
        }
        // 方舟：空 POST 会被服务端拒绝（400 参数缺失）→ 说明鉴权/路由已通
        const endpoint = resolveTaskEndpoint(baseUrl);
        const resp = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
            body: JSON.stringify({}),
        });
        if (resp.status === 401 || resp.status === 403) throw new Error('API Key 无效或未授权');
        return resp.status < 500;
    }

    return {
        load, loadBackgroundBlob,
        getConfig, saveConfig, hasConfig, testConnection,
        triggerManual, triggerAuto, retry, deleteTask,
        renderCard, findTaskByMessage, hasTaskForMessage,
        onChange, activeCount, listTasks,
        setBackgroundBlob, getBackgroundUrl, protocolFor,
    };
})();

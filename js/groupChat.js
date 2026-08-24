/* ============================================================
   groupChat.js — 群聊功能（多人干员群）
   - 群元数据（成员列表/名字）存 localStorage
   - 群会话历史独立存储（按群，最多 100 条）
   - 核心算法移植自安卓版：
     GroupChatPromptBuilder（prompt 构造/@解析/前缀剥离）
     GroupSpeakerPicker（谁发言/几人发言）
   界面层（列表/建群/@选择器）与 ChatManager 的流式集成见本文件尾部与 chat.js
   ============================================================ */

const GroupChat = (() => {
    const GROUPS_KEY = 'arknights_chat_groups';
    const HISTORY_PREFIX = 'arknights_chat_group_history_';
    const MAX_MEMBERS = 10;
    const MIN_MEMBERS = 2;
    const MAX_REPLIES_PER_USER_MESSAGE = 4;
    const PERSONA_MAX_CHARS = 300;
    const MAX_CONTEXT_MESSAGES = 40;
    const MAX_HISTORY = 100;

    /* ============================================================
       角色解析工具（供群聊 / 搜索 / 视频共用）
       ============================================================ */
    /** 解析角色头像 URL：自定义 blob/URL → 额外干员 PRTS 直链 → 内置本地立绘 */
    function resolvePortrait(id) {
        if (!id) return null;
        // 自定义角色（IndexedDB blob 或 URL）
        const customUrl = (typeof CustomCharacters !== 'undefined' && CustomCharacters.getSelectImg)
            ? (CustomCharacters.getSelectImg(id) || CustomCharacters.getLive2dImg(id))
            : null;
        if (customUrl) return customUrl;
        // 额外干员（PRTS wiki 直链）
        const extra = (typeof window.EXTRA_CHARACTERS !== 'undefined' && window.EXTRA_CHARACTERS[id])
            ? window.EXTRA_CHARACTERS[id]
            : null;
        if (extra && extra.image) return extra.image;
        // 内置干员（本地立绘）
        const portraits = (typeof window.CHARACTER_PORTRAITS !== 'undefined') ? window.CHARACTER_PORTRAITS : null;
        if (portraits && portraits[id]) return portraits[id];
        return null;
    }

    function getCharName(id) {
        const chars = (typeof window.ARKNIGHTS_CHARACTERS !== 'undefined') ? window.ARKNIGHTS_CHARACTERS : {};
        const c = chars[id];
        if (c && c.name) return c.name;
        return id || '';
    }

    function getCharRole(id) {
        const chars = (typeof window.ARKNIGHTS_CHARACTERS !== 'undefined') ? window.ARKNIGHTS_CHARACTERS : {};
        const c = chars[id];
        return (c && c.role) ? c.role : '';
    }

    function getCharSystemPrompt(id) {
        const chars = (typeof window.ARKNIGHTS_CHARACTERS !== 'undefined') ? window.ARKNIGHTS_CHARACTERS : {};
        const c = chars[id];
        return (c && c.systemPrompt) ? c.systemPrompt : '';
    }

    /* ============================================================
       群元数据 CRUD（localStorage）
       group = { id, name, memberIds: [], createdAt, updatedAt }
       ============================================================ */
    function readGroups() {
        try {
            const raw = localStorage.getItem(GROUPS_KEY);
            const list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list : [];
        } catch { return []; }
    }

    function writeGroups(list) {
        try {
            localStorage.setItem(GROUPS_KEY, JSON.stringify(list));
        } catch (e) {
            console.warn('GroupChat: 保存群列表失败', e);
        }
    }

    function listGroups() {
        return readGroups()
            .slice()
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    }

    function getGroup(id) {
        return readGroups().find(g => g.id === id) || null;
    }

    function createGroup(name, memberIds) {
        const ids = Array.from(new Set(memberIds || []));
        if (ids.length < MIN_MEMBERS) throw new Error('群成员至少需要 ' + MIN_MEMBERS + ' 人');
        if (ids.length > MAX_MEMBERS) throw new Error('群成员最多 ' + MAX_MEMBERS + ' 人');
        const now = Date.now();
        const group = {
            id: 'group_' + now + '_' + Math.floor(Math.random() * 10000),
            name: (name || '').trim() || '群聊',
            memberIds: ids,
            createdAt: now,
            updatedAt: now,
        };
        const list = readGroups();
        list.push(group);
        writeGroups(list);
        return group;
    }

    function deleteGroup(id) {
        const list = readGroups().filter(g => g.id !== id);
        writeGroups(list);
        clearHistory(id);
    }

    function touchGroup(id) {
        const list = readGroups();
        const g = list.find(x => x.id === id);
        if (g) {
            g.updatedAt = Date.now();
            writeGroups(list);
        }
    }

    /* ============================================================
       群会话历史（按群独立存储）
       message = { id, role, content, characterId, ts }
       ============================================================ */
    function getHistory(groupId) {
        try {
            const raw = localStorage.getItem(HISTORY_PREFIX + groupId);
            const list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list : [];
        } catch { return []; }
    }

    function setHistory(groupId, messages) {
        try {
            const trimmed = messages.slice(-MAX_HISTORY);
            localStorage.setItem(HISTORY_PREFIX + groupId, JSON.stringify(trimmed));
        } catch (e) {
            console.warn('GroupChat: 保存群历史失败', e);
        }
    }

    function clearHistory(groupId) {
        try {
            localStorage.removeItem(HISTORY_PREFIX + groupId);
        } catch {}
    }

    /** 群最新一条消息预览（群列表用） */
    function lastMessagePreview(groupId) {
        const hist = getHistory(groupId);
        if (hist.length === 0) return '';
        const last = hist[hist.length - 1];
        const name = last.role === 'user' ? '博士' : getCharName(last.characterId);
        const text = String(last.content || '').replace(/\s+/g, ' ').slice(0, 40);
        return name + '：' + text;
    }

    /* ============================================================
       @ 提及解析（移植 GroupChatPromptBuilder.extractMentions）
       扫描「@名字」，要求 @ 后为单词边界，按出现顺序去重
       ============================================================ */
    function extractMentions(text, memberNames) {
        const found = [];
        const re = /@([^\s@,，。!！?？;；:："'“”（）()\[\]【】]+)/g;
        let m;
        while ((m = re.exec(text)) !== null) {
            const name = m[1];
            // 精确或前缀匹配成员名（取最长的匹配名）
            let matched = null;
            for (const n of memberNames) {
                if (name === n || name.startsWith(n)) {
                    if (!matched || n.length > matched.length) matched = n;
                }
            }
            if (matched && !found.includes(matched)) found.push(matched);
        }
        return found;
    }

    /* ============================================================
       发言人选择（移植 GroupSpeakerPicker）
       ============================================================ */
    /** 回复人数：无 @ 时 1..min(4, 成员数)；有 @ 时 = 被提及数 + 0..补足，封顶 4 */
    function randomReplyCount(memberCount, mentionCount) {
        const cap = Math.min(MAX_REPLIES_PER_USER_MESSAGE, memberCount);
        if (mentionCount <= 0) {
            return 1 + Math.floor(Math.random() * cap);
        }
        const base = Math.min(mentionCount, cap);
        const extra = Math.floor(Math.random() * (cap - base + 1));
        return Math.min(base + extra, cap);
    }

    /** 挑选发言人：被 @ 的成员按顺序排前且必回，其余随机补齐 */
    function pickRandom(memberIds, mentionIds, count) {
        const speakers = [];
        for (const mid of mentionIds) {
            if (memberIds.includes(mid) && !speakers.includes(mid)) speakers.push(mid);
        }
        const pool = memberIds.filter(id => !speakers.includes(id));
        // Fisher-Yates
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        for (const id of pool) {
            if (speakers.length >= count) break;
            speakers.push(id);
        }
        return speakers;
    }

    /* ============================================================
       Prompt 构造（移植 GroupChatPromptBuilder.buildSystemPrompt /
       buildApiMessages）
       ============================================================ */
    function buildSystemPrompt(members, speaker, targeted, userDirective) {
        const speakerName = speaker.name;
        const memberLines = members
            .map(m => '- ' + m.name + '（' + (m.role || '干员') + '）：' +
                String(m.systemPrompt || '').slice(0, PERSONA_MAX_CHARS))
            .join('\n');

        let sys = '这是一个罗德岛干员群聊。你在群里扮演「' + speakerName + '」。以下是群成员人设：\n' +
            memberLines +
            '\n对话规则：user 发言是用户（博士）说的；assistant 消息均以「名字：」开头表示说话人。' +
            '\n现在请你以「' + speakerName + '」的身份回一条消息。' +
            (targeted
                ? '用户这条消息 @ 了你，是专门对你说的，请务必回应。'
                : '自然接话即可。') +
            '\n只输出 ' + speakerName + ' 要说的话本身：不要角色名前缀、不要引号、不要任何解释，1-3 句话。';

        if (userDirective) sys += '\n' + userDirective;
        return sys;
    }

    /**
     * 构造某位发言人的完整 API 消息序列
     * members: [{id,name,role,systemPrompt}]
     * history: [{role, content, characterId}]
     */
    function buildApiMessages(members, speaker, history, opts) {
        const targeted = !!(opts && opts.targeted);
        const userDirective = (opts && opts.userDirective) || '';
        const msgs = [{ role: 'system', content: buildSystemPrompt(members, speaker, targeted, userDirective) }];
        // 完整发送历史（不滑动窗口），保持前缀稳定以最大化 LLM 前缀缓存命中率；
        // 仅当历史超过存储上限时截断尾部兜底，避免超出模型上下文。
        const recent = history.length > MAX_HISTORY ? history.slice(-MAX_HISTORY) : history;
        for (const m of recent) {
            if (m.role === 'assistant') {
                msgs.push({ role: 'assistant', content: getCharName(m.characterId) + '：' + String(m.content || '') });
            } else if (m.role === 'user') {
                msgs.push({ role: 'user', content: m.content });
            }
        }
        return msgs;
    }

    /** 剥离模型偶尔输出的「名字：」前缀与包裹引号（移植 stripSpeakerPrefix） */
    function stripSpeakerPrefix(text, memberNames) {
        let out = String(text || '').trim();
        for (const n of memberNames) {
            const prefix = n + '：';
            if (out.startsWith(prefix)) { out = out.slice(prefix.length).trim(); break; }
            const prefixAscii = n + ':';
            if (out.startsWith(prefixAscii)) { out = out.slice(prefixAscii.length).trim(); break; }
        }
        // 去掉包裹的引号
        if ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith('「') && out.endsWith('」'))) {
            out = out.slice(1, -1).trim();
        }
        return out;
    }

    /* ============================================================
       成员解析：groupId → [{id,name,role,systemPrompt,image}]
       ============================================================ */
    function getMembers(groupId) {
        const g = getGroup(groupId);
        if (!g) return [];
        return g.memberIds
            .map(id => ({
                id,
                name: getCharName(id),
                role: getCharRole(id),
                systemPrompt: getCharSystemPrompt(id),
                image: resolvePortrait(id),
            }))
            .filter(m => m.name);
    }

    function getMemberNames(groupId) {
        return getMembers(groupId).map(m => m.name);
    }

    /* ============================================================
       界面：群列表 / 建群弹窗 / @ 选择器
       ============================================================ */
    function renderGroupList() {
        const container = document.getElementById('group-list');
        if (!container) return;
        const groups = listGroups();
        container.innerHTML = '';

        if (groups.length === 0) {
            container.innerHTML =
                '<div class="group-empty">' +
                '<div class="group-empty-icon">◈</div>' +
                '<div class="group-empty-text">尚未创建群聊</div>' +
                '<div class="group-empty-sub">点击「＋ 新建群」，把干员们拉进同一个频道</div>' +
                '</div>';
            return;
        }

        groups.forEach(g => {
            const item = document.createElement('div');
            item.className = 'group-item';
            item.setAttribute('role', 'button');
            item.tabIndex = 0;
            item.setAttribute('aria-label', '进入群聊 ' + g.name);

            // 成员头像堆叠（最多显示 5 个）
            const members = getMembers(g.id);
            const avatars = members.slice(0, 5).map(m =>
                '<span class="group-item-avatar"' +
                (m.image ? ' style="background-image:url(\'' + m.image + '\')"' : '') +
                '>' + (m.image ? '' : escapeHtml(m.name.slice(0, 1))) + '</span>'
            ).join('');

            const preview = lastMessagePreview(g.id);
            const time = formatGroupTime(g.updatedAt);

            item.innerHTML =
                '<div class="group-item-avatars">' + avatars +
                (members.length > 5 ? '<span class="group-item-more">+' + (members.length - 5) + '</span>' : '') +
                '</div>' +
                '<div class="group-item-main">' +
                '<div class="group-item-name">' + escapeHtml(g.name) + '</div>' +
                '<div class="group-item-preview">' + escapeHtml(preview || '新建的群聊频道') + '</div>' +
                '</div>' +
                '<div class="group-item-right">' +
                '<div class="group-item-time">' + time + '</div>' +
                '<div class="group-item-count">' + members.length + ' 人</div>' +
                '<button type="button" class="group-item-del" title="删除群聊" aria-label="删除群聊">✕</button>' +
                '</div>';

            item.addEventListener('click', (e) => {
                if (e.target.closest('.group-item-del')) return;
                enterGroup(g.id);
            });
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    enterGroup(g.id);
                }
            });
            item.querySelector('.group-item-del').addEventListener('click', (e) => {
                e.stopPropagation();
                if (window.confirm('确定删除群聊「' + g.name + '」？群内对话记录将一并清除。')) {
                    deleteGroup(g.id);
                    if (typeof ChatManager !== 'undefined' && ChatManager.getGroupMode &&
                        ChatManager.getGroupMode() === g.id) {
                        ChatManager.exitGroup();
                    }
                    renderGroupList();
                    if (typeof App !== 'undefined' && App.showToast) App.showToast('群聊已删除', 'success');
                }
            });

            container.appendChild(item);
        });
    }

    function enterGroup(id) {
        if (typeof ChatManager === 'undefined' || !ChatManager.enterGroup) return;
        ChatManager.enterGroup(id);
        // 移动端：进入群聊后切到聊天 tab
        if (window.MobileUI && window.MobileUI.getActiveTab && window.MobileUI.getActiveTab() !== 'chat') {
            window.MobileUI.showTab('chat');
        }
        // 桌面端：收起群面板回到聊天（右面板不做强制切换）
    }

    function formatGroupTime(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        const now = new Date();
        if (d.toDateString() === now.toDateString()) {
            return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        }
        return (d.getMonth() + 1) + '/' + d.getDate();
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    /* ---------- 建群弹窗 ---------- */
    let createSelected = new Set();

    function openCreateDialog() {
        const overlay = document.getElementById('group-create-overlay');
        if (!overlay) return;
        document.getElementById('group-create-name').value = '';
        createSelected = new Set();
        const grid = document.getElementById('group-create-members');
        if (grid) {
            grid.innerHTML = '';
            buildCreateMemberGrid(grid, '');
        }
        updateCreateCount();
        overlay.classList.add('active');
    }

    function closeCreateDialog() {
        const overlay = document.getElementById('group-create-overlay');
        if (overlay) overlay.classList.remove('active');
    }

    function buildCreateMemberGrid(grid, query) {
        grid.innerHTML = '';
        const q = (query || '').trim().toLowerCase();
        const chars = (typeof window.ARKNIGHTS_CHARACTERS !== 'undefined') ? window.ARKNIGHTS_CHARACTERS : {};
        const entries = Object.entries(chars).filter(([id, c]) => {
            if (!q) return true;
            return (c.name || '').toLowerCase().includes(q) ||
                   (c.code || '').toLowerCase().includes(q) ||
                   (id || '').toLowerCase().includes(q);
        });
        entries.sort((a, b) => (a[1].name || '').localeCompare(b[1].name || '', 'zh'));

        if (entries.length === 0) {
            grid.innerHTML = '<div class="group-create-empty">未找到「' + escapeHtml(query) + '」相关干员</div>';
            return;
        }
        entries.forEach(([id, c]) => {
            const item = document.createElement('div');
            item.className = 'group-member-item' + (createSelected.has(id) ? ' selected' : '');
            item.dataset.id = id;
            const img = resolvePortrait(id);
            item.innerHTML =
                '<span class="group-member-avatar"' + (img ? ' style="background-image:url(\'' + img + '\')"' : '') + '>' +
                (img ? '' : escapeHtml((c.name || '?').slice(0, 1))) + '</span>' +
                '<span class="group-member-name">' + escapeHtml(c.name || id) + '</span>';
            item.addEventListener('click', () => toggleCreateMember(id));
            grid.appendChild(item);
        });
    }

    function toggleCreateMember(id) {
        if (createSelected.has(id)) {
            createSelected.delete(id);
        } else {
            if (createSelected.size >= MAX_MEMBERS) {
                if (typeof App !== 'undefined' && App.showToast) App.showToast('群成员最多 ' + MAX_MEMBERS + ' 人', 'error');
                return;
            }
            createSelected.add(id);
        }
        const grid = document.getElementById('group-create-members');
        if (grid) {
            const item = grid.querySelector('.group-member-item[data-id="' + id + '"]');
            if (item) item.classList.toggle('selected', createSelected.has(id));
        }
        updateCreateCount();
    }

    function updateCreateCount() {
        const el = document.getElementById('group-create-count');
        if (el) el.textContent = '已选 ' + createSelected.size + ' / ' + MAX_MEMBERS;
    }

    /* ---------- 右侧面板 干员/群聊 区块切换 ---------- */
    let currentSection = 'operators';

    function showSection(section) {
        currentSection = section === 'groups' ? 'groups' : 'operators';
        const rp = document.getElementById('right-panel');
        if (rp) rp.classList.toggle('showing-groups', currentSection === 'groups');
        document.querySelectorAll('#right-panel-tabs .rp-tab').forEach(btn => {
            const active = btn.dataset.rp === currentSection;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        if (currentSection === 'groups') renderGroupList();
    }

    function confirmCreate() {
        const nameEl = document.getElementById('group-create-name');
        const name = nameEl ? nameEl.value.trim() : '';
        const memberIds = Array.from(createSelected);
        try {
            const group = createGroup(name, memberIds);
            closeCreateDialog();
            renderGroupList();
            enterGroup(group.id);
            if (typeof App !== 'undefined' && App.showToast) App.showToast('群聊已创建', 'success');
        } catch (e) {
            if (typeof App !== 'undefined' && App.showToast) App.showToast(e.message || '创建失败', 'error');
        }
    }

    /* ---------- @ 选择器 ---------- */
    function openAtPicker(filterText) {
        const picker = document.getElementById('at-picker');
        const listEl = document.getElementById('at-picker-list');
        if (!picker || !listEl) return;
        const members = getMembers(GroupChat.currentGroupId ? GroupChat.currentGroupId : '');
        const q = (filterText || '').toLowerCase();
        const filtered = q ? members.filter(m => m.name.toLowerCase().includes(q)) : members;
        if (filtered.length === 0) { closeAtPicker(); return; }
        listEl.innerHTML = '';
        filtered.forEach(m => {
            const item = document.createElement('div');
            item.className = 'at-picker-item';
            item.innerHTML =
                '<span class="at-picker-avatar"' + (m.image ? ' style="background-image:url(\'' + m.image + '\')"' : '') + '>' +
                (m.image ? '' : escapeHtml(m.name.slice(0, 1))) + '</span>' +
                '<span class="at-picker-name">' + escapeHtml(m.name) + '</span>' +
                '<span class="at-picker-role">' + escapeHtml(m.role || '') + '</span>';
            item.addEventListener('click', () => applyAtMention(m.name));
            listEl.appendChild(item);
        });
        picker.classList.remove('hidden');
    }

    function closeAtPicker() {
        const picker = document.getElementById('at-picker');
        if (picker) picker.classList.add('hidden');
    }

    /** 把输入框中最后一个 @ 之后的文本替换为 @名字 */
    function applyAtMention(name) {
        const input = document.getElementById('chat-input');
        if (!input) return;
        const text = input.value;
        const lastAt = text.lastIndexOf('@');
        const before = lastAt >= 0 ? text.slice(0, lastAt) : text;
        // 保留 @ 前面可能正在输入的名字前缀
        const atTail = lastAt >= 0 ? text.slice(lastAt + 1) : '';
        const tailClean = atTail.replace(/\s+/g, ' ');
        input.value = before + '@' + name + ' ' + tailClean;
        input.focus();
        closeAtPicker();
        // 触发输入框 resize
        const evt = new Event('input');
        input.dispatchEvent(evt);
    }

    return {
        // 数据 / 算法
        resolvePortrait, getCharName, getCharRole, getCharSystemPrompt,
        listGroups, getGroup, createGroup, deleteGroup, touchGroup,
        getHistory, setHistory, clearHistory, lastMessagePreview,
        extractMentions, randomReplyCount, pickRandom,
        buildSystemPrompt, buildApiMessages, stripSpeakerPrefix,
        getMembers, getMemberNames,
        // 界面
        renderGroupList, enterGroup,
        openCreateDialog, closeCreateDialog, confirmCreate, toggleCreateMember,
        buildCreateMemberGrid, showSection,
        openAtPicker, closeAtPicker, applyAtMention,
        // 常量
        MAX_MEMBERS, MIN_MEMBERS, MAX_REPLIES_PER_USER_MESSAGE,
        currentGroupId: null, // chat.js 进入群聊时赋值，退出时置 null
    };
})();

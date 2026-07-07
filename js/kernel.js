/**
 * Kernel Module — pure client-side multi-AI conversation.
 * Each AI has its own model/key + assigned character.
 * User types → Enter → all selected AIs reply in sequence.
 */

const KernelModule = {
  enabled: false,
  autoLoop: false,
  running: false,
  aiCount: 0,
  round: 0,
  maxRounds: 0,
  contextHistory: [],
  _chatCharName: null,
  _chatInput: null,
  _enterHandler: null,
  _sendHandler: null,

  init() {
    const chk = document.getElementById('kernel-enabled');
    chk.addEventListener('change', () => this._toggle(chk.checked));

    this.shareChk     = document.getElementById('kernel-share');
    this.speedSlider  = document.getElementById('kernel-speed');
    this.speedVal     = document.getElementById('kernel-speed-val');
    this.autoChk      = document.getElementById('kernel-autoloop');
    this.maxRoundsEl  = document.getElementById('kernel-max-rounds');
    this.btnStart     = document.getElementById('kernel-start');
    this.statusEl     = document.getElementById('kernel-status');
    this.aiRows       = document.getElementById('kernel-ai-rows');
    this.addBtn       = document.getElementById('kernel-add-ai');
    this._chatCharName = document.getElementById('chat-char-name');
    this._chatInput    = document.getElementById('chat-input');

    this.speedSlider.addEventListener('input', () => {
      this.speedVal.textContent = parseFloat(this.speedSlider.value).toFixed(1);
    });
    this.addBtn.addEventListener('click', () => this._addAiRow());
    this.btnStart.addEventListener('click', () => this._saveConfig());
  },

  _toggle(on) {
    this.enabled = on;
    const singleConfig = document.getElementById('single-config');
    const kernelConfig = document.getElementById('kernel-config');
    const operatorArea = document.getElementById('operator-select-area');
    const chatInput    = this._chatInput || document.getElementById('chat-input');
    const sendBtn      = document.getElementById('btn-send');

    if (on) {
      singleConfig.style.display = 'none';
      kernelConfig.style.display = 'block';
      if (operatorArea) operatorArea.style.display = 'none';
      chatInput.placeholder = '输入话题或提示后回车发送...';
      if (this._chatCharName) this._chatCharName.style.display = 'none';

      const rp = document.getElementById('right-panel');
      if (rp) { rp.dataset.prev = rp.style.overflowY || ''; rp.style.overflowY = 'visible'; }

      if (this.aiRows && this.aiRows.children.length === 0) {
        this._addAiRow(); this._addAiRow();
      }

      this._enterHandler = e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopImmediatePropagation(); this._onUserMessage(); }
      };
      this._sendHandler = e => { e.stopImmediatePropagation(); this._onUserMessage(); };
      chatInput.addEventListener('keydown', this._enterHandler, true);
      sendBtn.addEventListener('click', this._sendHandler, true);
    } else {
      singleConfig.style.display = '';
      kernelConfig.style.display = 'none';
      if (operatorArea) operatorArea.style.display = '';
      chatInput.placeholder = '输入消息...';
      if (this._chatCharName) this._chatCharName.style.display = '';
      this.disconnect();
      const rp = document.getElementById('right-panel');
      if (rp) rp.style.overflowY = rp.dataset.prev || '';
      if (this._enterHandler) { chatInput.removeEventListener('keydown', this._enterHandler, true); this._enterHandler = null; }
      if (this._sendHandler)   { sendBtn.removeEventListener('click', this._sendHandler, true); this._sendHandler = null; }
    }
  },

  // ── UI row ───────────────────────────────────────────────────────────────

  _addAiRow() {
    this.aiCount++;
    const n = this.aiCount;
    const row = document.createElement('div');
    row.className = 'kernel-ai-row';
    row.id = 'ai-row-' + n;
    row.innerHTML = `
      <div class="ai-row-header"><strong>AI #${n}</strong>
        <button class="btn-remove-ai" data-row="ai-row-${n}">✕ 删除</button></div>
      <div class="ai-row-body">
        <div class="form-group form-group-inline"><label>提供商</label>
          <select class="ai-provider">
            <option value="https://api.deepseek.com/v1">DeepSeek</option>
            <option value="https://api.openai.com/v1">OpenAI</option>
            <option value="https://api.siliconflow.cn/v1">硅基流动</option>
            <option value="https://dashscope.aliyuncs.com/compatible-mode/v1">阿里百炼</option>
            <option value="https://open.bigmodel.cn/api/paas/v4">智谱 AI</option>
            <option value="https://api.moonshot.cn/v1">月之暗面</option>
            <option value="custom">自定义</option></select></div>
        <div class="form-group form-group-inline"><label>自定义 Base URL</label>
          <input type="text" class="ai-base" placeholder="留空使用提供商默认"></div>
        <div class="form-group form-group-inline"><label>API Key</label>
          <div class="password-wrapper"><input type="password" class="ai-key" placeholder="sk-..."></div></div>
        <div class="form-group form-group-inline"><label>Model</label>
          <select class="ai-model">
            <option value="deepseek-chat">deepseek-chat</option><option value="deepseek-reasoner">deepseek-reasoner</option>
            <option value="gpt-4o">gpt-4o</option><option value="gpt-4o-mini">gpt-4o-mini</option>
            <option value="claude-3-5-sonnet-20241022">claude-3.5-sonnet</option>
            <option value="qwen-plus">qwen-plus</option><option value="glm-4">glm-4</option>
            <option value="moonshot-v1-8k">moonshot-v1-8k</option><option value="custom">自定义</option></select>
          <input type="text" class="ai-model-custom" placeholder="手动输入模型名..." style="margin-top:4px;display:none"></div>
        <div class="form-group form-group-inline"><label>分配角色</label>
          <select class="ai-character"></select></div></div>`;
    this.aiRows.appendChild(row);

    const sel = row.querySelector('.ai-character');
    (document.querySelectorAll('#character-cards .character-card') || []).forEach(card => {
      const id = card.dataset.character, nameEl = card.querySelector('.character-card-name');
      if (!id) return;
      const opt = document.createElement('option'); opt.value = id; opt.textContent = nameEl ? nameEl.textContent : id;
      sel.appendChild(opt);
    });

    row.querySelector('.btn-remove-ai').addEventListener('click', () => { row.remove(); this._renumber(); });

    const provSel = row.querySelector('.ai-provider'), baseInp = row.querySelector('.ai-base');
    provSel.addEventListener('change', () => {
      baseInp.value = provSel.value !== 'custom' ? provSel.value : '';
      baseInp.placeholder = provSel.value !== 'custom' ? provSel.value : '手动输入完整 URL';
    });
    if (provSel.value !== 'custom') baseInp.value = provSel.value;

    const modelSel = row.querySelector('.ai-model'), modelCus = row.querySelector('.ai-model-custom');
    modelSel.addEventListener('change', () => { modelCus.style.display = modelSel.value === 'custom' ? 'block' : 'none'; });
  },

  _renumber() {
    const rows = this.aiRows.querySelectorAll('.kernel-ai-row');
    this.aiCount = rows.length;
    rows.forEach((r, i) => {
      const n = i + 1; r.id = 'ai-row-' + n;
      r.querySelector('strong').textContent = 'AI #' + n;
      r.querySelector('.btn-remove-ai').dataset.row = 'ai-row-' + n;
    });
  },

  _readRows() {
    const items = [];
    this.aiRows.querySelectorAll('.kernel-ai-row').forEach(row => {
      const baseUrl = row.querySelector('.ai-base').value.trim();
      const apiKey  = row.querySelector('.ai-key').value.trim();
      const mSel = row.querySelector('.ai-model').value;
      const mCus = row.querySelector('.ai-model-custom').value.trim();
      const model  = mSel === 'custom' ? mCus : mSel;
      const charId = row.querySelector('.ai-character').value;
      if (!charId) return;
      items.push({ baseUrl, apiKey, model: model || 'deepseek-chat', charId });
    });
    return items;
  },

  // ── actions ──────────────────────────────────────────────────────────────

  _saveConfig() { this.setStatus('设定已保存。输入框输入后回车发送。', 'ok'); },

  _onUserMessage() {
    if (this.running) return;
    const text = this._chatInput.value.trim();
    if (!text) return;
    this._chatInput.value = '';

    if (typeof appendMessageBubble === 'function') {
      appendMessageBubble('user', text);
    }
    if (typeof window.messageHistory !== 'undefined') {
      window.messageHistory.push({ role: 'user', content: text });
    }
    this._startRound(text);
  },

  _startRound(topic) {
    const items = this._readRows();
    if (items.length < 2) { this.setStatus('至少配置 2 个 AI', 'error'); return; }

    const main = Storage.getApiConfig();
    items.forEach(it => {
      if (!it.baseUrl) it.baseUrl = main.baseUrl || 'https://api.deepseek.com/v1';
      if (!it.apiKey)  it.apiKey  = main.apiKey || '';
      if (!it.model)   it.model   = main.model || 'deepseek-chat';
    });

    this.running = true; this.round = 0; this.maxRounds = parseInt(this.maxRoundsEl.value) || 0;
    this.contextHistory = []; this.items = items; this.topic = topic;
    this.btnStart.disabled = true;
    this.setStatus('对话中...', 'ok');
    this._roundLoop();
  },

  _roundLoop() {
    if (!this.running) return;
    this.round++;
    if (this.maxRounds > 0 && this.round > this.maxRounds) { this._stop(); return; }

    const chars = window.CHARACTERS || {};
    const share = this.shareChk.checked;
    const speed = parseFloat(this.speedSlider.value) || 1.0;
    const pauseMs = Math.round(3000 / Math.max(speed, 0.1)); // 3s at normal, longer when slow

    let idx = 0;
    const total = this.items.length;

    const next = async () => {
      if (idx >= total || !this.running) {
        // all done — check auto-loop
        this.autoLoop = document.getElementById('kernel-autoloop').checked;
        const atMax = this.maxRounds > 0 && this.round >= this.maxRounds;
        if (this.autoLoop && !atMax) {
          this.setStatus(`第 ${this.round} 轮结束，${Math.round(pauseMs/1000)}s 后继续...`, 'ok');
          setTimeout(() => this._roundLoop(), pauseMs);
        } else {
          this._stop();
        }
        return;
      }

      const item = this.items[idx];
      const ch = chars[item.charId] || { name: item.charId, systemPrompt: '', role: '' };
      const label = ch.name || item.charId;
      const cfg = { baseUrl: item.baseUrl, apiKey: item.apiKey, model: item.model };

      const msgs = [{ role: 'system', content: ch.systemPrompt || `你是${label}。` }];

      if (share && this.contextHistory.length > 0) {
        let ctx = '【对话记录】\n';
        this.contextHistory.slice(-12).forEach(e => { ctx += `[${e.name}]: ${e.text}\n`; });
        msgs.push({ role: 'user', content: ctx });
      }

      if (this.round === 1 && this.contextHistory.length === 0) {
        msgs.push({ role: 'user', content: this.topic ? `话题：${this.topic}` : '请根据你的角色设定，自然地开始交谈。' });
      } else {
        msgs.push({ role: 'user', content: '请继续对话。' });
      }

      this.setStatus(`${label} (${idx+1}/${total}) 思考中...`, 'ok');

      try {
        window.currentCharacterId = item.charId;
        const resp = await window.callLLM(cfg, msgs);
        // callLLM creates + removes streaming bubble, returns full text

        if (resp) {
          this._appendBubble(item.charId, resp);
          if (share) this.contextHistory.push({ name: label, text: resp });
          if (typeof TTSManager !== 'undefined' && TTSManager.synthesize) {
            TTSManager.synthesize(resp).catch(() => {});
          }
        }

        this.setStatus(`${label} 发言完毕`, 'ok');
      } catch (e) {
        console.error('[kernel]', label, e);
        this.setStatus(`${label} 出错: ${e.message || e}`, 'error');
      }

      idx++;
      if (idx < total && this.running) {
        setTimeout(() => next(), pauseMs);
      } else {
        next(); // last one → check loop
      }
    };

    next();
  },

  _appendBubble(charId, text) {
    if (typeof appendMessageBubble !== 'function') {
      const chars = window.CHARACTERS || {};
      const name = (chars[charId] && chars[charId].name) || charId;
      const d = document.createElement('div');
      d.className = 'message character kernel-msg';
      d.innerHTML = `<div class="message-sender">OPERATOR // ${name.toUpperCase()}</div>
                     <div class="message-bubble-row"><div class="message-bubble">${this._esc(text)}</div></div>`;
      (document.getElementById('chat-messages') || {}).appendChild && document.getElementById('chat-messages').appendChild(d);
      return;
    }
    const prev = window.currentCharacterId;
    window.currentCharacterId = charId;
    appendMessageBubble('character', text);
    window.currentCharacterId = prev;
  },

  // ── misc ─────────────────────────────────────────────────────────────────

  _stop() {
    this.setStatus(`对话结束（共 ${this.round} 轮）`, 'ok');
    this.btnStart.disabled = false;
    this.running = false;
  },

  _esc(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; },

  setStatus(msg, type) {
    if (!this.statusEl) return;
    this.statusEl.textContent = msg;
    this.statusEl.style.color = type === 'error' ? '#e06060' : type === 'ok' ? '#80c080' : '#c9a87c';
  },

  disconnect() {
    this.running = false;
    if (this.btnStart) this.btnStart.disabled = false;
    this.setStatus('', '');
  },
};

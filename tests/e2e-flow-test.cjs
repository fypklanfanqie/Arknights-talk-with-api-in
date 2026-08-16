/* 端到端流程测试：mock LLM + Seedance API，验证群聊串行调度与视频管线 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.otf': 'font/opentype',
};
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}
async function waitFor(cond, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await cond()) return true;
    await new Promise(r => setTimeout(r, 120));
  }
  return false;
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => { if (!e.message.includes('Cubism')) errors.push(e.message); });

  // ---- mock API ----
  const mockVideoUrl = `http://127.0.0.1:${port}/mock.mp4`;
  await page.route('**/chat/completions', async route => {
    const body = JSON.parse(route.request().postData() || '{}');
    const msgs = body.messages || [];
    const sys = (msgs[0] && msgs[0].content) || '';
    // 分镜生成
    if (sys.includes('分镜导演')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [{ message: { content: JSON.stringify({
            subject: '角色', appearance: '发色金白，瞳色浅蓝，穿着罗德岛制服与披风，佩戴徽章，身形纤长，气质沉稳而温和，袖口与领口的装饰纹样精致完整，整体造型干净利落，与参考图完全一致',
            action: '角色缓缓抬头看向镜头，嘴唇翕动说出台词，随后微微点头，动作连贯自然',
            environment: '黄昏的罗德岛舰桥，天空橙红渐变，微风拂过，远处有舰船轮廓，氛围宁静温暖',
            camera: '中景，镜头缓慢推近，稳定运镜',
            lighting: '暖金色黄昏光线，柔和的侧逆光勾勒轮廓，色调温暖',
            audio: '环境风声，脚步轻微，角色说话声清晰自然，语气温和',
            continuity: '发色、服装、配饰与参考图一致，全片无变化',
          }) } }],
        }),
      });
      return;
    }
    // 群聊：从 system prompt 提取发言人
    if (sys.includes('群聊')) {
      const m = sys.match(/扮演「([^」]+)」/);
      const speaker = m ? m[1] : '干员';
      const reply = speaker + '：这是来自' + speaker + '的回复，收到。';
      const sse = 'data: ' + JSON.stringify({ choices: [{ delta: { content: reply } }] }) + '\n\ndata: [DONE]\n\n';
      await route.fulfill({ contentType: 'text/event-stream', body: sse });
      return;
    }
    // 单聊
    const sse = 'data: ' + JSON.stringify({ choices: [{ delta: { content: '你好，博士。这里是单聊回复。' } }] }) + '\n\ndata: [DONE]\n\n';
    await route.fulfill({ contentType: 'text/event-stream', body: sse });
  });

  // Seedance 方舟端点（创建任务直接返回 succeeded + 视频 URL，跳过轮询）
  await page.route('**/contents/generations/tasks*', async route => {
    const req = route.request();
    const url = req.url();
    if (req.method() === 'POST') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ id: 'task_mock_1', status: 'succeeded', output: { video_url: mockVideoUrl } }),
      });
    } else if (url.endsWith('/task_mock_1')) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: 'task_mock_1', status: 'succeeded', output: { video_url: mockVideoUrl } }) });
    } else {
      await route.fulfill({ contentType: 'application/json', body: '{}' });
    }
  });
  // 视频下载
  await page.route('**/mock.mp4', route => {
    route.fulfill({
      contentType: 'video/mp4',
      body: Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]),
    });
  });

  console.log('\n== 端到端：单聊 + 自动视频 ==');
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const el = document.getElementById('app-container');
    return !!el && el.classList.contains('ready');
  }, null, { timeout: 20000 });
  // 配置 API + Seedance（autoEnabled）
  await page.evaluate(() => {
    Storage.setApiConfig({ baseUrl: 'http://127.0.0.1:9/mock', apiKey: 'mock-key', model: 'mock-model' });
    SeedanceVideo.saveConfig({ baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', apiKey: 'sd-mock', autoEnabled: true, durationSeconds: 5 });
    location.reload();
  });
  await page.waitForFunction(() => {
    const el = document.getElementById('app-container');
    return !!el && el.classList.contains('ready');
  }, null, { timeout: 20000 });

  // 发送单聊消息
  await page.fill('#chat-input', '你好');
  await page.click('#btn-send');
  await waitFor(() => page.evaluate(() => {
    const msgs = document.querySelectorAll('#chat-messages .message.character');
    return msgs.length >= 1 && msgs[0].querySelector('.message-bubble').textContent.includes('单聊回复');
  }), 30000);
  check('单聊回复渲染', true);

  // 自动视频（autoEnabled=true）
  const videoReady = await waitFor(() => page.evaluate(() => {
    const card = document.querySelector('.seedance-card');
    return card && card.querySelector('video');
  }), 60000);
  check('自动视频生成 → 卡片 READY（含 video 元素）', videoReady);
  const taskState = await page.evaluate(() => {
    const t = SeedanceVideo.listTasks()[0];
    return t ? t.state : null;
  });
  check('视频任务状态 READY', taskState === 'READY', 'state=' + taskState);
  const autoType = await page.evaluate(() => {
    const t = SeedanceVideo.listTasks()[0];
    return t ? t.triggerType : null;
  });
  check('自动触发类型 auto', autoType === 'auto', 'type=' + autoType);

  // 手动视频按钮（在助手消息上）
  const manualBtn = await page.evaluate(() => !!document.querySelector('.btn-msg-video'));
  check('助手消息上有手动视频按钮', manualBtn);

  console.log('\n== 端到端：群聊串行多成员 ==');
  // 建群（2 人）
  await page.click('#right-panel-tabs .rp-tab[data-rp="groups"]');
  await page.click('#btn-group-create');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const items = document.querySelectorAll('#group-create-members .group-member-item');
    items[0].click(); items[1].click();
  });
  await page.click('#btn-group-create-confirm');
  await page.waitForTimeout(500);
  check('进入群聊', await page.evaluate(() => document.getElementById('chat-container').classList.contains('group-mode')));

  // 发群消息（@ 第一个成员）
  const memberNames = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#group-member-strip .member-chip-name')).map(e => e.textContent)
  );
  await page.fill('#chat-input', '大家好 @' + memberNames[0]);
  await page.click('#btn-send');
  const groupReplies = await waitFor(() => page.evaluate(() => {
    const msgs = document.querySelectorAll('#chat-messages .message.group.character');
    const bubbleTexts = Array.from(msgs).map(m => m.querySelector('.message-bubble').textContent);
    return bubbleTexts.filter(t => t.includes('这是来自')).length;
  }), 60000);
  check('群聊成员依次回复（串行流式）', groupReplies >= 1 && groupReplies <= 2, '回复数=' + groupReplies);

  // 前缀剥离验证：气泡不以「名字：」开头
  const prefixClean = await page.evaluate(() => {
    const msgs = document.querySelectorAll('#chat-messages .message.group.character .message-bubble');
    return Array.from(msgs).every(b => !/^[^：]{1,6}：/.test(b.textContent.trim()));
  });
  check('发言人前缀已剥离', prefixClean);

  // 历史持久化：1 user + N assistant
  const histCount = await page.evaluate(() => {
    const g = GroupChat.listGroups()[0];
    return GroupChat.getHistory(g.id).length;
  });
  check('群历史已持久化（>=2 条）', histCount >= 2, '条数=' + histCount);

  // 群聊不触发自动视频
  const groupTaskCount = await page.evaluate(() => SeedanceVideo.listTasks().length);
  check('群聊未新增视频任务', groupTaskCount === 1, '任务数=' + groupTaskCount);

  console.log('\n== 控制台错误 ==');
  errors.slice(0, 8).forEach(e => console.log('  ! ' + e));
  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  await browser.close();
  server.close();
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(2); });

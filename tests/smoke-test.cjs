/* 冒烟测试：验证新增功能在真实浏览器中可用 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.otf': 'font/otf', '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
    res.writeHead(404); res.end('404'); return;
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const errors = [];
let passed = 0;
let failed = 0;

function check(name, cond, extra) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}

async function waitFor(cond, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await cond()) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message));

  console.log('\n== 桌面端 ==');
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // 1. 页面加载 + 无致命错误
  check('页面加载完成（app ready）', await waitFor(() => page.evaluate(() => !!document.getElementById('app-container') && document.getElementById('app-container').classList.contains('ready')), 20000));

  // 2. 全量干员合并
  const charCount = await page.evaluate(() => Object.keys(window.ARKNIGHTS_CHARACTERS || {}).length);
  check('干员总数 >= 380（合并 364 额外干员）', charCount >= 380, '实际 ' + charCount);
  const extraLoaded = await page.evaluate(() => !!window.EXTRA_CHARACTERS && Object.keys(window.EXTRA_CHARACTERS).length);
  check('EXTRA_CHARACTERS 已定义', extraLoaded, 'count=' + extraLoaded);
  const portraits = await page.evaluate(() => Object.keys(window.CHARACTER_PORTRAITS || {}).length);
  check('CHARACTER_PORTRAITS 已定义', portraits >= 380, 'count=' + portraits);

  // 3. 新模块存在
  const mods = await page.evaluate(() => ({
    up: typeof UserProfile !== 'undefined',
    bg: typeof ChatBackground !== 'undefined',
    gc: typeof GroupChat !== 'undefined',
    sv: typeof SeedanceVideo !== 'undefined',
  }));
  check('UserProfile 模块', mods.up);
  check('ChatBackground 模块', mods.bg);
  check('GroupChat 模块', mods.gc);
  check('SeedanceVideo 模块', mods.sv);

  // 4. 搜索过滤
  await page.fill('#char-search-input', '阿米娅');
  await page.waitForTimeout(400);
  const visibleCards = await page.evaluate(() => {
    return document.querySelectorAll('#character-cards .character-card:not(.card-hidden)').length;
  });
  check('搜索「阿米娅」过滤出卡片', visibleCards >= 1, '可见 ' + visibleCards);
  await page.fill('#char-search-input', '');
  await page.waitForTimeout(400);

  // 5. 右侧面板切到群聊 tab
  await page.click('#right-panel-tabs .rp-tab[data-rp="groups"]');
  await page.waitForTimeout(200);
  const groupsVisible = await page.evaluate(() => {
    const rp = document.getElementById('right-panel');
    return rp.classList.contains('showing-groups') &&
      getComputedStyle(document.getElementById('group-list-section')).display !== 'none';
  });
  check('右侧面板切换到群聊区块', groupsVisible);
  const groupListHasEmpty = await page.evaluate(() => !!document.querySelector('#group-list .group-empty'));
  check('空群列表显示空态', groupListHasEmpty);

  // 6. 建群弹窗
  await page.click('#btn-group-create');
  await page.waitForTimeout(300);
  const createOpen = await page.evaluate(() => document.getElementById('group-create-overlay').classList.contains('active'));
  check('建群弹窗打开', createOpen);
  const memberCount = await page.evaluate(() => document.querySelectorAll('#group-create-members .group-member-item').length);
  check('成员网格已渲染（>100）', memberCount > 100, '实际 ' + memberCount);
  await page.fill('#group-create-search', '阿米娅');
  await page.waitForTimeout(400);
  const memberFiltered = await page.evaluate(() => document.querySelectorAll('#group-create-members .group-member-item').length);
  check('建群搜索过滤成员', memberFiltered >= 1 && memberFiltered < 10, '结果 ' + memberFiltered);

  // 7. 清空搜索 → 选两个成员 → 创建
  await page.fill('#group-create-search', '');
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const items = document.querySelectorAll('#group-create-members .group-member-item');
    items[0].click(); items[1].click();
  });
  await page.click('#btn-group-create-confirm');
  await page.waitForTimeout(500);
  const groupMode = await page.evaluate(() => {
    return document.getElementById('chat-container').classList.contains('group-mode');
  });
  check('创建后进入群聊模式', groupMode);
  const memberStrip = await page.evaluate(() => document.querySelectorAll('#group-member-strip .member-chip').length);
  check('成员横滑条渲染', memberStrip === 2, 'chips=' + memberStrip);
  const backVisible = await page.evaluate(() => !document.getElementById('btn-group-back').hidden);
  check('返回按钮可见', backVisible);

  // 8. @选择器
  await page.fill('#chat-input', '@');
  await page.waitForTimeout(300);
  const atOpen = await page.evaluate(() => !document.getElementById('at-picker').classList.contains('hidden'));
  check('@ 选择器弹出', atOpen);
  const atItems = await page.evaluate(() => document.querySelectorAll('#at-picker .at-picker-item').length);
  check('@ 选择器列出成员', atItems === 2, 'items=' + atItems);
  // 点击成员回填
  await page.evaluate(() => { document.querySelector('#at-picker .at-picker-item').click(); });
  const inputVal = await page.inputValue('#chat-input');
  check('@ 回填成员名', inputVal.includes('@'), 'value=' + inputVal);
  await page.fill('#chat-input', '');

  // 9. 退出群聊
  await page.click('#btn-group-back');
  await page.waitForTimeout(300);
  const backToSingle = await page.evaluate(() => !document.getElementById('chat-container').classList.contains('group-mode'));
  check('返回单聊模式', backToSingle);

  // 10. 设置抽屉：4 个新分区
  const sections = await page.evaluate(() => {
    return ['settings-profile-section', 'settings-bg-section', 'settings-seedance-section', 'settings-perf-section']
      .every(id => !!document.getElementById(id));
  });
  check('设置抽屉 4 个新分区存在', sections);

  // 11. 背景设置：上传
  const bgOk = await page.evaluate(() => {
    document.getElementById('bg-enabled').checked = true;
    document.getElementById('bg-enabled').dispatchEvent(new Event('change'));
    return ChatBackground.isEnabled();
  });
  check('背景开关可切换', bgOk);

  // 12. 视频生成按钮在输入区
  const videoBtn = await page.evaluate(() => !!document.getElementById('btn-video-gen'));
  check('输入区视频按钮存在', videoBtn);

  console.log('\n== 移动端 ==');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  const tabs = await page.evaluate(() => document.querySelectorAll('.mobile-tab').length);
  check('底部标签栏 4 个 tab', tabs === 4, '实际 ' + tabs);

  // 群聊 tab
  await page.click('.mobile-tab[data-tab="groups"]');
  await page.waitForTimeout(400);
  const groupsTab = await page.evaluate(() => {
    const rp = document.getElementById('right-panel');
    return rp.classList.contains('mobile-panel-visible') &&
      rp.classList.contains('showing-groups');
  });
  check('移动端群聊 tab 显示群列表', groupsTab);

  // 角色 tab → 干员区块
  await page.click('.mobile-tab[data-tab="characters"]');
  await page.waitForTimeout(400);
  const charsTab = await page.evaluate(() => {
    const rp = document.getElementById('right-panel');
    return rp.classList.contains('mobile-panel-visible') && !rp.classList.contains('showing-groups');
  });
  check('移动端角色 tab 显示干员', charsTab);

  // 聊天 tab
  await page.click('.mobile-tab[data-tab="chat"]');
  await page.waitForTimeout(400);
  const chatTab = await page.evaluate(() => !document.getElementById('middle-panel').classList.contains('mobile-panel-hidden'));
  check('移动端聊天 tab', chatTab);

  // 13. 群列表已有 1 个群（前面创建过）
  await page.click('.mobile-tab[data-tab="groups"]');
  await page.waitForTimeout(300);
  const groupItems = await page.evaluate(() => document.querySelectorAll('#group-list .group-item').length);
  check('群列表显示已创建的群', groupItems === 1, 'items=' + groupItems);

  // 14. 点击群进入群聊（移动端自动切到聊天 tab）
  await page.evaluate(() => { document.querySelector('#group-list .group-item').click(); });
  await page.waitForTimeout(600);
  const mobileGroup = await page.evaluate(() => {
    const tab = document.querySelector('.mobile-tab[data-tab="chat"]');
    const rp = document.getElementById('right-panel');
    return tab.classList.contains('active') && !rp.classList.contains('mobile-panel-visible') &&
      document.getElementById('chat-container').classList.contains('group-mode');
  });
  check('移动端点击群 → 进入群聊并切回聊天 tab', mobileGroup);

  // 15. 设置抽屉开关（移动端）
  await page.click('#btn-group-back');
  await page.waitForTimeout(300);
  await page.click('#btn-settings-gear');
  await page.waitForTimeout(400);
  const drawer = await page.evaluate(() => document.getElementById('settings-panel').classList.contains('drawer-open'));
  check('移动端设置抽屉打开', drawer);
  await page.click('#settings-drawer-backdrop');
  await page.waitForTimeout(300);

  console.log('\n== 控制台错误（前 10 条）==');
  errors.slice(0, 10).forEach(e => console.log('  ! ' + e));

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  await browser.close();
  server.close();
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => {
  console.error('测试异常:', e);
  process.exit(2);
});

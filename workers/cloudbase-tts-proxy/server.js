/**
 * TTS 代理服务 — 火山引擎 豆包 2.0 语音合成
 *
 * 部署到 CloudBase 云托管 (CloudRun) 的 Node.js 服务。
 * 前端 "代理地址" 填写: https://<你的云托管域名>/tts
 *
 * 本地调试: node server.js  (默认监听 3000，POST /tts)
 */
const http = require('http');

const VOLC_TTS_URL = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional';
const PORT = process.env.PORT || 3000;

function buildCorsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Expose-Headers': '*',
    };
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

const server = http.createServer(async (req, res) => {
    const cors = buildCorsHeaders();
    if (req.method === 'OPTIONS') {
        res.writeHead(204, cors);
        return res.end();
    }

    if (req.method !== 'POST' || !req.url.startsWith('/tts')) {
        res.writeHead(405, { 'Content-Type': 'text/plain', ...cors });
        return res.end('Only POST /tts is allowed');
    }

    const bodyBuf = await readBody(req);

    const volcHeaders = {
        'Content-Type': 'application/json',
        'Connection': 'keep-alive',
    };
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
        volcHeaders['X-Api-Key'] = apiKey;
        volcHeaders['X-Api-Resource-Id'] = req.headers['x-api-resource-id'] || 'seed-tts-2.0';
        volcHeaders['X-Api-Request-Id'] = req.headers['x-api-request-id'] || require('crypto').randomUUID();
    }
    if (req.headers['x-api-app-key']) volcHeaders['X-Api-App-Key'] = req.headers['x-api-app-key'];
    if (req.headers['x-api-access-key']) volcHeaders['X-Api-Access-Key'] = req.headers['x-api-access-key'];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
        const upstream = await fetch(VOLC_TTS_URL, {
            method: 'POST',
            headers: volcHeaders,
            body: bodyBuf,
            signal: controller.signal,
        });
        res.writeHead(upstream.status, { ...cors });
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.end(buf);
    } catch (err) {
        const msg = err.name === 'AbortError'
            ? '代理请求超时 (火山引擎 25s 内未响应)'
            : '代理请求失败: ' + err.message;
        res.writeHead(502, { 'Content-Type': 'application/json', ...cors });
        res.end(JSON.stringify({ error: msg }));
    } finally {
        clearTimeout(timer);
    }
});

server.listen(PORT, () => {
    console.log('[TTS Proxy] listening on ' + PORT);
});

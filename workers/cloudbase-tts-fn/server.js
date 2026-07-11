/**
 * TTS HTTP 代理 - CloudBase Web 函数 (监听 9000)
 *
 * 平台通过 scf_bootstrap 启动本服务，外部 HTTP 请求转发到 9000 端口。
 * 前端 "代理地址" 填写: https://lanfanqie-d8go1l51d56f44d20.service.tcloudbase.com/tts
 *
 * 兼容 Nodejs16: 使用 https 模块转发 (无全局 fetch 依赖)。
 */
const http = require('http');
const https = require('https');

const VOLC_HOST = 'openspeech.bytedance.com';
const VOLC_PATH = '/api/v3/tts/unidirectional';
const RESOURCE_ID = 'seed-tts-2.0';
const PORT = process.env.PORT || 9000;

function corsHeaders() {
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

function httpsPost(bodyBuf, headers) {
    return new Promise((resolve, reject) => {
        const req = https.request(
            { hostname: VOLC_HOST, port: 443, path: VOLC_PATH, method: 'POST', headers, timeout: 25000 },
            (res) => {
                const chunks = [];
                res.on('data', c => chunks.push(c));
                res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, buf: Buffer.concat(chunks) }));
                res.on('error', reject);
            }
        );
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.write(bodyBuf);
        req.end();
    });
}

const server = http.createServer(async (req, res) => {
    const cors = corsHeaders();
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
        volcHeaders['X-Api-Resource-Id'] = req.headers['x-api-resource-id'] || RESOURCE_ID;
        volcHeaders['X-Api-Request-Id'] = req.headers['x-api-request-id'] || require('crypto').randomUUID();
    }
    if (req.headers['x-api-app-key']) volcHeaders['X-Api-App-Key'] = req.headers['x-api-app-key'];
    if (req.headers['x-api-access-key']) volcHeaders['X-Api-Access-Key'] = req.headers['x-api-access-key'];

    try {
        const r = await httpsPost(bodyBuf, volcHeaders);
        const respHeaders = {};
        for (const k of Object.keys(r.headers)) {
            respHeaders[k] = Array.isArray(r.headers[k]) ? r.headers[k][0] : r.headers[k];
        }
        Object.assign(respHeaders, cors);
        res.writeHead(r.status, respHeaders);
        res.end(r.buf);
    } catch (err) {
        const msg = err.message && err.message.indexOf('timeout') >= 0
            ? '代理请求超时 (火山引擎 25s 内未响应)'
            : '代理请求失败: ' + (err.message || 'unknown');
        res.writeHead(502, { 'Content-Type': 'application/json', ...cors });
        res.end(JSON.stringify({ error: msg }));
    }
});

server.listen(PORT, () => {
    console.log('[TTS Proxy] listening on ' + PORT);
});

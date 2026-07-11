/* ============================================================
   TTS 代理 — 火山引擎 TTS CORS 代理

   支持部署到:
   A) Cloudflare Worker  (wrangler deploy 或控制台粘贴)
   B) CloudBase 云托管   (Node.js 服务, 见底部说明)

   部署步骤 (Cloudflare Worker):
   1. 登录 https://dash.cloudflare.com/
   2. Workers & Pages → Create Worker
   3. 粘贴此文件全部内容 → Deploy
   4. 复制 Worker URL (如 https://tts-proxy.你的用户名.workers.dev)
   5. 填入设置面板的 "TTS 代理地址"

   注意: 默认的 tts-proxy.lanfanqie.workers.dev 已停用，
   请部署你自己的 Worker 并填入地址。
   ============================================================ */

const VOLC_TTS_URL = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional';

// Cloudflare Worker 入口
export default {
    async fetch(request) {
        return handleRequest(request);
    },
};

async function handleRequest(request) {
    // CORS 预检请求
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': '*',
                'Access-Control-Max-Age': '86400',
            },
        });
    }

    // 只接受 POST
    if (request.method !== 'POST') {
        return new Response('Only POST is allowed', {
            status: 405,
            headers: { 'Access-Control-Allow-Origin': '*' },
        });
    }

    // 转发请求头中的鉴权信息到火山引擎
    const volcHeaders = {
        'Content-Type': 'application/json',
        'Connection': 'keep-alive',
    };

    const apiKey = request.headers.get('X-Api-Key');
    const resourceId = request.headers.get('X-Api-Resource-Id');
    const requestId = request.headers.get('X-Api-Request-Id');

    if (apiKey) {
        volcHeaders['X-Api-Key'] = apiKey;
        volcHeaders['X-Api-Resource-Id'] = resourceId || 'seed-tts-2.0';
        volcHeaders['X-Api-Request-Id'] = requestId || crypto.randomUUID();
    }

    const appKey = request.headers.get('X-Api-App-Key');
    const accessKey = request.headers.get('X-Api-Access-Key');
    if (appKey) volcHeaders['X-Api-App-Key'] = appKey;
    if (accessKey) volcHeaders['X-Api-Access-Key'] = accessKey;

    // 带超时的转发 (AbortController 在 Worker 中可用)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
        const volcResponse = await fetch(VOLC_TTS_URL, {
            method: 'POST',
            headers: volcHeaders,
            body: request.body,
            signal: controller.signal,
        });

        const responseHeaders = new Headers(volcResponse.headers);
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        responseHeaders.set('Access-Control-Expose-Headers', '*');

        return new Response(volcResponse.body, {
            status: volcResponse.status,
            statusText: volcResponse.statusText,
            headers: responseHeaders,
        });

    } catch (err) {
        const msg = err.name === 'AbortError'
            ? '代理请求超时 (火山引擎 25s 内未响应)'
            : '代理请求失败: ' + err.message;
        return new Response(
            JSON.stringify({ error: msg }),
            {
                status: 502,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            }
        );
    } finally {
        clearTimeout(timeout);
    }
}

/* ============================================================
   CloudBase 云托管部署说明 (Node.js)
   若使用 CloudBase 云托管，可用如下 server.js (Express 风格):

   ```js
   // server.js  (需 npm i express)
   const express = require('express');
   const app = express();
   app.use(express.raw({ type: '*/*', limit: '10mb' }));

   app.post('/tts', async (req, res) => {
       const volcHeaders = {
           'Content-Type': 'application/json',
           'Connection': 'keep-alive',
       };
       const apiKey = req.get('X-Api-Key');
       if (apiKey) {
           volcHeaders['X-Api-Key'] = apiKey;
           volcHeaders['X-Api-Resource-Id'] = req.get('X-Api-Resource-Id') || 'seed-tts-2.0';
           volcHeaders['X-Api-Request-Id'] = req.get('X-Api-Request-Id') || crypto.randomUUID();
       }
       if (req.get('X-Api-App-Key')) volcHeaders['X-Api-App-Key'] = req.get('X-Api-App-Key');
       if (req.get('X-Api-Access-Key')) volcHeaders['X-Api-Access-Key'] = req.get('X-Api-Access-Key');

       const ctrl = new AbortController();
       const t = setTimeout(() => ctrl.abort(), 25000);
       try {
           const r = await fetch('https://openspeech.bytedance.com/api/v3/tts/unidirectional', {
               method: 'POST', headers: volcHeaders, body: req.body, signal: ctrl.signal,
           });
           res.status(r.status);
           r.headers.forEach((v, k) => res.setHeader(k, v));
           res.setHeader('Access-Control-Allow-Origin', '*');
           const buf = Buffer.from(await r.arrayBuffer());
           res.send(buf);
       } catch (e) {
           res.status(502).json({ error: '代理请求失败: ' + e.message });
       } finally {
           clearTimeout(t);
       }
   });

   app.listen(process.env.PORT || 3000);
   ```
   前端代理地址填: https://<你的云托管域名>/tts
   ============================================================ */

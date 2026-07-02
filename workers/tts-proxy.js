/* ============================================================
   Cloudflare Worker — 火山引擎 TTS CORS 代理

   部署步骤:
   1. 登录 https://dash.cloudflare.com/
   2. Workers & Pages → Create Worker
   3. 粘贴此文件全部内容 → Deploy
   4. 复制 Worker URL (如 https://tts-proxy.你的用户名.workers.dev)
   5. 填入右侧设置面板的 "代理地址"

   费用: 免费 (10万次/天)
   ============================================================ */

export default {
    async fetch(request) {
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

        // 新版 API Key 鉴权
        const apiKey = request.headers.get('X-Api-Key');
        const resourceId = request.headers.get('X-Api-Resource-Id');
        const requestId = request.headers.get('X-Api-Request-Id');

        if (apiKey) {
            volcHeaders['X-Api-Key'] = apiKey;
            volcHeaders['X-Api-Resource-Id'] = resourceId || 'seed-tts-2.0';
            volcHeaders['X-Api-Request-Id'] = requestId || crypto.randomUUID();
        }

        // 旧版 App ID + Access Key 鉴权
        const appKey = request.headers.get('X-Api-App-Key');
        const accessKey = request.headers.get('X-Api-Access-Key');
        if (appKey) volcHeaders['X-Api-App-Key'] = appKey;
        if (accessKey) volcHeaders['X-Api-Access-Key'] = accessKey;

        try {
            // 调用火山引擎 TTS HTTP V3 API
            const volcResponse = await fetch(
                'https://openspeech.bytedance.com/api/v3/tts/unidirectional',
                {
                    method: 'POST',
                    headers: volcHeaders,
                    body: request.body,
                }
            );

            // 构建响应，添加 CORS 头
            const responseHeaders = new Headers(volcResponse.headers);
            responseHeaders.set('Access-Control-Allow-Origin', '*');
            responseHeaders.set('Access-Control-Expose-Headers', '*');

            return new Response(volcResponse.body, {
                status: volcResponse.status,
                statusText: volcResponse.statusText,
                headers: responseHeaders,
            });

        } catch (err) {
            return new Response(
                JSON.stringify({ error: '代理请求失败: ' + err.message }),
                {
                    status: 502,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                    },
                }
            );
        }
    },
};

// Cloudflare Worker — 中转 ModelScope 修图 API
// 部署后把 URL 填到网页的 AI 设置里

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 处理 CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-ModelScope-Async-Mode, X-ModelScope-Task-Type',
        },
      });
    }

    // 转发到 ModelScope（自动补 /v1 前缀）
    const target = `https://api-inference.modelscope.cn/v1${path}`;
    const resp = await fetch(target, {
      method: request.method,
      headers: request.headers,
      body: request.method !== 'GET' ? await request.text() : undefined,
    });

    // 加上 CORS 头
    const headers = new Headers(resp.headers);
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(resp.body, {
      status: resp.status,
      headers,
    });
  },
};

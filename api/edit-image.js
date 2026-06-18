// api/edit-image.js — Vercel Serverless 函数，代理 ModelScope Qwen-Image-Edit API
// 部署后通过 POST /api/edit-image 调用

const MODELSCOPE_API_BASE = 'https://api-inference.modelscope.cn/v1';
const GENERATE_URL = `${MODELSCOPE_API_BASE}/images/generations`;
const MODEL = 'Qwen/Qwen-Image-Edit-2511';
const DEFAULT_SIZE = '1024x1024';
const DEFAULT_NEGATIVE = '模糊, 变形, 低质量';
const POLL_INTERVAL = 2000; // 2 秒轮询一次
const POLL_TIMEOUT = 55000; // 55 秒超时（serverless max 60s）

async function submitTask(imageDataUri, prompt, apiKey) {
  const response = await fetch(GENERATE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-ModelScope-Async-Mode': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      image_url: imageDataUri,
      n: 1,
      size: DEFAULT_SIZE,
      negative_prompt: DEFAULT_NEGATIVE,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`ModelScope 提交失败 (HTTP ${response.status}): ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  const taskId = data.task_id;
  if (!taskId) {
    throw new Error(`未获取到 task_id: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return taskId;
}

async function pollTask(taskId, apiKey) {
  const url = `${MODELSCOPE_API_BASE}/tasks/${taskId}`;
  const startTime = Date.now();

  while (Date.now() - startTime < POLL_TIMEOUT) {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'X-ModelScope-Task-Type': 'image_generation',
      },
    });

    if (!response.ok) {
      throw new Error(`查询任务失败 (HTTP ${response.status})`);
    }

    const data = await response.json();
    const status = data.task_status;

    if (status === 'SUCCEED') {
      // 提取输出图片 URL
      const images = data.output_images || [];
      if (images.length > 0) {
        const imgUrl = typeof images[0] === 'string' ? images[0] : (images[0].url || images[0].image_url || '');
        if (imgUrl) return imgUrl;
      }
      throw new Error('任务完成但未返回图片');
    }

    if (status === 'FAILED') {
      const errMsg = data.message || data.errors?.message || '未知错误';
      throw new Error(`任务执行失败: ${errMsg}`);
    }

    // 等待后重试
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }

  throw new Error(`任务处理超时（${POLL_TIMEOUT / 1000}秒）`);
}

async function downloadImageAsBase64(imageUrl) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`下载结果图片失败 (HTTP ${response.status})`);
  }

  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const contentType = response.headers.get('content-type') || 'image/png';
  return `data:${contentType};base64,${base64}`;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image, prompt } = req.body || {};

  if (!image || !image.startsWith('data:image/')) {
    return res.status(400).json({ error: '缺少 image 参数（需要 base64 data URI）' });
  }

  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: '缺少 prompt 参数（修改指令）' });
  }

  const apiKey = process.env.MODELSCOPE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: '服务端未配置 MODELSCOPE_API_KEY' });
  }

  try {
    console.log(`[edit-image] 提交任务，prompt: ${prompt.slice(0, 60)}...`);
    const taskId = await submitTask(image, prompt.trim(), apiKey);
    console.log(`[edit-image] 任务已提交: ${taskId}`);

    console.log(`[edit-image] 等待结果...`);
    const imageUrl = await pollTask(taskId, apiKey);
    console.log(`[edit-image] 获取到结果图片 URL`);

    console.log(`[edit-image] 下载并转 base64...`);
    const base64Image = await downloadImageAsBase64(imageUrl);
    console.log(`[edit-image] 完成，图片大小: ${(base64Image.length / 1024).toFixed(0)}KB`);

    return res.status(200).json({
      success: true,
      image: base64Image,
      taskId,
    });

  } catch (error) {
    console.error('[edit-image] 错误:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'AI 修图服务暂时不可用，请稍后重试',
    });
  }
}

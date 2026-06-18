// ai.js — 直接调用 AI API（无需后端代理）

const DOUBAO_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const DOUBAO_API_KEY = 'ark-4b152d9d-0ad1-4e65-838f-a52f264ff4ea-12064';
const DOUBAO_MODEL = 'ep-20260616232549-wr6bn';

// ModelScope Qwen-Image-Edit API
const MODELSCOPE_API_BASE = 'https://api-inference.modelscope.cn/v1';
const MODELSCOPE_EDIT_KEY = 'ms-6cd149c2-d1bf-48b4-9d50-23cb26cc94a4';
const MODELSCOPE_EDIT_MODEL = 'Qwen/Qwen-Image-Edit-2511';

function buildPrompt(text, reportType) {
  const typeLabel = reportType === 'safety' ? '安全检查' : '现场管理';

  let extraInstruction = '';
  if (reportType === 'safety') {
    extraInstruction = '在每条润色后的文字末尾，用方括号追加风险描述，格式为 [风险：xxx]，风险描述不超过15个汉字。';
  } else {
    extraInstruction = '在每条润色后的文字末尾，用方括号追加影响说明，格式为 [影响：xxx]，影响描述不超过15个汉字。';
  }

  return `你是一个专业的工厂安全/现场管理文档撰写助手。请将以下口语化的问题描述优化为规范的整改报告书面语言。

原始描述：${text}
报告类型：${typeLabel}

要求：
1. 将口语转为正式书面语，修正错别字和语病
2. 保持原意，不添加不存在的问题细节
3. ${extraInstruction}
4. 生成3个表达风格略有不同的版本（可以详略不同、措辞不同），以JSON数组格式输出

请严格按以下JSON格式输出，不要输出其他内容：
{"options": ["版本1的完整文字", "版本2的完整文字", "版本3的完整文字"]}`;
}

/**
 * 调用豆包 API 优化文字
 * @param {string} text - 原始描述
 * @param {string} reportType - 'safety' | '5s' | 'company'
 * @returns {Promise<string[]>} 3个优化后的选项
 */
async function callDoubaoOptimize(text, reportType) {
  const response = await fetch(DOUBAO_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DOUBAO_API_KEY}`
    },
    body: JSON.stringify({
      model: DOUBAO_MODEL,
      messages: [
        { role: 'user', content: buildPrompt(text, reportType) }
      ],
      temperature: 0.8,
      max_tokens: 2000
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`豆包 API 返回错误 ${response.status}: ${errText}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content || '';

  // 解析 JSON
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        const lines = content.split('\n').filter(l => l.trim());
        parsed = { options: lines.slice(0, 3) };
      }
    } else {
      parsed = { options: [content] };
    }
  }

  const options = (parsed.options || []).slice(0, 3);
  if (options.length === 0) {
    options.push(content.trim());
  }
  while (options.length < 3) {
    options.push(options[0] || content.trim());
  }

  return options;
}

// ---------- 浏览器端图片压缩 ----------

function compressImageBrowser(dataUrl, maxPx = 1024, maxKB = 500) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > maxPx || h > maxPx) {
        const ratio = Math.min(maxPx / w, maxPx / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      let quality = 0.85;
      let result = canvas.toDataURL('image/jpeg', quality);
      while (result.length > maxKB * 1024 && quality > 0.3) {
        quality -= 0.1;
        result = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(result);
    };
    img.src = dataUrl;
  });
}

// ---------- ModelScope 图生图 ----------

/**
 * 直接调用 ModelScope Qwen-Image-Edit API（浏览器端）
 * @param {string} imageDataUrl - base64 图片
 * @param {string} prompt - 修改指令
 * @returns {Promise<{success: boolean, image?: string, error?: string}>}
 */
async function callImageEdit(imageDataUrl, prompt) {
  // 1. 先压缩图片，减少上传时间
  const compressed = await compressImageBrowser(imageDataUrl, 1024, 450);

  // 2. 提交异步任务
  const submitRes = await fetch(`${MODELSCOPE_API_BASE}/images/generations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MODELSCOPE_EDIT_KEY}`,
      'Content-Type': 'application/json',
      'X-ModelScope-Async-Mode': 'true',
    },
    body: JSON.stringify({
      model: MODELSCOPE_EDIT_MODEL,
      prompt: prompt.trim(),
      image_url: compressed,
      n: 1,
      size: '1024x1024',
      negative_prompt: '模糊, 变形, 低质量',
    }),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => '');
    throw new Error(`提交修图任务失败 (${submitRes.status}): ${errText.slice(0, 200)}`);
  }

  const submitData = await submitRes.json();
  const taskId = submitData.task_id;
  if (!taskId) {
    throw new Error('未获取到修图任务ID，请重试');
  }

  // 3. 轮询任务结果（最长等 90 秒）
  const TASK_URL = `${MODELSCOPE_API_BASE}/tasks/${taskId}`;
  const start = Date.now();
  while (Date.now() - start < 90000) {
    await new Promise(r => setTimeout(r, 2000));

    const pollRes = await fetch(TASK_URL, {
      headers: {
        'Authorization': `Bearer ${MODELSCOPE_EDIT_KEY}`,
        'X-ModelScope-Task-Type': 'image_generation',
      },
    });

    if (!pollRes.ok) continue;

    const pollData = await pollRes.json();
    if (pollData.task_status === 'SUCCEED') {
      const images = pollData.output_images || [];
      const imgUrl = typeof images[0] === 'string' ? images[0] : (images[0]?.url || images[0]?.image_url || '');
      if (!imgUrl) throw new Error('修图完成但未返回图片');

      // 4. 下载结果图并转 base64
      const imgRes = await fetch(imgUrl);
      if (!imgRes.ok) throw new Error('下载修图结果失败');
      const blob = await imgRes.blob();
      const resultDataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });

      return { success: true, image: resultDataUrl, taskId };
    }

    if (pollData.task_status === 'FAILED') {
      throw new Error(`修图失败: ${pollData.message || '任务执行出错'}`);
    }
  }

  throw new Error('修图超时，请检查网络后重试');
}

export { callDoubaoOptimize, callImageEdit };

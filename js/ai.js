// ai.js — 直接调用 AI API（无需后端代理）

const DOUBAO_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const DOUBAO_API_KEY = 'ark-4b152d9d-0ad1-4e65-838f-a52f264ff4ea-12064';
const DOUBAO_MODEL = 'ep-20260616232549-wr6bn';

// 火山方舟图片编辑 API (images/generations)
// 使用 Seedream 4.5 图生图，单独 API Key 授权
const ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const IMAGE_EDIT_MODEL = 'seedream-4-5-251128';
const IMAGE_API_KEY = 'ark-a5912081-882c-4cbf-917b-e9cac733f0d8-894c4';

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
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
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
      } catch (e) {
        reject(new Error('图片压缩失败'));
      }
    };
    img.onerror = () => reject(new Error('图片加载失败，请重试'));
    img.src = dataUrl;
  });
}

// ---------- 火山方舟 图生图 ----------

/**
 * 调用火山方舟 images/generations API（Seedream 图生图）
 * 和豆包 AI 润色是同一平台，已验证手机可直连
 * @param {string} imageDataUrl - base64 图片
 * @param {string} prompt - 修改指令
 * @param {function} [onProgress] - 进度回调 (msg: string)
 * @returns {Promise<{success: boolean, image?: string, error?: string}>}
 */
async function callImageEdit(imageDataUrl, prompt, onProgress) {
  const report = (msg) => { console.log('[修图]', msg); if (onProgress) onProgress(msg); };

  try {
    // 1. 压缩图片
    report('正在压缩图片...');
    let compressed;
    try {
      compressed = await compressImageBrowser(imageDataUrl, 1024, 450);
    } catch (e) {
      console.warn('[修图] 压缩失败，使用原图:', e.message);
      compressed = imageDataUrl;
    }

    // 2. 调用火山方舟 images/generations（同步返回，无需轮询）
    report('AI 正在修图（约10-30秒）...');

    let response;
    try {
      response = await fetch(`${ARK_BASE_URL}/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${IMAGE_API_KEY}`,
        },
        body: JSON.stringify({
          model: IMAGE_EDIT_MODEL,
          prompt: prompt.trim(),
          image: [compressed],         // 必须是数组格式
          size: '2K',
          response_format: 'b64_json', // 直接返回 base64，避免二次下载
          watermark: false,
        }),
        signal: (typeof AbortSignal.timeout === 'function')
          ? AbortSignal.timeout(120000)
          : null,
      });
    } catch (e) {
      if (e.name === 'TimeoutError') {
        throw new Error('修图超时（2分钟），请检查网络后重试');
      }
      throw new Error('网络连接失败，请检查网络后重试');
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error('[修图] API 错误:', response.status, errText);

      // 尝试解析错误详情
      let errMsg = '';
      try { const errJson = JSON.parse(errText); errMsg = errJson.error?.message || errJson.error?.code || ''; } catch {}
      if (errMsg) console.error('[修图] 错误详情:', errMsg);

      // 给出具体错误提示（带原始响应用于排查）
      if (response.status === 400) {
        throw new Error(errMsg || errText.slice(0, 200) || '请求格式错误');
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error('API Key 无权访问图片模型，可能需要开通服务');
      }
      if (response.status === 429) {
        throw new Error('请求太频繁，请稍后重试');
      }
      if (response.status >= 500) {
        throw new Error('AI 服务繁忙，请稍后重试');
      }
      throw new Error(`修图失败(${response.status})，请稍后重试`);
    }

    const result = await response.json();

    // 3. 提取结果图片
    if (result.data && result.data[0]) {
      const item = result.data[0];
      let resultImage;

      if (item.b64_json) {
        // 直接拿到 base64，立即可用
        resultImage = 'data:image/jpeg;base64,' + item.b64_json;
        console.log('[修图] 完成（base64）');
      } else if (item.url) {
        // 备用：下载 URL
        report('正在下载结果...');
        let imgRes;
        try {
          imgRes = await fetch(item.url);
        } catch (e) {
          throw new Error('下载结果失败，请检查网络');
        }
        if (!imgRes.ok) throw new Error(`下载失败(${imgRes.status})`);
        const blob = await imgRes.blob();
        resultImage = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('图片读取失败'));
          reader.readAsDataURL(blob);
        });
        console.log('[修图] 完成（URL下载），大小:', (blob.size / 1024).toFixed(0) + 'KB');
      } else {
        throw new Error('修图完成但未返回图片');
      }

      return { success: true, image: resultImage };
    }

    throw new Error('修图完成但未返回图片');

  } catch (e) {
    console.error('[修图] 异常:', e.message);
    throw e;
  }
}

export { callDoubaoOptimize, callImageEdit };

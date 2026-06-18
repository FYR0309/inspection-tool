// api/optimize.js — Vercel Serverless 函数，代理豆包 API 调用
// 部署后通过 POST /api/optimize 调用

const DOUBAO_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const MODEL = 'doubao-pro-32k';

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

  const { text, reportType } = req.body || {};

  if (!text || !text.trim()) {
    return res.status(400).json({ error: '缺少 text 参数' });
  }

  if (!['safety', '5s', 'company'].includes(reportType)) {
    return res.status(400).json({ error: 'reportType 必须为 safety / 5s / company' });
  }

  const apiKey = process.env.DOUBAO_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: '服务端未配置 DOUBAO_API_KEY' });
  }

  try {
    const response = await fetch(DOUBAO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'user', content: buildPrompt(text, reportType) }
        ],
        temperature: 0.8,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('豆包 API 错误:', response.status, errText);
      return res.status(502).json({ error: `豆包 API 返回错误 ${response.status}` });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || '';

    // 解析豆包返回的 JSON
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      // 尝试从内容中提取 JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          // 如果解析失败，手动分行作为备选
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

    // 确保有3个选项
    while (options.length < 3) {
      options.push(options[0] || content.trim());
    }

    return res.status(200).json({ options });

  } catch (error) {
    console.error('请求豆包 API 异常:', error);
    return res.status(500).json({ error: 'AI 服务暂时不可用，请稍后重试' });
  }
}

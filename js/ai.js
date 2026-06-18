// ai.js — 直接调用豆包 API（无需后端代理）

const DOUBAO_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const DOUBAO_API_KEY = 'ark-4b152d9d-0ad1-4e65-838f-a52f264ff4ea-12064';
const MODEL = 'ep-20260616232549-wr6bn';

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

export { callDoubaoOptimize };

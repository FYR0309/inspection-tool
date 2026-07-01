// importer.js — .docx 导入解析 + 照片 OCR
// 依赖全局 JSZip 对象（index.html 中引入）

/**
 * 解析 .docx 文件，提取问题条目
 * 只解析本工具生成的格式（表格结构已知）
 * @param {File} file — .docx 文件
 * @returns {Promise<{items: Array}>}
 */
async function parseDocx(file) {
  // 1. 读取文件
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  // 2. 读取 document.xml
  const docXml = await zip.file('word/document.xml')?.async('string');
  if (!docXml) {
    throw new Error('无法读取文档内容，请确认是有效的 .docx 文件');
  }

  // 3. 解析 XML
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(docXml, 'text/xml');

  // 检查是否有解析错误
  const parseError = xmlDoc.querySelector('parsererror');
  if (parseError) {
    throw new Error('文档 XML 解析失败，文件可能已损坏');
  }

  // 4. 提取所有表格行（跳过表头第一行）
  const rows = xmlDoc.querySelectorAll('w\\:tbl w\\:tr, tbl tr');
  if (rows.length < 2) {
    throw new Error('未在文档中找到问题条目。仅支持本工具生成的报告格式');
  }

  // 5. 提取图片关系映射 (rId → media/imageN.jpeg)
  const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string');
  const imageMap = {};
  if (relsXml) {
    const relsDoc = parser.parseFromString(relsXml, 'text/xml');
    const relationships = relsDoc.querySelectorAll('Relationship');
    relationships.forEach(rel => {
      const id = rel.getAttribute('Id');
      const target = rel.getAttribute('Target');
      if (target && target.startsWith('media/')) {
        imageMap[id] = target;
      }
    });
  }

  // 6. 逐行解析
  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const cells = row.querySelectorAll('w\\:tc, tc');

    const item = {
      description: '',
      beforePhoto: '',
      afterPhoto: '',
      status: '待整改',
    };

    const cellCount = cells.length;

    if (cellCount === 6) {
      // safety 类型：序号/部门/问题描述/整改前图片/整改后图片/备注
      item.description = extractCellText(cells[2]);
      item.beforePhoto = await extractCellImage(cells[3], zip, imageMap);
      item.afterPhoto = await extractCellImage(cells[4], zip, imageMap);
      const remark = extractCellText(cells[5]);
      if (remark.includes('已整改')) item.status = '已整改';
    } else if (cellCount === 5) {
      // 5s/company 类型：序号/存在问题/整改前图片/整改后图片/备注
      item.description = extractCellText(cells[1]);
      item.beforePhoto = await extractCellImage(cells[2], zip, imageMap);
      item.afterPhoto = await extractCellImage(cells[3], zip, imageMap);
      const remark = extractCellText(cells[4]);
      if (remark.includes('已整改')) item.status = '已整改';
    } else {
      continue;
    }

    // 跳过完全空行
    if (!item.description && !item.beforePhoto && !item.afterPhoto) continue;

    items.push(item);
  }

  if (items.length === 0) {
    throw new Error('未从文档中提取到问题条目。仅支持本工具生成的报告格式');
  }

  return { items };
}

/**
 * 提取单元格中的纯文本
 */
function extractCellText(cell) {
  if (!cell) return '';
  const texts = cell.querySelectorAll('w\\:t, t');
  return Array.from(texts).map(t => t.textContent || '').join('').trim();
}

/**
 * 提取单元格中的图片，转为 base64 data URL
 */
async function extractCellImage(cell, zip, imageMap) {
  if (!cell) return '';

  const blips = cell.querySelectorAll('a\\:blip, blip');
  for (const blip of blips) {
    const embed = blip.getAttribute('r:embed') || blip.getAttribute('embed');
    if (!embed) continue;

    const mediaPath = imageMap[embed];
    if (!mediaPath) continue;

    const imageFile = zip.file('word/' + mediaPath);
    if (!imageFile) continue;

    const imageData = await imageFile.async('base64');
    const ext = mediaPath.split('.').pop().toLowerCase();
    const mimeMap = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', gif: 'gif', bmp: 'bmp', webp: 'webp' };
    const mime = mimeMap[ext] || 'jpeg';

    return `data:image/${mime};base64,${imageData}`;
  }

  return '';
}

// ---------- 照片 OCR ----------

/**
 * 用豆包视觉模型从照片中提取问题描述
 * @param {File|string} photo — File 对象或 base64 data URL
 * @returns {Promise<{description: string, photo: string}>}
 */
async function parsePhoto(photo) {
  // 1. 转为 data URL
  let dataUrl;
  if (photo instanceof File) {
    dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(photo);
    });
  } else {
    dataUrl = photo;
  }

  // 2. 压缩图片（OCR 不需要太高分辨率）
  const compressed = await compressImageForOCR(dataUrl);

  // 3. 调用豆包视觉模型
  const API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
  const API_KEY = 'ark-4b152d9d-0ad1-4e65-838f-a52f264ff4ea-12064';
  const VISION_MODEL = 'ep-20260616232549-wr6bn'; // 豆包模型（支持视觉则直接用）

  // 去掉 data:image/...;base64, 前缀
  const base64Data = compressed.split(',')[1] || compressed;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${base64Data}` }
              },
              {
                type: 'text',
                text: '请识别这张安全检查照片中的问题，用简洁的整改报告书面语言描述。只输出一句话的问题描述，不要加序号、标签或解释。'
              }
            ]
          }
        ],
        temperature: 0.3,
        max_tokens: 300
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error('[OCR] API 错误:', response.status, errText.substring(0, 200));
      // 400 通常意味着模型不支持视觉，降级处理
      if (response.status === 400) {
        console.warn('[OCR] 模型可能不支持视觉，降级为纯图片导入');
        return {
          description: '（请手动填写问题描述）',
          photo: dataUrl,
        };
      }
      throw new Error(`AI 识别失败(${response.status})`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || '';
    const description = content.trim();

    return {
      description: description || '（AI 未能识别，请手动描述）',
      photo: dataUrl,
    };
  } catch (e) {
    // 网络错误等 → 降级
    console.warn('[OCR] 请求异常，降级为纯图片导入:', e.message);
    return {
      description: '（请手动填写问题描述）',
      photo: dataUrl,
    };
  }
}

/**
 * 压缩图片用于 OCR（比修图压缩轻，保留更多细节）
 */
function compressImageForOCR(dataUrl, maxKB = 800) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      const MAX_PX = 1500;
      if (w > MAX_PX || h > MAX_PX) {
        const ratio = Math.min(MAX_PX / w, MAX_PX / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      let quality = 0.9;
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

export { parseDocx, parsePhoto };

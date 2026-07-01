// importer.js — .docx 导入解析 + 照片 OCR
// 依赖全局 JSZip 对象（index.html 中引入）

/**
 * 解析 .docx 文件，提取问题条目
 * 只解析本工具生成的格式（表格结构已知）
 * @param {File} file — .docx 文件
 * @returns {Promise<{items: Array, reportType: string|null}>}
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

  // 7. 尝试检测报告类型
  let reportType = null;
  const docText = docXml.replace(/<[^>]+>/g, ' ');
  if (docText.includes('安全自检自查') || docText.includes('安全自查')) {
    reportType = 'safety';
  } else if (docText.includes('5S') || docText.includes('5s')) {
    reportType = '5s';
  } else if (docText.includes('现场整改')) {
    reportType = 'company';
  }

  return { items, reportType };
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

export { parseDocx };

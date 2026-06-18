// docx-gen.js — Word 文档生成（依赖全局 docx 对象）

const { Document, Packer, Paragraph, Table, TableRow, TableCell,
        ImageRun, TextRun, AlignmentType, WidthType, BorderStyle,
        ShadingType, convertInchesToTwip, HeightRule } = docx;

// ---------- 图片压缩 ----------

function compressImageForDocx(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_DIM = 800;
      let w = img.width, h = img.height;
      if (w > MAX_DIM || h > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      let quality = 0.8;
      let result = canvas.toDataURL('image/jpeg', quality);
      while (result.length > 450 * 1024 && quality > 0.25) {
        quality -= 0.1;
        result = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(result);
    };
    img.src = dataUrl;
  });
}

// ---------- 常量 ----------

const TABLE_WIDTH = 9000;       // 表格总宽 (twips)
const IMG_SIZE = 1400;          // 图片尺寸 ≈ 2.5cm，统一大小
const DATA_ROW_HEIGHT = 2400;   // 数据行高 ≈ 4.2cm，4行/页 + 表头

// ---------- 工具 ----------

function base64ToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function cellBorder() {
  return {
    top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
    left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
    right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
  };
}

function getColumns(reportType) {
  if (reportType === 'safety') {
    return [
      { label: '序号', width: 5 },
      { label: '部门', width: 8 },
      { label: '问题描述', width: 30 },
      { label: '整改前图片', width: 23 },
      { label: '整改后图片', width: 23 },
      { label: '备注', width: 11 },
    ];
  }
  return [
    { label: '序号', width: 5 },
    { label: '存在问题', width: 38 },
    { label: '整改前图片', width: 23 },
    { label: '整改后图片', width: 23 },
    { label: '备注', width: 11 },
  ];
}

function cellWidthVal(pct) {
  return Math.floor(TABLE_WIDTH * pct / 100);
}

// ---------- 单元格 ----------

function textCell(text, pct, opts = {}) {
  return new TableCell({
    width: { size: cellWidthVal(pct), type: WidthType.DXA },
    borders: cellBorder(),
    margins: { top: 40, bottom: 40, left: 60, right: 60 },
    children: [
      new Paragraph({
        children: [new TextRun({
          text: String(text || ''),
          size: 18,
          font: 'SimSun',
        })],
        alignment: opts.align || AlignmentType.CENTER,
        spacing: { before: 20, after: 20 },
      }),
    ],
    verticalAlign: 'center',
  });
}

function imageCell(dataUrl, pct) {
  const children = [];
  if (dataUrl && dataUrl.startsWith('data:image')) {
    try {
      // 同步创建 ImageRun —— 图片已在上层压缩过
      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              data: base64ToBytes(dataUrl),
              transformation: { width: IMG_SIZE, height: IMG_SIZE },
              type: 'jpg',
            }),
          ],
          alignment: AlignmentType.CENTER,
        })
      );
    } catch (e) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: '(图片错误)', size: 14, italics: true })],
          alignment: AlignmentType.CENTER,
        })
      );
    }
  }
  return new TableCell({
    width: { size: cellWidthVal(pct), type: WidthType.DXA },
    borders: cellBorder(),
    margins: { top: 40, bottom: 40, left: 60, right: 60 },
    children: children.length > 0 ? children : [new Paragraph({ children: [] })],
    verticalAlign: 'center',
  });
}

// ---------- 行 ----------

function headerRow(reportType) {
  const cols = getColumns(reportType);
  return new TableRow({
    height: { value: 500, rule: HeightRule.EXACT },
    tableHeader: true,
    children: cols.map(col =>
      new TableCell({
        width: { size: cellWidthVal(col.width), type: WidthType.DXA },
        borders: cellBorder(),
        shading: { type: ShadingType.SOLID, color: 'D9E2F3' },
        margins: { top: 20, bottom: 20, left: 40, right: 40 },
        children: [
          new Paragraph({
            children: [new TextRun({ text: col.label, size: 18, font: 'SimSun', bold: true })],
            alignment: AlignmentType.CENTER,
          }),
        ],
        verticalAlign: 'center',
      })
    ),
  });
}

async function dataRow(index, item, reportType) {
  const cols = getColumns(reportType);
  const cells = [];

  for (const col of cols) {
    if (col.label === '序号') {
      cells.push(textCell(index, col.width));
    } else if (col.label === '部门') {
      cells.push(textCell(item.department || '压榨', col.width));
    } else if (col.label.includes('问题')) {
      cells.push(textCell(item.description || '', col.width, { align: AlignmentType.LEFT }));
    } else if (col.label.includes('整改前')) {
      // 先压缩再放图
      let compressed = item.beforePhoto;
      if (compressed && compressed.startsWith('data:image')) {
        try { compressed = await compressImageForDocx(compressed); } catch(e) {}
      }
      cells.push(imageCell(compressed, col.width));
    } else if (col.label.includes('整改后')) {
      let compressed = item.afterPhoto;
      if (compressed && compressed.startsWith('data:image')) {
        try { compressed = await compressImageForDocx(compressed); } catch(e) {}
      }
      cells.push(imageCell(compressed, col.width));
    } else if (col.label === '备注') {
      cells.push(textCell(item.afterPhoto ? '已整改' : '', col.width));
    }
  }

  return new TableRow({
    height: { value: DATA_ROW_HEIGHT, rule: HeightRule.EXACT },
    children: cells,
  });
}

// ---------- 日期 ----------

function pickWorkday(year, month, startDay, endDay) {
  for (let d = startDay; d <= endDay; d++) {
    const date = new Date(year, month - 1, d);
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6) return date;
  }
  return new Date(year, month - 1, endDay);
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ---------- 主函数 ----------

async function generateDocx(reportType, header, items) {
  const { company, department, date: sigDate, halfMonth } = header;
  const totalItems = items.length;
  const completedItems = items.filter(i => i.afterPhoto).length;
  const unfinishedItems = totalItems - completedItems;

  const sigDateObj = sigDate ? new Date(sigDate) : new Date();
  const year = sigDateObj.getFullYear();
  const month = sigDateObj.getMonth() + 1;

  let titleText, overviewText;

  if (reportType === 'safety') {
    titleText = '安全自检自查整改报告';
    const check1 = pickWorkday(year, month, sigDateObj.getDate() - 10, sigDateObj.getDate() - 8);
    const check2 = pickWorkday(year, month, sigDateObj.getDate() - 3, sigDateObj.getDate() - 1);
    overviewText = `根据公司安全管理要求，我车间（部门）分别于${formatDate(check1)}、${formatDate(check2)}开展安全自检自查工作，其中提出了（${totalItems}）个整改项，并已整改完成（${completedItems}）项，未能完成整改（${unfinishedItems}）项。现将整改情况反馈如下：`;
  } else if (reportType === '5s') {
    const halfLabel = halfMonth === 'first' ? '上半月' : '下半月';
    const startD = halfMonth === 'first' ? 13 : 23;
    const endD = halfMonth === 'first' ? 16 : 26;
    const checkWorkday = pickWorkday(year, month, startD, endD);
    titleText = `${year}年${month}月${department}5S现场检查通报（${halfLabel}）`;
    overviewText = `根据红糖发（2022）22号关于印发《广西糖业集团红河制糖有限公司5S现场管理》相关要求，车间组织相关人员于${formatDate(checkWorkday)}对本车间进行${halfLabel}现场检查，现将检查情况反馈如下：本次检查需要整改的共${totalItems}项，其中已整改完成${completedItems}项，未完成整改${unfinishedItems}项。`;
  } else {
    titleText = `${department}现场整改报告`;
    const checkD = pickWorkday(year, month, sigDateObj.getDate() - 5, sigDateObj.getDate() - 1);
    overviewText = `${formatDate(checkD)}公司现场检查小组对我车间进行现场检查，提出${totalItems}个整改项，已整改完成${completedItems}项，未完成${unfinishedItems}项，附整改前后对比照片。`;
  }

  // 构建表格
  const rows = [headerRow(reportType)];
  for (let i = 0; i < items.length; i++) {
    rows.push(await dataRow(i + 1, { ...items[i], department }, reportType));
  }

  const table = new Table({
    rows,
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
  });

  // 构建文档
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(0.6),
            bottom: convertInchesToTwip(0.6),
            left: convertInchesToTwip(0.6),
            right: convertInchesToTwip(0.6),
          },
        },
      },
      children: [
        new Paragraph({
          children: [new TextRun({ text: titleText, size: 32, font: 'SimHei', bold: true })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [new TextRun({ text: overviewText, size: 22, font: 'SimSun' })],
          spacing: { after: 150 },
          indent: { firstLine: convertInchesToTwip(0.35) },
        }),
        table,
        new Paragraph({ children: [], spacing: { after: 150 } }),
        new Paragraph({
          children: [new TextRun({ text: company, size: 22, font: 'SimSun' })],
          alignment: AlignmentType.RIGHT,
        }),
        new Paragraph({
          children: [new TextRun({ text: `    ${department}`, size: 22, font: 'SimSun' })],
          alignment: AlignmentType.RIGHT,
        }),
        new Paragraph({
          children: [new TextRun({ text: formatDate(sigDateObj), size: 22, font: 'SimSun' })],
          alignment: AlignmentType.RIGHT,
          spacing: { after: 200 },
        }),
        ...(reportType !== 'safety' ? [
          new Paragraph({
            children: [new TextRun({ text: '编制：               审核：                 批准：', size: 22, font: 'SimSun' })],
          }),
        ] : []),
      ],
    }],
  });

  return await Packer.toBlob(doc);
}

export { generateDocx, pickWorkday, formatDate };

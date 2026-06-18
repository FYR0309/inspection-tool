// docx-gen.js — Word 文档生成（依赖 docx.js CDN 加载的全局 docx 对象）

const { Document, Packer, Paragraph, Table, TableRow, TableCell,
        ImageRun, TextRun, AlignmentType, WidthType, BorderStyle,
        ShadingType, convertInchesToTwip } = docx;

// ---------- 图片压缩 ----------

function compressImageForDocx(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // 目标：图片适合打印且 < 500KB
      const MAX_DIM = 900;
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

      // 二分法压缩到 500KB 以下
      let quality = 0.85;
      let result = canvas.toDataURL('image/jpeg', quality);
      while (result.length > 500 * 1024 && quality > 0.25) {
        quality -= 0.1;
        result = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(result);
    };
    img.src = dataUrl;
  });
}

// ---------- 工具函数 ----------

function base64ToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** 表格总宽度（twips）≈ A4纸宽减页边距 */
const TABLE_WIDTH = 9000;
/** 图片尺寸：填满单元格（约3.5cm，留微小边距） */
const IMG_SIZE = 1950; // twips ≈ 3.44cm

/** 根据 reportType 获取列定义 */
function getColumns(reportType) {
  if (reportType === 'safety') {
    return [
      { label: '序号', width: 6 },
      { label: '部门', width: 8 },
      { label: '问题描述', width: 28 },
      { label: '整改前图片', width: 24 },
      { label: '整改后图片', width: 24 },
      { label: '备注', width: 10 },
    ];
  }
  return [
    { label: '序号', width: 6 },
    { label: '存在问题', width: 36 },
    { label: '整改前图片', width: 24 },
    { label: '整改后图片', width: 24 },
    { label: '备注', width: 10 },
  ];
}

function cellStyle(widthPercent, opts = {}) {
  const width = Math.floor(TABLE_WIDTH * widthPercent / 100);
  return {
    width: { size: width, type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1 },
      bottom: { style: BorderStyle.SINGLE, size: 1 },
      left: { style: BorderStyle.SINGLE, size: 1 },
      right: { style: BorderStyle.SINGLE, size: 1 },
    },
    ...opts,
  };
}

function textCell(text, widthPercent, opts = {}) {
  return new TableCell({
    ...cellStyle(widthPercent),
    children: [
      new Paragraph({
        children: [new TextRun({ text: String(text || ''), size: 18, font: 'SimSun' })],
        alignment: opts.alignment || AlignmentType.CENTER,
        spacing: { before: 20, after: 20 },
      }),
    ],
    verticalAlign: 'center',
  });
}

/** 图片单元格：图片铺满，自动压缩 */
async function imageCell(imageDataUrl, widthPercent) {
  const children = [];
  if (imageDataUrl && imageDataUrl.startsWith('data:image')) {
    try {
      // 压缩图片到 500KB 以下
      const compressed = await compressImageForDocx(imageDataUrl);
      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              data: base64ToBytes(compressed),
              transformation: { width: IMG_SIZE, height: IMG_SIZE },
              type: 'jpg',
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 30, after: 30 },
        })
      );
    } catch (e) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: '(图片加载失败)', size: 14, italics: true })],
          alignment: AlignmentType.CENTER,
        })
      );
    }
  } else {
    children.push(
      new Paragraph({ children: [], spacing: { before: 200, after: 200 } })
    );
  }
  return new TableCell({
    ...cellStyle(widthPercent),
    children,
    verticalAlign: 'center',
  });
}

function headerRow(reportType) {
  const cols = getColumns(reportType);
  return new TableRow({
    tableHeader: true,
    children: cols.map(col =>
      new TableCell({
        ...cellStyle(col.width, {
          shading: { type: ShadingType.SOLID, color: 'D9E2F3' },
        }),
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

/** 数据行（异步处理图片） */
async function dataRow(index, item, reportType) {
  const cols = getColumns(reportType);
  const cells = [];

  for (const col of cols) {
    if (col.label === '序号') {
      cells.push(textCell(index, col.width));
    } else if (col.label === '部门') {
      cells.push(textCell(item.department || '压榨', col.width));
    } else if (col.label.includes('问题')) {
      cells.push(textCell(item.description || '', col.width, { alignment: AlignmentType.LEFT }));
    } else if (col.label.includes('整改前')) {
      cells.push(await imageCell(item.beforePhoto, col.width));
    } else if (col.label.includes('整改后')) {
      cells.push(await imageCell(item.afterPhoto, col.width));
    } else if (col.label === '备注') {
      // 如果上传了整改后图片，备注填"已整改"
      cells.push(textCell(item.afterPhoto ? '已整改' : '', col.width));
    }
  }

  return new TableRow({ children: cells });
}

// ---------- 日期工具 ----------

/** 避开周末，从指定日期范围中选一个工作日 */
function pickWorkday(year, month, startDay, endDay) {
  for (let d = startDay; d <= endDay; d++) {
    const date = new Date(year, month - 1, d);
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6) return date; // 不是周日(0)或周六(6)
  }
  return new Date(year, month - 1, endDay);
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ---------- 主生成函数 ----------

/**
 * 生成整改报告 Word 文档
 * @param {string} reportType - 'safety' | '5s' | 'company'
 * @param {object} header - { company, department, date, checkDate, totalItems, completedItems, halfMonth }
 * @param {Array} items - [{ description, beforePhoto, afterPhoto }]
 * @returns {Promise<Blob>} docx blob
 */
async function generateDocx(reportType, header, items) {
  const { company, department, date: sigDate, halfMonth } = header;
  const totalItems = items.length;
  const completedItems = items.filter(i => i.afterPhoto).length;
  const unfinishedItems = totalItems - completedItems;

  // 解析落款日期
  const sigDateObj = sigDate ? new Date(sigDate) : new Date();
  const year = sigDateObj.getFullYear();
  const month = sigDateObj.getMonth() + 1;

  // ---- 标题和概述 ----
  let titleText, overviewText;

  if (reportType === 'safety') {
    titleText = '安全自检自查整改报告';
    // 计算自查日期：落款日期前 1-3 天（避开周末）
    const check1 = pickWorkday(year, month, sigDateObj.getDate() - 10, sigDateObj.getDate() - 8);
    const check2 = pickWorkday(year, month, sigDateObj.getDate() - 3, sigDateObj.getDate() - 1);
    overviewText = `根据公司安全管理要求，我车间（部门）分别于${formatDate(check1)}、${formatDate(check2)}开展安全自检自查工作，其中提出了（${totalItems}）个整改项，并已整改完成（${completedItems}）项，未能完成整改（${unfinishedItems}）项。现将整改情况反馈如下：`;
  } else if (reportType === '5s') {
    const halfLabel = halfMonth === 'first' ? '上半月' : '下半月';
    const startD = halfMonth === 'first' ? 13 : 23;
    const endD = halfMonth === 'first' ? 16 : 26;
    const checkWorkday = pickWorkday(year, month, startD, endD);
    titleText = `${year}年${month}月${department}5S现场检查通报（${halfLabel}）`;
    overviewText = `根据红糖发（2022）22号关于印发《广西糖业集团红河制糖有限公司5S现场管理》相关要求，车间组织相关人员于${formatDate(checkWorkday)}对本车间进行现场检查，现将检查情况反馈如下：本次检查需要整改的共${totalItems}项，其中已整改完成${completedItems}项，未完成整改${unfinishedItems}项。`;
  } else { // company
    titleText = `${department}现场整改报告`;
    const checkD = pickWorkday(year, month, sigDateObj.getDate() - 5, sigDateObj.getDate() - 1);
    overviewText = `${formatDate(checkD)}公司现场检查小组对我车间进行现场检查，提出${totalItems}个整改项，已整改完成${completedItems}项，未完成${unfinishedItems}项，附整改前后对比照片。`;
  }

  // ---- 构建表格 ----
  const rows = [headerRow(reportType)];
  for (let i = 0; i < items.length; i++) {
    rows.push(await dataRow(i + 1, { ...items[i], department }, reportType));
  }

  const table = new Table({
    rows,
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
  });

  // ---- 构建文档 ----
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(0.8),
            bottom: convertInchesToTwip(0.8),
            left: convertInchesToTwip(0.8),
            right: convertInchesToTwip(0.8),
          },
        },
      },
      children: [
        // 标题
        new Paragraph({
          children: [new TextRun({ text: titleText, size: 32, font: 'SimHei', bold: true })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 300 },
        }),
        // 概述
        new Paragraph({
          children: [new TextRun({ text: overviewText, size: 22, font: 'SimSun' })],
          spacing: { after: 200 },
          indent: { firstLine: convertInchesToTwip(0.35) },
        }),
        // 表格
        table,
        new Paragraph({ children: [], spacing: { after: 200 } }),
        // 落款
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
          spacing: { after: 300 },
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

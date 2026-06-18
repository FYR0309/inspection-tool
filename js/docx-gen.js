// docx-gen.js — Word 文档生成（依赖 docx.js CDN 加载的全局 docx 对象）

const { Document, Packer, Paragraph, Table, TableRow, TableCell,
        ImageRun, TextRun, AlignmentType, WidthType, BorderStyle,
        ShadingType, convertInchesToTwip } = docx;

// ---------- 工具函数 ----------

/** 将 base64 Data URL 转为 Uint8Array */
function base64ToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** 根据 reportType 获取列定义 */
function getColumns(reportType) {
  if (reportType === 'safety') {
    return [
      { label: '序号', width: 8 },
      { label: '部门', width: 10 },
      { label: '问题描述', width: 32 },
      { label: '整改前图片', width: 25 },
      { label: '整改后图片', width: 25 },
    ];
  }
  // 5s 和 company：无部门列
  return [
    { label: '序号', width: 8 },
    { label: '存在问题', width: 42 },
    { label: '整改前图片', width: 25 },
    { label: '整改后图片', width: 25 },
  ];
}

/** 表格总宽度（twips）: A4纸宽 - 页边距 ≈ 9000 twips */
const TABLE_WIDTH = 9000;
/** 图片在单元格中的目标尺寸（twips），约3cm×3cm */
const IMG_SIZE = convertInchesToTwip(1.18);

/** 创建单元格样式 */
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

/** 普通文字单元格 */
function textCell(text, widthPercent, opts = {}) {
  return new TableCell({
    ...cellStyle(widthPercent),
    children: [
      new Paragraph({
        children: [new TextRun({ text: String(text || ''), size: 20, font: 'SimSun' })],
        alignment: AlignmentType.CENTER,
        ...opts.paragraphOpts,
      }),
    ],
    verticalAlign: 'center',
  });
}

/** 图片单元格 */
function imageCell(imageDataUrl, widthPercent) {
  const children = [];
  if (imageDataUrl && imageDataUrl.startsWith('data:image')) {
    try {
      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              data: base64ToBytes(imageDataUrl),
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
          children: [new TextRun({ text: '(图片加载失败)', size: 16, italics: true })],
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

/** 表头行 */
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
            children: [new TextRun({ text: col.label, size: 20, font: 'SimSun', bold: true })],
            alignment: AlignmentType.CENTER,
          }),
        ],
        verticalAlign: 'center',
      })
    ),
  });
}

/** 数据行 */
function dataRow(index, item, reportType) {
  const cols = getColumns(reportType);
  const cells = [];

  cols.forEach(col => {
    if (col.label === '序号') {
      cells.push(textCell(index, col.width));
    } else if (col.label === '部门') {
      cells.push(textCell(item.department || '压榨', col.width));
    } else if (col.label.includes('问题')) {
      cells.push(textCell(item.description || '', col.width, {
        paragraphOpts: { alignment: AlignmentType.LEFT },
      }));
    } else if (col.label.includes('整改前')) {
      cells.push(imageCell(item.beforePhoto, col.width));
    } else if (col.label.includes('整改后')) {
      cells.push(imageCell(item.afterPhoto, col.width));
    }
  });

  return new TableRow({ children: cells });
}

// ---------- 主生成函数 ----------

/**
 * 生成整改报告 Word 文档
 * @param {string} reportType - 'safety' | '5s' | 'company'
 * @param {object} header - { company, department, date, checkDates, totalItems, completedItems }
 * @param {Array} items - [{ description, beforePhoto, afterPhoto, status }]
 * @returns {Promise<Blob>} docx blob
 */
async function generateDocx(reportType, header, items) {
  const { company, department, date, checkDates, totalItems, completedItems } = header;
  const unfinishedItems = totalItems - completedItems;

  // ---- 标题和概述 ----
  let titleText, overviewText;

  if (reportType === 'safety') {
    titleText = '安全自检自查整改报告';
    overviewText = `根据公司安全管理要求，我车间（部门）分别于${checkDates || date}开展安全自检自查工作，其中提出了（${totalItems}）个整改项，并已整改完成（${completedItems}）项，未能完成整改（${unfinishedItems}）项。现将整改情况反馈如下：`;
  } else if (reportType === '5s') {
    const d = new Date(date);
    titleText = `${d.getFullYear()}年${d.getMonth() + 1}月${department}5S现场检查通报`;
    overviewText = `根据红糖发（2022）22号关于印发《广西糖业集团红河制糖有限公司5S现场管理》相关要求，车间组织相关人员于${date}对本车间进行现场检查，现将检查情况反馈如下：本次检查需要整改的共${totalItems}项，其中已整改完成${completedItems}项，未完成整改${unfinishedItems}项。`;
  } else { // company
    titleText = `${department}现场整改报告`;
    overviewText = `${date}公司现场检查小组对我车间进行现场检查，提出${totalItems}个整改项，已全部完成整改${completedItems}项，未完成${unfinishedItems}项，附整改前后对比照片。`;
  }

  // ---- 构建表格 ----
  const rows = [headerRow(reportType)];
  items.forEach((item, i) => {
    rows.push(dataRow(i + 1, { ...item, department }, reportType));
  });

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
        // 空行
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
          children: [new TextRun({ text: date, size: 22, font: 'SimSun' })],
          alignment: AlignmentType.RIGHT,
          spacing: { after: 300 },
        }),
        // 编制/审核/批准（5s 和 company 有）
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

export { generateDocx };

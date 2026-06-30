// app.js — 应用主入口：全局状态、页面路由、事件协调

import { saveDraft, getDraft, deleteDraft, listDrafts, getPresets, savePresets, getTodayStr } from './db.js?v=20260630a';
import { generateDocx } from './docx-gen.js?v=20260630a';
import { callDoubaoOptimize } from './ai.js?v=20260630a';
import {
  showToast, FIXED_COMPANY, FIXED_DEPARTMENT,
  renderHomePage,
  renderItemList,
  renderItemForm,
  renderOptimizePage,
  showEditModal,
  renderGeneratePage,
} from './ui.js?v=20260630a';

// ---------- 全局状态 ----------
const state = {
  reportType: null,
  items: [],
  headerInfo: {
    company: FIXED_COMPANY,
    department: FIXED_DEPARTMENT,
    date: getTodayStr(),           // 落款日期
    inspectionDate: getTodayStr(), // 检查日期
    halfMonth: null, // 'first' | 'second' — 仅 5S 使用
  },
  currentPage: 'home',
};

window._showToast = showToast;

// ---------- 首页 ----------

function showHome() {
  listDrafts().then(drafts => {
    renderHomePage({
      drafts,
      onSelectType: (type, resume) => {
        state.reportType = type;

        const defaults = {
          company: FIXED_COMPANY,
          department: FIXED_DEPARTMENT,
          date: getTodayStr(),
          inspectionDate: getTodayStr(),
          halfMonth: type === '5s' ? 'first' : null,
        };

        if (resume) {
          getDraft(type).then(draftData => {
            if (draftData) {
              state.items = draftData.items || [];
              state.headerInfo = { ...defaults, ...draftData.headerInfo };
            }
            showItemList();
          });
        } else {
          state.items = [];
          state.headerInfo = defaults;
          showItemList();
        }
      },
    });
  });
}

// ---------- 条目列表 ----------

function showItemList() {
  const saveCurrentDraft = () => {
    if (state.reportType && state.items.length > 0) {
      saveDraft(state.reportType, {
        items: state.items,
        headerInfo: state.headerInfo,
      }).catch(e => console.error('保存草稿失败:', e));
    }
  };

  renderItemList({
    reportType: state.reportType,
    items: state.items,
    headerInfo: state.headerInfo,
    onAdd: () => showItemForm(),
    onEdit: (index) => showItemForm(index),
    onDelete: (index) => {
      state.items.splice(index, 1);
      saveCurrentDraft();
      showItemList();
    },
    onGenerate: () => {
      if (state.items.length === 0) {
        showToast('请至少添加一条问题记录');
        return;
      }
      showGeneratePage();
    },
    onBack: () => {
      saveCurrentDraft();
      showHome();
    },
  });
}

// ---------- 新增/编辑条目 ----------

function showItemForm(editIndex) {
  const item = editIndex !== undefined ? state.items[editIndex] : null;

  renderItemForm({
    item,
    index: editIndex,
    onSave: (savedItem, idx) => {
      if (idx !== undefined) {
        state.items[idx] = savedItem;
      } else {
        state.items.push(savedItem);
      }
      if (state.reportType) {
        saveDraft(state.reportType, {
          items: state.items,
          headerInfo: state.headerInfo,
        }).catch(e => console.error('保存草稿失败:', e));
      }
      showItemList();
    },
    onCancel: () => showItemList(),
    onOptimize: (text) => showOptimizePage(text),
  });
}

// ---------- AI 润色 ----------

async function showOptimizePage(text) {
  renderOptimizePage({
    text,
    reportType: state.reportType,
    options: ['正在生成...', '正在生成...', '正在生成...'],
    onSelect: () => {}, onEdit: () => {}, onRetry: () => {},
    onBack: () => showItemForm(state.items.length > 0 ? state.items.length - 1 : undefined),
  });

  const container = document.getElementById('options-container');
  if (container) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px;">
        <span class="spinner" style="width:32px;height:32px;"></span>
        <p style="margin-top:12px;color:var(--text-secondary);">AI 正在优化描述...</p>
      </div>`;
  }

  try {
    const options = await callDoubaoOptimize(text, state.reportType);

    renderOptimizePage({
      text,
      reportType: state.reportType,
      options,
      onSelect: (selectedText) => {
        window._optimizedText = selectedText;
        const lastIdx = state.items.length > 0 ? state.items.length - 1 : undefined;
        showItemForm(lastIdx);
        setTimeout(() => {
          const descEl = document.getElementById('item-desc');
          if (descEl && window._optimizedText) {
            descEl.value = window._optimizedText;
            delete window._optimizedText;
          }
        }, 100);
      },
      onEdit: (selectedText) => {
        showEditModal(selectedText, (editedText) => {
          window._optimizedText = editedText;
          const lastIdx = state.items.length > 0 ? state.items.length - 1 : undefined;
          showItemForm(lastIdx);
          setTimeout(() => {
            const descEl = document.getElementById('item-desc');
            if (descEl && window._optimizedText) {
              descEl.value = window._optimizedText;
              delete window._optimizedText;
            }
          }, 100);
        });
      },
      onRetry: () => showOptimizePage(text),
      onBack: () => showItemForm(state.items.length > 0 ? state.items.length - 1 : undefined),
    });
  } catch (e) {
    showToast('网络异常，请检查网络后重试');
    showItemForm(state.items.length > 0 ? state.items.length - 1 : undefined);
  }
}

// ---------- 生成报告 ----------

function showGeneratePage() {
  renderGeneratePage({
    reportType: state.reportType,
    headerInfo: state.headerInfo,
    items: state.items,
    onConfirm: async (action) => {
      showToast('正在生成报告...');

      try {
        const blob = await generateDocx(state.reportType, state.headerInfo, state.items);
        const labels = { safety: '安全自查整改报告', '5s': '5S现场检查通报', company: '现场整改报告' };
        const fileName = `${labels[state.reportType]}_${state.headerInfo.date}.docx`;

        // 先下载到手机
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (action === 'share') {
          // 微信内置浏览器不支持文件分享，先下载再提示
          if (navigator.share && navigator.canShare && navigator.canShare({ url: window.location.href })) {
            try {
              await navigator.share({
                title: '整改报告',
                text: `${labels[state.reportType]}已生成，文件已保存到手机。`,
                url: window.location.href,
              });
            } catch (e) {
              // 用户取消，不提示错误
            }
          }
          showToast('报告已保存到下载，请从微信中发送文件');
        } else {
          showToast('报告已下载');
        }

        // 生成后保留草稿，不清除历史
        state.items = [];

        setTimeout(() => showHome(), 500);

      } catch (e) {
        console.error('生成报告失败:', e);
        showToast('生成报告失败，请重试');
      }
    },
    onBack: () => showItemList(),
    onEditDate: (newDate) => {
      state.headerInfo.date = newDate;
      showGeneratePage();
    },
    onEditInspectionDate: (newDate) => {
      state.headerInfo.inspectionDate = newDate;
      showGeneratePage();
    },
    onToggleHalfMonth: (half) => {
      state.headerInfo.halfMonth = half;
      showGeneratePage();
    },
  });
}

// ---------- 启动 ----------

function init() {
  state.headerInfo.date = getTodayStr();
  showHome();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

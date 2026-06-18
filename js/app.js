// app.js — 应用主入口：全局状态、页面路由、事件协调

import { saveDraft, getDraft, deleteDraft, listDrafts, getPresets, savePresets, getTodayStr } from './db.js';
import { generateDocx } from './docx-gen.js';
import { callDoubaoOptimize } from './ai.js';
import {
  showToast,
  renderHomePage,
  showPresetsEditor,
  renderItemList,
  renderItemForm,
  renderOptimizePage,
  showEditModal,
  renderGeneratePage,
} from './ui.js';

// ---------- 全局状态 ----------
const state = {
  reportType: null,
  items: [],
  headerInfo: {
    company: '',
    department: '',
    date: '',
    checkDates: '',
    totalItems: 0,
    completedItems: 0,
  },
  presets: getPresets(),
  currentPage: 'home',
};

// ---------- Toast 挂到全局供 ui.js 调用 ----------
window._showToast = showToast;

// ---------- 页面路由 ----------

function navigateTo(page) {
  state.currentPage = page;
}

// ---------- 首页逻辑 ----------

function showHome() {
  navigateTo('home');

  listDrafts().then(drafts => {
    renderHomePage({
      presets: state.presets,
      drafts,
      onSelectType: (type, resume) => {
        state.reportType = type;

        if (resume) {
          getDraft(type).then(draftData => {
            if (draftData) {
              state.items = draftData.items || [];
              state.headerInfo = {
                ...state.headerInfo,
                ...draftData.headerInfo,
                company: state.presets.company,
                department: state.presets.department,
                date: draftData.headerInfo?.date || getTodayStr(),
              };
            }
            showItemList();
          });
        } else {
          state.items = [];
          state.headerInfo = {
            company: state.presets.company,
            department: state.presets.department,
            date: getTodayStr(),
            checkDates: getTodayStr(),
            totalItems: 0,
            completedItems: 0,
          };
          showItemList();
        }
      },
      onEditPresets: () => {
        showPresetsEditor(state.presets, (newPresets) => {
          state.presets = newPresets;
          savePresets(newPresets);
          state.headerInfo.company = newPresets.company;
          state.headerInfo.department = newPresets.department;
          showToast('预设已保存');
          showHome();
        });
      },
    });
  });
}

// ---------- 条目列表 ----------

function showItemList() {
  navigateTo('list');

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
  navigateTo('item');
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
  navigateTo('optimize');

  // 先渲染加载状态
  renderOptimizePage({
    text,
    reportType: state.reportType,
    options: ['正在生成...', '正在生成...', '正在生成...'],
    onSelect: () => {},
    onEdit: () => {},
    onRetry: () => {},
    onBack: () => {
      const lastIdx = state.items.length > 0 ? state.items.length - 1 : undefined;
      showItemForm(lastIdx);
    },
  });

  // 显示 spinner
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

    // 重新渲染选择页面
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
      onRetry: () => {
        showOptimizePage(text);
      },
      onBack: () => {
        const lastIdx = state.items.length > 0 ? state.items.length - 1 : undefined;
        showItemForm(lastIdx);
      },
    });
  } catch (e) {
    showToast('网络异常，请检查网络后重试');
    showItemForm(state.items.length > 0 ? state.items.length - 1 : undefined);
  }
}

// ---------- 生成报告 ----------

function showGeneratePage() {
  navigateTo('generate');

  state.headerInfo.totalItems = state.items.length;
  state.headerInfo.completedItems = state.items.filter(i => i.afterPhoto).length;

  renderGeneratePage({
    reportType: state.reportType,
    headerInfo: state.headerInfo,
    items: state.items,
    onConfirm: async (action) => {
      showToast('正在生成报告...');

      try {
        const blob = await generateDocx(state.reportType, state.headerInfo, state.items);

        if (action === 'download') {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          const labels = { safety: '安全自查整改报告', '5s': '5S现场检查通报', company: '现场整改报告' };
          a.download = `${labels[state.reportType]}_${state.headerInfo.date}.docx`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          showToast('报告已下载');
        } else {
          // 微信分享
          if (navigator.share && navigator.canShare) {
            const file = new File([blob], `整改报告_${state.headerInfo.date}.docx`, {
              type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            });
            try {
              await navigator.share({
                title: '整改报告',
                files: [file],
              });
              showToast('已分享');
            } catch (e) {
              if (e.name !== 'AbortError') {
                showToast('分享失败，请尝试下载');
              }
            }
          } else {
            showToast('当前浏览器不支持分享文件，请使用下载');
          }
        }

        // 生成后清除草稿
        if (state.reportType) {
          deleteDraft(state.reportType).catch(() => {});
        }
        state.items = [];
        state.headerInfo.totalItems = 0;
        state.headerInfo.completedItems = 0;

        setTimeout(() => showHome(), 500);

      } catch (e) {
        console.error('生成报告失败:', e);
        showToast('生成报告失败，请重试');
      }
    },
    onBack: () => showItemList(),
    onEditHeader: () => {
      showPresetsEditor(state.headerInfo, (newInfo) => {
        state.headerInfo.company = newInfo.company;
        state.headerInfo.department = newInfo.department;
        state.presets = newInfo;
        savePresets(newInfo);
        showGeneratePage();
      });
    },
  });
}

// ---------- 启动 ----------

function init() {
  state.presets = getPresets();
  state.headerInfo.company = state.presets.company;
  state.headerInfo.department = state.presets.department;
  state.headerInfo.date = getTodayStr();
  showHome();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

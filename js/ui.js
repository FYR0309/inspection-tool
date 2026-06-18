// ui.js — 所有页面视图的渲染函数

import { getPresets, savePresets, getTodayStr } from './db.js';

const pageContainer = document.getElementById('page-container');

// ---------- 固定信息 ----------
const FIXED_COMPANY = '广西糖业集团红河制糖有限公司';
const FIXED_DEPARTMENT = '压榨车间';

// ---------- 通用 ----------

function showToast(msg, duration = 2000) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- 首页 ----------

function renderHomePage({ presets, drafts, onSelectType }) {
  const today = getTodayStr();

  const typeCards = [
    { type: 'safety', icon: '🛡️', title: '安全自查报告', desc: '车间安全自检自查整改' },
    { type: '5s', icon: '📋', title: '现场管理自查报告', desc: '5S 现场检查通报（含上/下半月）' },
    { type: 'company', icon: '🏭', title: '公司现场检查整改报告', desc: '公司检查组检查后整改' },
  ];

  let draftsHtml = '';
  if (drafts && drafts.length > 0) {
    const labels = { safety: '安全自查', '5s': '现场管理', company: '公司检查' };
    draftsHtml = `
      <div style="margin-top:16px;">
        <h3 style="font-size:14px;color:var(--text-secondary);margin-bottom:8px;">📝 未完成的草稿</h3>
        ${drafts.map(d => `
          <div class="card" data-action="resume" data-type="${d.type}" style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:24px;">📄</span>
            <div style="flex:1;">
              <div style="font-weight:600;">${labels[d.type] || d.type}</div>
              <div style="font-size:12px;color:#999;">${d.data?.items?.length || 0} 条记录 · ${new Date(d.updatedAt).toLocaleDateString('zh-CN')}</div>
            </div>
            <span style="color:var(--primary);font-size:13px;">继续 ></span>
          </div>
        `).join('')}
      </div>
    `;
  }

  pageContainer.innerHTML = `
    <div class="page active" id="home-page">
      <h2 style="font-size:22px;margin-bottom:4px;">安全检查报告</h2>
      <p style="color:var(--text-secondary);font-size:13px;margin-bottom:14px;">选择检查类型开始</p>

      <div class="presets-bar">
        🏢 ${escapeHtml(FIXED_COMPANY)} · 👤 ${escapeHtml(FIXED_DEPARTMENT)} · 📅 ${today}
      </div>

      ${typeCards.map(c => `
        <div class="card" data-action="select-type" data-type="${c.type}">
          <span style="font-size:28px;float:left;margin-right:10px;">${c.icon}</span>
          <div class="card-title">${c.title}</div>
          <div class="card-desc">${c.desc}</div>
        </div>
      `).join('')}

      ${draftsHtml}
    </div>
  `;

  document.getElementById('home-page').addEventListener('click', (e) => {
    const card = e.target.closest('[data-action]');
    if (!card) return;
    const action = card.dataset.action;
    if (action === 'select-type') {
      onSelectType(card.dataset.type);
    } else if (action === 'resume') {
      onSelectType(card.dataset.type, true);
    }
  });
}

// ---------- 条目列表页 ----------

function renderItemList({ reportType, items, headerInfo, onAdd, onEdit, onDelete, onGenerate, onBack }) {
  const labels = { safety: '安全自查报告', '5s': '现场管理自查报告', company: '公司现场检查整改报告' };
  const doneCount = items.filter(i => i.afterPhoto).length;
  const doneLabel = items.length > 0 ? `已整改 ${doneCount}/${items.length}` : '';

  // 上传照片数 = 问题项数
  const photoCount = items.filter(i => i.beforePhoto).length;

  pageContainer.innerHTML = `
    <div class="page active" id="list-page">
      <div class="nav-bar">
        <button class="back-btn" id="list-back">←</button>
        <span class="title">${labels[reportType]}</span>
      </div>

      <div style="padding:12px 0;font-size:13px;color:var(--text-secondary);display:flex;justify-content:space-between;">
        <span>📋 ${items.length} 个问题项（📷 ${photoCount} 张照片）</span>
        <span>${doneLabel}</span>
      </div>

      <div id="items-container">
        ${items.length === 0 ? `
          <div style="text-align:center;padding:60px 20px;color:var(--text-secondary);">
            <div style="font-size:48px;margin-bottom:12px;">📸</div>
            <p>还没有添加问题项</p>
            <p style="font-size:13px;">点击下方按钮开始拍照记录</p>
          </div>
        ` : items.map((item, i) => `
          <div class="item-row" data-action="edit" data-index="${i}">
            <div class="thumb">
              ${item.beforePhoto ? `<img src="${item.beforePhoto}" alt="整改前">` : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:20px;color:#999;">📷</div>'}
            </div>
            <div class="info">
              <div class="desc">${escapeHtml(item.description || '(未填写描述)')}</div>
              <div class="meta">
                ${item.beforePhoto ? '📷前' : '⭕无前'} ·
                ${item.afterPhoto ? '📷后' : '⭕无后'} ·
                ${item.afterPhoto ? '✓已整改' : '待整改'}
              </div>
            </div>
            <button style="background:none;border:none;font-size:18px;cursor:pointer;padding:4px;" data-action="delete" data-index="${i}">🗑️</button>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="bottom-bar">
      <button class="btn btn-primary btn-block" id="add-item-btn" style="font-size:18px;">+ 新增问题项</button>
      ${items.length > 0 ? `
        <button class="btn btn-success" id="generate-btn" style="flex-shrink:0;">📄 生成报告</button>
      ` : ''}
    </div>
  `;

  document.getElementById('list-back').onclick = onBack;
  document.getElementById('add-item-btn').onclick = onAdd;
  if (items.length > 0) {
    document.getElementById('generate-btn').onclick = onGenerate;
  }

  document.getElementById('items-container').addEventListener('click', (e) => {
    const row = e.target.closest('[data-action="edit"]');
    if (row) { onEdit(parseInt(row.dataset.index)); return; }
    const delBtn = e.target.closest('[data-action="delete"]');
    if (delBtn) {
      e.stopPropagation();
      if (confirm('确定删除这条记录吗？')) onDelete(parseInt(delBtn.dataset.index));
    }
  });
}

// ---------- 新增/编辑条目页 ----------

function renderItemForm({ item, index, onSave, onCancel, onOptimize }) {
  const isEdit = index !== undefined;
  const desc = item?.description || '';
  const beforePhoto = item?.beforePhoto || '';
  const afterPhoto = item?.afterPhoto || '';

  pageContainer.innerHTML = `
    <div class="page active" id="item-page">
      <div class="nav-bar">
        <button class="back-btn" id="item-back">←</button>
        <span class="title">${isEdit ? '编辑问题项' : '新增问题项'}</span>
      </div>

      <h3 style="font-size:14px;color:var(--text-secondary);margin-bottom:8px;margin-top:8px;">📷 现场照片（点击拍摄）</h3>
      <div class="photo-slots">
        <div class="photo-slot ${beforePhoto ? 'has-photo' : ''}" id="slot-before">
          ${beforePhoto
            ? `<img src="${beforePhoto}" alt="整改前"><div style="position:absolute;bottom:4px;font-size:10px;background:rgba(0,0,0,0.6);color:#fff;padding:2px 6px;border-radius:4px;">整改前 ✓</div>`
            : '<span class="slot-icon">📷</span><span class="slot-label">问题照片</span>'}
          <input type="file" accept="image/*" capture="environment" style="display:none;" id="input-before">
        </div>
        <div class="photo-slot ${afterPhoto ? 'has-photo' : ''}" id="slot-after">
          ${afterPhoto
            ? `<img src="${afterPhoto}" alt="整改后"><div style="position:absolute;bottom:4px;font-size:10px;background:rgba(0,0,0,0.6);color:#fff;padding:2px 6px;border-radius:4px;">整改后 ✓</div>`
            : '<span class="slot-icon">📷</span><span class="slot-label">整改后照片<br><small>(选填，上传=已整改)</small></span>'}
          <input type="file" accept="image/*" capture="environment" style="display:none;" id="input-after">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">问题描述</label>
        <textarea class="form-input" id="item-desc" placeholder="点击下方按钮语音输入或直接打字...">${escapeHtml(desc)}</textarea>
      </div>

      <div style="display:flex;gap:10px;margin-bottom:14px;">
        <button class="btn btn-primary btn-block" id="voice-btn">🎤 语音输入</button>
        <button class="btn btn-outline btn-block" id="text-focus-btn">✏️ 文字输入</button>
      </div>

      <div id="voice-status" style="display:none;text-align:center;padding:12px;background:#fef3c7;border-radius:10px;margin-bottom:10px;">
        <span class="spinner" style="margin-right:8px;vertical-align:middle;"></span>
        <span id="voice-text" style="font-size:14px;">正在聆听...</span>
      </div>

      <button class="btn btn-purple btn-block" id="optimize-btn" ${!desc.trim() ? 'disabled' : ''} style="margin-bottom:10px;${!desc.trim() ? 'opacity:0.5;' : ''}">
        ✨ AI 润色描述
      </button>

      <button class="btn btn-success btn-block" id="save-item-btn">💾 保存</button>
    </div>
  `;

  function setupPhotoSlot(slotId, inputId) {
    const slot = document.getElementById(slotId);
    const input = document.getElementById(inputId);
    slot.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        if (slotId === 'slot-before') {
          window._formBeforePhoto = e.target.result;
        } else {
          window._formAfterPhoto = e.target.result;
        }
        renderItemForm({
          item: {
            description: document.getElementById('item-desc')?.value || desc,
            beforePhoto: slotId === 'slot-before' ? window._formBeforePhoto : (window._formBeforePhoto !== undefined ? window._formBeforePhoto : beforePhoto),
            afterPhoto: slotId === 'slot-after' ? window._formAfterPhoto : (window._formAfterPhoto !== undefined ? window._formAfterPhoto : afterPhoto),
          },
          index,
          onSave, onCancel, onOptimize,
        });
      };
      reader.readAsDataURL(file);
    });
  }

  window._formBeforePhoto = beforePhoto;
  window._formAfterPhoto = afterPhoto;

  setupPhotoSlot('slot-before', 'input-before');
  setupPhotoSlot('slot-after', 'input-after');

  document.getElementById('item-back').onclick = onCancel;
  document.getElementById('text-focus-btn').onclick = () => document.getElementById('item-desc').focus();

  document.getElementById('voice-btn').onclick = async () => {
    const statusDiv = document.getElementById('voice-status');
    const voiceText = document.getElementById('voice-text');
    statusDiv.style.display = 'block';
    voiceText.textContent = '正在聆听...';
    const { startVoiceRecognition } = await import('./camera-voice.js');
    window._voiceRecognition = startVoiceRecognition({
      onResult: (text) => {
        voiceText.textContent = text;
        document.getElementById('item-desc').value = text;
        setTimeout(() => { statusDiv.style.display = 'none'; }, 1000);
      },
      onInterim: (text) => { voiceText.textContent = text + ' ...'; },
      onEnd: () => {
        if (voiceText.textContent === '正在聆听...') voiceText.textContent = '未识别到语音';
        setTimeout(() => { statusDiv.style.display = 'none'; }, 2000);
        window._voiceRecognition = null;
      },
      onError: (err) => {
        voiceText.textContent = err.message;
        setTimeout(() => { statusDiv.style.display = 'none'; }, 2500);
        window._voiceRecognition = null;
      },
    });
  };

  document.getElementById('optimize-btn').onclick = () => {
    const currentDesc = document.getElementById('item-desc').value.trim();
    if (!currentDesc) { showToast('请先填写问题描述'); return; }
    onOptimize(currentDesc);
  };

  document.getElementById('save-item-btn').onclick = () => {
    const savedItem = {
      description: document.getElementById('item-desc').value.trim(),
      beforePhoto: window._formBeforePhoto || '',
      afterPhoto: window._formAfterPhoto || '',
      status: window._formAfterPhoto ? '已整改' : '待整改',
    };
    delete window._formBeforePhoto;
    delete window._formAfterPhoto;
    onSave(savedItem, index);
  };
}

// ---------- AI 润色结果页 ----------

function renderOptimizePage({ text, reportType, options, onSelect, onEdit, onRetry, onBack }) {
  pageContainer.innerHTML = `
    <div class="page active" id="optimize-page">
      <div class="nav-bar">
        <button class="back-btn" id="optimize-back">←</button>
        <span class="title">AI 润色结果</span>
      </div>
      <div style="background:#fafafa;border-radius:10px;padding:12px;margin-bottom:14px;margin-top:10px;">
        <div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px;">📝 原始描述：</div>
        <div style="font-size:14px;">${escapeHtml(text)}</div>
        <div style="font-size:11px;color:var(--primary);margin-top:6px;">
          ${reportType === 'safety' ? '🛡️ 安全类 — 附加风险描述(≤15字)' : '📋 现场类 — 附加影响说明(≤15字)'}
        </div>
      </div>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:8px;">请选择一个优化结果：</p>
      <div id="options-container">
        ${options.map((opt, i) => `
          <div class="option-card" data-index="${i}" id="option-${i}">
            <div style="font-weight:500;">${String.fromCharCode(65 + i)}. ${escapeHtml(opt)}</div>
          </div>
        `).join('')}
      </div>
      <div style="display:flex;gap:10px;margin-top:14px;">
        <button class="btn btn-warning btn-block" id="edit-selected-btn" disabled>✏️ 编辑修改</button>
        <button class="btn btn-purple btn-block" id="retry-btn">🔄 换一批</button>
      </div>
    </div>
  `;

  let selectedIndex = -1;
  document.getElementById('optimize-back').onclick = onBack;
  document.getElementById('options-container').addEventListener('click', (e) => {
    const card = e.target.closest('.option-card');
    if (!card) return;
    document.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedIndex = parseInt(card.dataset.index);
    document.getElementById('edit-selected-btn').disabled = false;
  });
  document.getElementById('edit-selected-btn').onclick = () => {
    if (selectedIndex >= 0) onEdit(options[selectedIndex]);
  };
  document.getElementById('retry-btn').onclick = () => onRetry();
}

// ---------- 编辑弹窗 ----------

function showEditModal(initialText, onConfirm) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:50;display:flex;align-items:flex-end;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:#fff;width:100%;max-width:480px;border-radius:16px 16px 0 0;padding:20px;">
      <h3 style="margin-bottom:12px;">编辑描述</h3>
      <textarea class="form-input" id="edit-textarea" style="min-height:120px;">${escapeHtml(initialText)}</textarea>
      <div style="display:flex;gap:10px;margin-top:16px;">
        <button class="btn btn-outline btn-block" id="edit-cancel">取消</button>
        <button class="btn btn-primary btn-block" id="edit-confirm">确认</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#edit-cancel').onclick = () => overlay.remove();
  overlay.querySelector('#edit-confirm').onclick = () => {
    const newText = overlay.querySelector('#edit-textarea').value.trim();
    if (newText) { onConfirm(newText); overlay.remove(); }
  };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  setTimeout(() => overlay.querySelector('#edit-textarea').focus(), 300);
}

// ---------- 生成确认页 ----------

function renderGeneratePage({ reportType, headerInfo, items, onConfirm, onBack, onEditDate, onToggleHalfMonth }) {
  const labels = { safety: '安全自查报告', '5s': '现场管理自查报告', company: '公司现场检查整改报告' };
  const h = headerInfo;
  const doneCount = items.filter(i => i.afterPhoto).length;

  // 5S 类型显示半月选择器
  const halfMonthHtml = reportType === '5s' ? `
    <div style="margin-top:8px;">
      <span style="font-size:13px;color:var(--text-secondary);">检查区间：</span>
      <button class="btn btn-sm ${h.halfMonth === 'first' ? 'btn-primary' : 'btn-outline'}" id="hm-first" style="margin-right:6px;">📅 上半月 (13-16日)</button>
      <button class="btn btn-sm ${h.halfMonth === 'second' ? 'btn-primary' : 'btn-outline'}" id="hm-second">📅 下半月 (23-26日)</button>
      <div style="font-size:11px;color:#999;margin-top:4px;">自动避开周末选择工作日</div>
    </div>
  ` : '';

  pageContainer.innerHTML = `
    <div class="page active" id="generate-page">
      <div class="nav-bar">
        <button class="back-btn" id="generate-back">←</button>
        <span class="title">生成报告</span>
      </div>

      <div style="margin-top:12px;">
        <div class="card" style="cursor:default;">
          <div style="font-weight:600;margin-bottom:8px;">📄 ${labels[reportType]}</div>
          <div style="font-size:13px;line-height:2;color:var(--text-secondary);">
            公司：${escapeHtml(FIXED_COMPANY)}<br>
            部门：${escapeHtml(FIXED_DEPARTMENT)}<br>
            问题数：${items.length} · 已整改：${doneCount}
          </div>
          <div style="margin-top:8px;">
            <label style="font-size:13px;color:var(--text-secondary);">落款日期：</label>
            <input type="date" class="form-input" id="sig-date" value="${h.date || getTodayStr()}" style="width:auto;display:inline-block;">
            <button class="btn btn-sm btn-outline" id="confirm-date-btn" style="margin-left:6px;">确认日期</button>
          </div>
          ${halfMonthHtml}
        </div>
      </div>

      <div style="margin-top:16px;">
        <h3 style="font-size:14px;color:var(--text-secondary);margin-bottom:8px;">📋 报告预览（${items.length}项）</h3>
        ${items.map((item, i) => `
          <div style="display:flex;gap:8px;align-items:center;font-size:13px;padding:8px 0;border-bottom:1px solid var(--border);">
            <span style="font-weight:600;min-width:24px;">#${i + 1}</span>
            <span style="flex:1;">${escapeHtml(item.description || '(无描述)')}</span>
            <span style="font-size:11px;${item.afterPhoto ? 'color:var(--success);' : 'color:var(--warning);'}">${item.afterPhoto ? '✓已整改' : '待整改'}</span>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="bottom-bar">
      <button class="btn btn-success btn-block" id="download-btn">📥 下载 Word</button>
      <button class="btn btn-wechat btn-block" id="share-btn">💬 分享</button>
    </div>
  `;

  document.getElementById('generate-back').onclick = onBack;
  document.getElementById('download-btn').onclick = () => onConfirm('download');
  document.getElementById('share-btn').onclick = () => onConfirm('share');

  document.getElementById('confirm-date-btn').onclick = () => {
    const newDate = document.getElementById('sig-date').value;
    if (newDate) onEditDate(newDate);
  };

  if (reportType === '5s') {
    document.getElementById('hm-first').onclick = () => onToggleHalfMonth('first');
    document.getElementById('hm-second').onclick = () => onToggleHalfMonth('second');
  }
}

export {
  showToast, FIXED_COMPANY, FIXED_DEPARTMENT,
  renderHomePage,
  renderItemList,
  renderItemForm,
  renderOptimizePage,
  showEditModal,
  renderGeneratePage,
};

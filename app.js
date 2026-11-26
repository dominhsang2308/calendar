const STORAGE_KEY = 'lich_chung_pwa_v2';
const SYNC_POLL_MS = 12000;

// Icon SVG nội tuyến để chạy 100% offline, không phụ thuộc CDN
const ICONS = {
  'calendar-heart': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="M21.29 14.7a2.43 2.43 0 0 0-2.65-.52c-.3.12-.57.3-.8.53l-.34.34-.35-.34a2.43 2.43 0 0 0-2.65-.53c-.3.12-.56.3-.79.53-.95.94-1 2.53.2 3.74L17.5 22l3.6-3.55c1.2-1.21 1.14-2.8.19-3.74Z"/></svg>',
  'trash': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>',
  'image-plus': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 5h6"/><path d="M19 2v6"/><path d="M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/><circle cx="9" cy="9" r="2"/></svg>',
  'chevron-left': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  'chevron-right': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  'check-circle': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
  'x': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  'sun': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
  'refresh': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>',
  'users': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  'download': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>'
};

function renderIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    const name = el.getAttribute('data-icon');
    if (ICONS[name]) el.innerHTML = ICONS[name];
  });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getTodayParts() {
  const d = new Date();
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate()
  };
}

const initialToday = getTodayParts();
let deferredInstallPrompt = null;
let syncTimer = null;
let toastTimer = null;
let isSyncing = false;

let state = {
  year: initialToday.year,
  month: initialToday.month,
  filterMode: 'all',
  schedules: {},
  notes: {},
  roomCode: '',
  memberName: '',
  pendingQueue: [],
  lastSyncedAt: 0,
  lastUpdatedBy: '',
  editingDay: null,
  selectedShiftDraft: '',
  aiPreview: null
};

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      state.schedules = parsed.schedules || {};
      state.notes = parsed.notes || {};
      state.year = parsed.year || initialToday.year;
      state.month = parsed.month || initialToday.month;
      state.roomCode = parsed.roomCode || '';
      state.memberName = parsed.memberName || '';
      state.pendingQueue = Array.isArray(parsed.pendingQueue) ? parsed.pendingQueue : [];
      state.lastSyncedAt = Number(parsed.lastSyncedAt) || 0;
      state.lastUpdatedBy = parsed.lastUpdatedBy || '';
    }
  } catch (e) {
    console.warn('Không thể đọc dữ liệu cục bộ:', e);
  }

  // Hỗ trợ vào thẳng phòng qua link mời ?room=xxx
  const params = new URLSearchParams(window.location.search);
  const roomParam = (params.get('room') || '').trim().toLowerCase();
  if (/^[a-z0-9_-]{4,40}$/.test(roomParam)) {
    if (state.roomCode !== roomParam) {
      state.roomCode = roomParam;
      state.pendingQueue = [];
      saveState();
    }
    // Xóa query param cho URL sạch sẽ sau khi nhận
    window.history.replaceState({}, '', window.location.pathname);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      schedules: state.schedules,
      notes: state.notes,
      year: state.year,
      month: state.month,
      roomCode: state.roomCode,
      memberName: state.memberName,
      pendingQueue: state.pendingQueue,
      lastSyncedAt: state.lastSyncedAt,
      lastUpdatedBy: state.lastUpdatedBy
    }));
  } catch (e) {
    console.warn('Không thể lưu localStorage:', e);
  }
}

function getMonthKey(year = state.year, month = state.month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function updateSyncStatusUI(customError = '') {
  const pillText = document.getElementById('room-pill-text');
  const dot = document.getElementById('sync-dot');
  const text = document.getElementById('sync-text');
  const banner = document.getElementById('setup-room-banner');
  const refreshBtn = document.getElementById('refresh-btn');

  pillText.textContent = state.roomCode ? `Phòng: ${state.roomCode}` : 'Chưa ghép đôi';
  banner.classList.toggle('hidden', Boolean(state.roomCode));

  if (isSyncing) {
    refreshBtn.classList.add('spin');
  } else {
    refreshBtn.classList.remove('spin');
  }

  if (!state.roomCode) {
    dot.className = 'status-dot dot-slate';
    text.textContent = navigator.onLine ? 'Lưu trên máy (chưa bật phòng chung)' : 'Đang ngoại tuyến';
    return;
  }

  if (!navigator.onLine) {
    dot.className = 'status-dot dot-amber';
    text.textContent = state.pendingQueue.length > 0
      ? `Ngoại tuyến · ${state.pendingQueue.length} thay đổi chờ đồng bộ`
      : 'Đang ngoại tuyến · Xem bản đã lưu';
    return;
  }

  if (customError) {
    dot.className = 'status-dot dot-rose';
    text.textContent = customError;
    return;
  }

  if (isSyncing) {
    dot.className = 'status-dot dot-amber';
    text.textContent = 'Đang đồng bộ hai máy...';
    return;
  }

  if (state.pendingQueue.length > 0) {
    dot.className = 'status-dot dot-amber';
    text.textContent = `Còn ${state.pendingQueue.length} thay đổi đang chờ đẩy lên`;
    return;
  }

  dot.className = 'status-dot dot-emerald';
  if (state.lastSyncedAt) {
    const by = state.lastUpdatedBy ? ` · ${state.lastUpdatedBy}` : '';
    text.textContent = `Đã đồng bộ ${formatTime(state.lastSyncedAt)}${by}`;
  } else {
    text.textContent = 'Đã kết nối phòng chung';
  }
}

// Đẩy các thay đổi đang chờ (khi offline) lên Cloudflare KV rồi kéo bản mới nhất về
async function syncWithServer({ silent = true } = {}) {
  if (!state.roomCode) {
    updateSyncStatusUI();
    return;
  }
  if (!navigator.onLine) {
    updateSyncStatusUI();
    return;
  }
  if (isSyncing) return;

  isSyncing = true;
  updateSyncStatusUI();

  try {
    // 1. Đẩy hàng đợi pendingQueue nếu có
    while (state.pendingQueue.length > 0) {
      const job = state.pendingQueue[0];
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...job,
          room: state.roomCode,
          updatedBy: state.memberName || 'Thành viên'
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const doc = await res.json();
      state.pendingQueue.shift();
      applyServerDoc(doc);
    }

    // 2. Kéo dữ liệu mới nhất từ server
    const getRes = await fetch(`/api/sync?room=${encodeURIComponent(state.roomCode)}`, {
      cache: 'no-store'
    });
    if (!getRes.ok) {
      const errData = await getRes.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${getRes.status}`);
    }
    const serverDoc = await getRes.json();
    applyServerDoc(serverDoc);

    saveState();
    renderAll();
    updateSyncStatusUI();
    if (!silent) showToast('Đã đồng bộ lịch mới nhất!');
  } catch (err) {
    console.warn('Sync error:', err);
    updateSyncStatusUI('Lỗi đồng bộ server');
    if (!silent) showToast(err.message || 'Không kết nối được server đồng bộ.');
  } finally {
    isSyncing = false;
    updateSyncStatusUI();
  }
}

function applyServerDoc(doc) {
  if (!doc || typeof doc !== 'object') return;
  // Nếu server đã có dữ liệu (updatedAt > 0), cập nhật local theo server
  if (doc.updatedAt > 0 || state.lastSyncedAt > 0) {
    state.schedules = doc.schedules || {};
    state.notes = doc.notes || {};
    state.lastSyncedAt = doc.updatedAt || Date.now();
    state.lastUpdatedBy = doc.lastUpdatedBy || '';
  }
}

function enqueueAndSync(job) {
  if (!state.roomCode) {
    saveState();
    updateSyncStatusUI();
    return;
  }
  state.pendingQueue.push(job);
  saveState();
  syncWithServer({ silent: true });
}

function manualSync() {
  if (!state.roomCode) {
    openRoomModal();
    return;
  }
  syncWithServer({ silent: false });
}

function changeMonth(delta) {
  let m = state.month + delta;
  let y = state.year;
  if (m > 12) { m = 1; y++; }
  if (m < 1) { m = 12; y--; }
  state.month = m;
  state.year = y;
  saveState();
  renderAll();
}

function jumpToToday() {
  const today = getTodayParts();
  state.year = today.year;
  state.month = today.month;
  saveState();
  renderAll();
}

function toggleOffFilter() {
  state.filterMode = state.filterMode === 'off' ? 'all' : 'off';
  updateFilterButtonsUI();
  renderCalendar();
}

function toggleNoteFilter() {
  state.filterMode = state.filterMode === 'note' ? 'all' : 'note';
  updateFilterButtonsUI();
  renderCalendar();
}

function updateFilterButtonsUI() {
  const offBtn = document.getElementById('filter-off-btn');
  const noteBtn = document.getElementById('filter-note-btn');
  offBtn.className = state.filterMode === 'off' ? 'filter-pill active-off' : 'filter-pill';
  noteBtn.className = state.filterMode === 'note' ? 'filter-pill active-note' : 'filter-pill';
}

function getShiftStyle(code) {
  if (!code) return null;
  const c = code.toUpperCase().trim();
  if (c === 'OFF' || c === 'AL') {
    return { badge: 'shift-off', isOff: true };
  }
  if (c === 'B') {
    return { badge: 'shift-b', isOff: false };
  }
  if (c === 'C' || c === 'C2') {
    return { badge: 'shift-c', isOff: false };
  }
  return { badge: 'shift-other', isOff: false };
}

function renderSummary() {
  const today = getTodayParts();
  const container = document.getElementById('summary-card');
  const todayKey = getMonthKey(today.year, today.month);
  const todayMonthData = state.schedules[todayKey] || {};
  const todayShift = todayMonthData[today.day] || '';
  const hasTodayShift = todayShift.trim() !== '';
  const isTodayOff = hasTodayShift && ['OFF', 'AL'].includes(todayShift.toUpperCase());

  const currentMonthData = state.schedules[getMonthKey()] || {};
  const offDays = Object.entries(currentMonthData)
    .filter(([_, val]) => ['OFF', 'AL'].includes((val || '').toUpperCase()))
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([d, val]) => `${d}/${state.month} (${escapeHtml(val.toUpperCase())})`);

  let todayBadgeHtml = '<span class="badge-pill badge-none">Chưa có lịch</span>';
  if (hasTodayShift) {
    todayBadgeHtml = `<span class="badge-pill ${isTodayOff ? 'badge-off' : 'badge-work'}">${
      isTodayOff ? `Nghỉ (${escapeHtml(todayShift)})` : `Ca ${escapeHtml(todayShift)}`
    }</span>`;
  }

  container.innerHTML = `
    <div class="summary-top">
      <div>
        <p class="summary-kicker">Lịch làm việc &amp; hẹn hò chung của tụi mình ✨</p>
        <div class="summary-today-row">
          <span class="summary-today-label">Hôm nay (${today.day}/${today.month}):</span>
          ${todayBadgeHtml}
        </div>
      </div>
      <div class="summary-emoji-box">${!hasTodayShift ? '📅' : (isTodayOff ? '🥳' : '💼')}</div>
    </div>
    <div class="summary-off-bar">
      <span class="summary-off-label">
        <span data-icon="sun" class="icon-xs"></span> Ngày nghỉ T${state.month}:
      </span>
      <div class="summary-off-chips">
        ${offDays.length > 0
          ? offDays.map((d) => `<span class="off-chip">${d}</span>`).join('')
          : '<span class="helper-text">Chưa có dữ liệu</span>'
        }
      </div>
    </div>
  `;
  renderIcons(container);
}

function renderCalendar() {
  const today = getTodayParts();
  const monthNames = ['', 'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
  document.getElementById('calendar-month-title').textContent = `${monthNames[state.month]}, ${state.year}`;

  const jumpBtn = document.getElementById('today-jump-btn');
  jumpBtn.classList.toggle('hidden', state.year === today.year && state.month === today.month);

  const key = getMonthKey();
  const monthData = state.schedules[key] || {};
  const monthNotes = state.notes[key] || {};

  let workCount = 0;
  let offCount = 0;
  let alCount = 0;
  Object.values(monthData).forEach((val) => {
    if (!val) return;
    const up = val.toUpperCase();
    if (up === 'OFF') offCount++;
    else if (up === 'AL') alCount++;
    else workCount++;
  });
  const noteCount = Object.values(monthNotes).filter((v) => v && v.trim() !== '').length;

  document.getElementById('stats-bar').innerHTML = `
    <strong style="color:#334155">${workCount} ca làm</strong>
    <span>·</span>
    <strong style="color:#059669">${offCount} ngày OFF</strong>
    ${alCount > 0 ? `<span>·</span><strong style="color:#0d9488">${alCount} ngày AL</strong>` : ''}
    ${noteCount > 0 ? `<span>·</span><strong style="color:#f43f5e">❤️ ${noteCount} lịch hẹn</strong>` : ''}
  `;

  const firstDayJs = new Date(state.year, state.month - 1, 1).getDay();
  const startOffset = firstDayJs === 0 ? 6 : firstDayJs - 1;
  const daysInMonth = new Date(state.year, state.month, 0).getDate();

  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  for (let i = 0; i < startOffset; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-empty';
    grid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const shift = monthData[day] || '';
    const note = (monthNotes[day] || '').trim();
    const hasNote = note.length > 0;
    const style = getShiftStyle(shift);
    const isWeekend = ((startOffset + day - 1) % 7) >= 5;
    const isToday = state.year === today.year && state.month === today.month && day === today.day;

    let dimmed = false;
    if (state.filterMode === 'off' && (!style || !style.isOff)) dimmed = true;
    if (state.filterMode === 'note' && !hasNote) dimmed = true;

    const classes = ['cal-cell'];
    if (style && style.isOff) classes.push('is-off-bg');
    if (hasNote) classes.push('has-note');
    if (isToday) classes.push('is-today');
    if (dimmed) classes.push('dimmed');

    const numClasses = ['cal-day-num'];
    if (isToday) numClasses.push('today-num');
    else if (hasNote) numClasses.push('note-day');
    else if (isWeekend) numClasses.push('weekend');

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.id = `cal-day-${day}`;
    cell.className = classes.join(' ');
    cell.onclick = () => openEditModal(day);

    cell.innerHTML = `
      <div class="cal-day-head">
        <span class="${numClasses.join(' ')}">${day}</span>
        ${hasNote ? '<span class="cal-heart" title="Có ghi chú / lịch hẹn">❤️</span>' : ''}
      </div>
      ${shift
        ? `<span class="shift-badge ${style.badge}">${escapeHtml(shift)}</span>`
        : '<span class="shift-spacer"></span>'
      }
      ${hasNote
        ? `<span class="note-pill-mini">${escapeHtml(note)}</span>`
        : '<span class="note-spacer"></span>'
      }
    `;
    grid.appendChild(cell);
  }
}

function focusCalendarDay(day) {
  if (state.filterMode !== 'all') {
    state.filterMode = 'all';
    updateFilterButtonsUI();
    renderCalendar();
  }
  const el = document.getElementById(`cal-day-${day}`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('focused');
    setTimeout(() => el.classList.remove('focused'), 700);
  }
}

function renderNotesList() {
  const key = getMonthKey();
  const monthNotes = state.notes[key] || {};
  const monthData = state.schedules[key] || {};
  const container = document.getElementById('notes-list');

  const entries = Object.entries(monthNotes)
    .filter(([_, text]) => text && text.trim() !== '')
    .sort((a, b) => Number(a[0]) - Number(b[0]));

  if (entries.length === 0) {
    container.innerHTML = `
      <div class="notes-empty">
        Chưa có ghi chú nào trong tháng này. Chạm vào một ngày trên lịch để thêm lời nhắn nhé!
      </div>
    `;
    return;
  }

  container.innerHTML = entries.map(([day, text]) => {
    const shift = monthData[day] || '';
    const dayNum = Number(day);
    return `
      <div onclick="focusCalendarDay(${dayNum})" class="note-card">
        <div class="note-card-left">
          <div class="note-date-badge">
            <span class="note-date-month">T${state.month}</span>
            <span class="note-date-day">${dayNum}</span>
          </div>
          <div class="note-text-wrap">
            <p class="note-title">${escapeHtml(text)}</p>
            <p class="note-sub">${shift ? `Lịch làm: <strong>${escapeHtml(shift)}</strong>` : 'Chưa gắn ca'}</p>
          </div>
        </div>
        <button type="button" onclick="event.stopPropagation(); openEditModal(${dayNum})" class="note-edit-btn">Sửa</button>
      </div>
    `;
  }).join('');
}

function renderAll() {
  renderSummary();
  renderCalendar();
  renderNotesList();
}

// Modal sửa ngày
function openEditModal(day) {
  state.editingDay = day;
  const key = getMonthKey();
  const currentShift = (state.schedules[key] && state.schedules[key][day]) || '';
  const currentNote = (state.notes[key] && state.notes[key][day]) || '';

  const dateObj = new Date(state.year, state.month - 1, day);
  const weekdays = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  document.getElementById('modal-weekday').textContent = weekdays[dateObj.getDay()];
  document.getElementById('modal-date-title').textContent = `Ngày ${day} Tháng ${state.month}, ${state.year}`;
  document.getElementById('day-note-input').value = currentNote;
  document.getElementById('custom-shift-input').value = ['OFF', 'AL', 'C', 'C2', 'B'].includes(currentShift.toUpperCase()) ? '' : currentShift;

  selectQuickShift(currentShift);
  document.getElementById('edit-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('edit-modal').classList.add('hidden');
  state.editingDay = null;
}

function selectQuickShift(shift) {
  state.selectedShiftDraft = shift.toUpperCase();
  if (!['OFF', 'AL', 'C', 'C2', 'B', ''].includes(state.selectedShiftDraft)) {
    document.getElementById('custom-shift-input').value = state.selectedShiftDraft;
  } else if (shift !== '') {
    document.getElementById('custom-shift-input').value = '';
  }

  document.querySelectorAll('.shift-chip').forEach((btn) => {
    const val = btn.getAttribute('data-shift');
    btn.classList.toggle('active', val === state.selectedShiftDraft);
  });
}

function handleCustomShiftInput(val) {
  state.selectedShiftDraft = val.toUpperCase().trim();
  document.querySelectorAll('.shift-chip').forEach((btn) => btn.classList.remove('active'));
}

function appendQuickNote(tagText) {
  const input = document.getElementById('day-note-input');
  const current = input.value.trim();
  if (!current) {
    input.value = tagText;
  } else if (!current.includes(tagText)) {
    input.value = `${current} · ${tagText}`;
  }
  input.focus();
}

function saveDayEdit() {
  if (!state.editingDay) return;
  const day = state.editingDay;
  const key = getMonthKey();
  if (!state.schedules[key]) state.schedules[key] = {};
  if (!state.notes[key]) state.notes[key] = {};

  if (state.selectedShiftDraft) {
    state.schedules[key][day] = state.selectedShiftDraft;
  } else {
    delete state.schedules[key][day];
  }

  const noteVal = document.getElementById('day-note-input').value.trim();
  if (noteVal) {
    state.notes[key][day] = noteVal;
  } else {
    delete state.notes[key][day];
  }

  renderAll();
  closeModal();
  showToast(`Đã lưu ngày ${day}/${state.month}`);

  enqueueAndSync({
    action: 'update_day',
    monthKey: key,
    day,
    shift: state.selectedShiftDraft,
    note: noteVal
  });
}

// Modal Phòng chung & Sao lưu
function openRoomModal() {
  document.getElementById('member-name-input').value = state.memberName || '';
  document.getElementById('room-code-input').value = state.roomCode || '';
  updateInviteBoxUI(state.roomCode);
  document.getElementById('room-modal').classList.remove('hidden');
}

function closeRoomModal() {
  document.getElementById('room-modal').classList.add('hidden');
}

function updateInviteBoxUI(code) {
  const box = document.getElementById('invite-link-box');
  const input = document.getElementById('invite-link-input');
  const clean = (code || '').trim().toLowerCase();
  if (/^[a-z0-9_-]{4,40}$/.test(clean)) {
    box.classList.remove('hidden');
    input.value = `${window.location.origin}/?room=${encodeURIComponent(clean)}`;
  } else {
    box.classList.add('hidden');
    input.value = '';
  }
}

function generateRandomRoomCode() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let rand = '';
  for (let i = 0; i < 6; i++) {
    rand += chars[Math.floor(Math.random() * chars.length)];
  }
  const code = `lich-${rand}`;
  document.getElementById('room-code-input').value = code;
  updateInviteBoxUI(code);
}

async function copyInviteLink() {
  const url = document.getElementById('invite-link-input').value;
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    showToast('Đã sao chép link mời gửi cho người kia!');
  } catch {
    document.getElementById('invite-link-input').select();
    showToast('Hãy sao chép link trong ô nhé!');
  }
}

function saveRoomSettings() {
  const memberName = document.getElementById('member-name-input').value.trim();
  const roomRaw = document.getElementById('room-code-input').value.trim().toLowerCase();

  if (roomRaw && !/^[a-z0-9_-]{4,40}$/.test(roomRaw)) {
    showToast('Mã phòng cần 4-40 ký tự (chữ không dấu, số, - hoặc _).');
    return;
  }

  const roomChanged = roomRaw !== state.roomCode;
  state.memberName = memberName;
  state.roomCode = roomRaw;
  if (roomChanged) {
    state.pendingQueue = [];
    state.lastSyncedAt = 0;
  }

  saveState();
  closeRoomModal();
  updateSyncStatusUI();

  if (state.roomCode) {
    syncWithServer({ silent: false });
  } else {
    showToast('Đã lưu cài đặt trên máy!');
  }
}

function exportBackupJson() {
  const payload = {
    app: 'LichChungPWA',
    exportedAt: new Date().toISOString(),
    schedules: state.schedules,
    notes: state.notes
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lich-chung-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Đã xuất file sao lưu!');
}

function importBackupJson(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed || typeof parsed.schedules !== 'object') {
        throw new Error('File không đúng định dạng.');
      }
      state.schedules = parsed.schedules || {};
      state.notes = parsed.notes || {};
      saveState();
      renderAll();
      closeRoomModal();
      showToast('Đã khôi phục dữ liệu từ file!');
      enqueueAndSync({
        action: 'restore_backup',
        schedules: state.schedules,
        notes: state.notes
      });
    } catch {
      showToast('File sao lưu không hợp lệ.');
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsText(file);
}

// Modal xác nhận xóa dữ liệu
function openClearConfirmModal() {
  document.getElementById('confirm-clear-modal').classList.remove('hidden');
}

function closeClearConfirmModal() {
  document.getElementById('confirm-clear-modal').classList.add('hidden');
}

function confirmClearAllData() {
  const today = getTodayParts();
  state.year = today.year;
  state.month = today.month;
  state.schedules = {};
  state.notes = {};
  state.filterMode = 'all';
  state.pendingQueue = [];
  updateFilterButtonsUI();
  saveState();
  renderAll();
  closeClearConfirmModal();
  showToast('Đã xóa toàn bộ dữ liệu lịch!');

  enqueueAndSync({ action: 'clear_all' });
}

// Toast
function showToast(msg) {
  const toast = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('visible');
  }, 2800);
}

// Nén ảnh trước khi gửi lên /api/scan để nhẹ mạng 4G và tránh quá dung lượng
function compressImageFile(file, maxDim = 1024, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không thể đọc file ảnh.'));
    reader.onload = () => {
      const dataUrl = reader.result;
      const img = new Image();
      img.onerror = () => reject(new Error('File ảnh bị lỗi hoặc không hỗ trợ.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const compressedUrl = canvas.toDataURL('image/jpeg', quality);
        resolve({
          previewUrl: dataUrl,
          base64Data: compressedUrl.split(',')[1],
          mimeType: 'image/jpeg'
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

async function handleImageUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!navigator.onLine) {
    showToast('Tính năng AI đọc ảnh cần kết nối mạng.');
    event.target.value = '';
    return;
  }

  const dropzone = document.getElementById('dropzone');
  const scanningBox = document.getElementById('scanning-box');
  const previewThumb = document.getElementById('preview-thumb');
  const aiPreviewBox = document.getElementById('ai-preview-box');

  aiPreviewBox.classList.add('hidden');
  dropzone.classList.add('hidden');
  scanningBox.classList.remove('hidden');

  try {
    const { previewUrl, base64Data, mimeType } = await compressImageFile(file);
    previewThumb.src = previewUrl;
    previewThumb.classList.remove('hidden');

    document.getElementById('scan-title').textContent = 'Gemini AI đang đọc ảnh...';
    document.getElementById('scan-subtitle').textContent = 'Đang nhận diện tháng, ngày và mã ca làm...';

    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(state.roomCode ? { 'X-Room-Code': state.roomCode } : {})
      },
      body: JSON.stringify({
        base64Data,
        mimeType,
        room: state.roomCode
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    if (data && data.shifts && Object.keys(data.shifts).length > 0) {
      const targetYear = data.year || state.year;
      const targetMonth = data.month || state.month;
      state.aiPreview = {
        year: targetYear,
        month: targetMonth,
        shifts: data.shifts
      };
      renderAiPreview();
    } else {
      showToast('Không nhận diện được lịch trong ảnh, thử ảnh rõ nét hơn nhé.');
    }
  } catch (err) {
    console.error('Lỗi quét ảnh:', err);
    showToast(err.message || 'Không thể kết nối AI quét ảnh lúc này.');
  } finally {
    scanningBox.classList.add('hidden');
    dropzone.classList.remove('hidden');
    event.target.value = '';
  }
}

function renderAiPreview() {
  if (!state.aiPreview) return;
  const { year, month, shifts } = state.aiPreview;
  const entries = Object.entries(shifts).sort((a, b) => Number(a[0]) - Number(b[0]));

  document.getElementById('ai-preview-title').textContent = `Tháng ${month}/${year} (${entries.length} ngày)`;
  document.getElementById('ai-preview-chips').innerHTML = entries
    .map(([d, code]) => `<span class="ai-chip">${d}/${month}: ${escapeHtml(code)}</span>`)
    .join('');

  document.getElementById('ai-preview-box').classList.remove('hidden');
}

function cancelAiPreview() {
  state.aiPreview = null;
  document.getElementById('ai-preview-box').classList.add('hidden');
}

function applyAiPreview(mergeMode) {
  if (!state.aiPreview) return;
  const { year, month, shifts } = state.aiPreview;
  state.year = year;
  state.month = month;
  const key = getMonthKey(year, month);

  if (mergeMode === 'merge' && state.schedules[key]) {
    state.schedules[key] = { ...state.schedules[key], ...shifts };
  } else {
    state.schedules[key] = { ...shifts };
  }

  cancelAiPreview();
  renderAll();
  showToast(`Đã cập nhật lịch Tháng ${month}/${year}!`);

  enqueueAndSync({
    action: 'import_month',
    monthKey: key,
    shifts,
    mergeMode
  });
}

// PWA Install handling
function setupPwaInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    document.getElementById('install-btn').classList.remove('hidden');
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    document.getElementById('install-btn').classList.add('hidden');
    showToast('Đã cài đặt Lịch Chung lên máy!');
  });

  // Hiện gợi ý cài đặt cho iOS Safari nếu chưa chạy ở chế độ standalone
  const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const dismissed = localStorage.getItem('lich_chung_ios_dismissed') === '1';
  if (isIos && !isStandalone && !dismissed) {
    document.getElementById('ios-install-banner').classList.remove('hidden');
  }
}

async function triggerInstall() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.getElementById('install-btn').classList.add('hidden');
}

function dismissIosBanner() {
  localStorage.setItem('lich_chung_ios_dismissed', '1');
  document.getElementById('ios-install-banner').classList.add('hidden');
}

// Đóng modal khi bấm backdrop
document.getElementById('edit-modal').addEventListener('click', closeModal);
document.getElementById('room-modal').addEventListener('click', closeRoomModal);
document.getElementById('confirm-clear-modal').addEventListener('click', closeClearConfirmModal);
document.getElementById('room-code-input').addEventListener('input', (e) => updateInviteBoxUI(e.target.value));

// Đăng ký Service Worker & vòng lặp đồng bộ
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('Đăng ký Service Worker thất bại:', err);
      });
    });
  }
}

function startSyncLifecycle() {
  window.addEventListener('online', () => {
    updateSyncStatusUI();
    syncWithServer({ silent: true });
  });
  window.addEventListener('offline', () => {
    updateSyncStatusUI();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      renderAll();
      syncWithServer({ silent: true });
    }
  });

  clearInterval(syncTimer);
  syncTimer = setInterval(() => {
    if (!document.hidden) {
      syncWithServer({ silent: true });
    }
  }, SYNC_POLL_MS);
}

// Khởi chạy
loadState();
renderIcons();
renderAll();
updateSyncStatusUI();
setupPwaInstall();
registerServiceWorker();
startSyncLifecycle();
if (state.roomCode) {
  syncWithServer({ silent: true });
}

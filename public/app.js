'use strict';

const $ = s => document.querySelector(s),
  esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
const fmt = t => t ? new Date(t).toLocaleString('en-PH', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Manila'
}) : '—';
const initials = name => String(name).split(' ').slice(0, 2).map(w => w[0]).join('');
const state = {
  user: null,
  csrf: null,
  data: null,
  config: {},
  page: 'dashboard',
  floor: 3,
  room: null,
  online: false,
  method: 'nfc',
  nfcController: null,
  nfcState: 'idle',
  queue: [],
  pack: null,
  offlineError: '',
  offlineAssets: false,
  report: null,
  socket: null,
  scanner: null,
  worker: null,
  search: '',
  filterBlock: '',
  filterStatus: '',
  filterProgram: '',
  busy: false,
  panels: {building: false, records: false, readiness: false}
};

const ICONS = {
  overview: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  attendance: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 2v4m6-4v4M9 12l2 2 4-4m-6 8h6"/>',
  scan: '<path d="M8 3H4a1 1 0 0 0-1 1v4m13-5h4a1 1 0 0 1 1 1v4M3 16v4a1 1 0 0 0 1 1h4m8 0h4a1 1 0 0 0 1-1v-4M3 12h18"/>',
  offline: '<path d="m8 7 4-4 4 4m-4-4v12M5 14v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6"/>',
  students: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-17a3 3 0 0 1 0 6m2 11v-3a6 6 0 0 0-3-5"/>',
  team: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  history: '<path d="M5 3h14v18H5zM8 7h8m-8 5h8m-8 5h5"/>',
  nfc: '<path d="M9 7a7 7 0 0 1 0 10m4-14a12 12 0 0 1 0 18m-8-11a3 3 0 0 1 0 4"/>',
  qr: '<path d="M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h3v3h-3zm6 0h1v7h-7v-1m3-3v4"/>',
  photo: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="10" r="2"/><path d="m3 17 6-4 4 3 4-4 4 4"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  logout: '<path d="M9 4H4v16h5m5-13 5 5-5 5m-6-5h11"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon: '<path d="M20.5 14A9 9 0 0 1 10 3.5a9 9 0 1 0 10.5 10.5Z"/>',
  camera: '<path d="M3 7h4l2-3h6l2 3h4v14H3z"/><circle cx="12" cy="13" r="4"/>',
  folder: '<path d="M3 7V4h6l2 3h10v13H3z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14z"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5M5 7a8 8 0 0 1 13-2l2 3M4 16l2 3a8 8 0 0 0 13-2"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  print: '<path d="M6 8V3h12v5M6 17H3V8h18v9h-3M6 14h12v7H6zM17 11h1"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  building: '<path d="M5 21V3h14v18M2 21h20M9 7h1m4 0h1m-6 4h1m4 0h1m-5 10v-6h4v6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.scan}</svg>`;
const APP_NAV = [
  ['dashboard', 'overview', 'Overview'],
  ['attendance', 'attendance', 'Attendance'],
  ['scanner', 'scan', 'Scan IDs'],
  ['offline', 'offline', 'Offline records'],
  ['students', 'students', 'Students & blocks'],
  ['team', 'team', 'Representatives'],
  ['history', 'history', 'Reports']
];
const visibleNav = () => APP_NAV.filter(([page]) => state.user?.role === 'admin' || !['students', 'team'].includes(page));
function friendlyError(message) {
  const known = {
    'Student/credential is not registered or is inactive.': 'This ID is not linked to an active student. Ask an administrator to check the student record.',
    'Session verification failed. Refresh and sign in again.': 'Please refresh and sign in again. Your saved scans will stay on this phone.',
    'Invalid request origin.': 'This website address is not accepted by the server. Ask the administrator to check the HTTPS settings.',
    'NFC UID must contain hexadecimal bytes.': 'Enter the NFC ID using pairs of letters A–F and numbers 0–9.',
    'NFC UID already registered.': 'This NFC ID is already linked to another student.'
  };
  return known[message] || String(message || 'Something went wrong. Please try again.')
    .replace(/event baseline/gi, 'list of expected students')
    .replace(/baseline/gi, 'expected student list')
    .replace(/roster/gi, 'student list')
    .replace(/credential/gi, 'ID')
    .replace(/outside scope/gi, 'not included in SafeTap');
}
function updateConnectionUI() {
  const connection = $('.connection');
  if (connection) {
    connection.textContent = state.online ? 'Connected' : 'Offline';
    connection.classList.toggle('offline', !state.online);
  }
  for (const button of document.querySelectorAll?.('[data-action="sync"]') || []) {
    button.disabled = !navigator.onLine || !state.queue.length || Boolean(syncQueue.running);
  }
  const count = $('#queue-count');
  if (count) count.innerHTML = badge(state.queue.length + ' pending', state.queue.length ? 'amber' : '');
  const readiness = $('#offline-readiness');
  if (readiness) readiness.innerHTML = offlineReadiness();
  const summary = $('#offline-status');
  if (summary) summary.innerHTML = offlineSummary();
  const updated = $('#directory-updated');
  if (updated) updated.textContent = state.pack?.userId === state.user?.id ? `Downloaded ${fmt(state.pack.preparedAt)}` : 'Student list not downloaded';
  const note = $('#connection-note');
  if (note) note.innerHTML = connectionNotice();
  if (state.queue.some(record => record.error)) {
    const records = document.querySelector('details[data-disclosure="records"]');
    if (records) records.open = true;
  }
}

const localGet = SafeTapDevice.get;
const localSet = SafeTapDevice.set;
const scannerController = SafeTapScanners.create({
  state: state,
  currentEvent: () => offlineController.event(),
  students: () => offlineController.students(),
  record: input => record(input),
  ui: {$, icon, showResult, candidates: (...args) => candidates(...args)}
});
const {stopReaders, startQr, startNfc, updateNfcUI, ocr} = scannerController;
const offlineController = SafeTapOffline.create({
  state: state, device: SafeTapDevice, directory: SafeTapDirectory, api,
  ui: {toast, showResult, updateConnectionUI, refresh, render: () => render(), stopReaders, login: () => login(),
    updateQueueUI() {
      const target = $('#device-queue');
      if (target) target.innerHTML = queueList();
    }
  }
});
const {record, syncQueue, updateQueue, saveOfflinePack, cacheOfflineAssets, prepare} = offlineController;
async function api(url, body) {
  let res;
  try {
    res = await fetch('/api' + url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(state.csrf ? {
          'X-CSRF-Token': state.csrf
        } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });
  } catch (e) {
    state.online = false;
    updateConnectionUI();
    throw Object.assign(new Error('Cannot reach SafeTap. Check your connection and try again.'), {
      network: true
    });
  }
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(friendlyError(data.error || 'Request failed.')), {
    status: res.status
  });
  state.online = true;
  updateConnectionUI();
  return data;
}
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('visible'), 5000);
}
const badge = (label, color = '') => `<span class="badge ${color}">${esc(label)}</span>`;
const ACTION_ICONS = {
  refresh: 'refresh', 'start-event': 'plus', 'close-event': 'stop', 'open-class': 'plus', 'end-class': 'stop',
  'add-block': 'plus', 'add-student': 'plus', 'add-rep': 'plus', 'edit-student': 'edit', 'edit-rep': 'edit',
  'move-class': 'building', import: 'download', report: 'history', print: 'print', baseline: 'edit',
  prepare: 'download', sync: 'offline', reference: 'eye', 'rotate-qr': 'refresh', 'show-qr': 'qr',
  'discard-item': 'trash', 'retry-item': 'refresh', 'stop-reader': 'stop', nfc: 'nfc', qr: 'camera',
  'choose-photo': 'folder', 'take-photo': 'camera'
};
const btn = (label, action, cls = '', attrs = '') => {
  const symbol = ACTION_ICONS[action];
  const content = symbol && !label.includes('<svg') ? icon(symbol) + label.replace(/^\+\s*/, '') : label;
  return `<button type="button" class="btn ${cls}" data-action="${action}" ${attrs}>${content}</button>`;
};
function themeButton() {
  const dark = window.SafeTapTheme?.current === 'dark';
  return btn(icon(dark ? 'sun' : 'moon') + `<span class="theme-label">${dark ? 'Light mode' : 'Dark mode'}</span>`, 'theme', 'theme-toggle', `aria-label="Switch to ${dark ? 'light' : 'dark'} mode" title="Switch to ${dark ? 'light' : 'dark'} mode"`);
}
function updateThemeButtons() {
  for (const button of document.querySelectorAll?.('[data-action="theme"]') || []) {
    const dark = window.SafeTapTheme?.current === 'dark';
    button.innerHTML = icon(dark ? 'sun' : 'moon') + `<span class="theme-label">${dark ? 'Light mode' : 'Dark mode'}</span>`;
    button.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`);
    button.title = `Switch to ${dark ? 'light' : 'dark'} mode`;
  }
}
document.addEventListener('safetap:theme', updateThemeButtons);
const blockName = id => {
  const b = state.data?.blocks.find(b => b.id === id);
  return b ? `${b.program} ${b.code}` : 'Unknown block';
};
const roomName = id => state.data?.rooms.find(r => r.id === id)?.name || 'Unknown room';
const blockOptions = (selected = '', own = false) => state.data.blocks.filter(b => !own || state.user.role === 'admin' || state.user.blockIds.includes(b.id)).map(b => `<option value="${esc(b.id)}" ${b.id === selected ? 'selected' : ''}>${esc(b.program + ' ' + b.code + ' · ' + b.term)}</option>`).join('');
const roomOptions = selected => state.data.rooms.filter(r => r.monitored).map(r => `<option value="${r.id}" ${r.id === selected ? 'selected' : ''}>Floor ${r.floor} · ${esc(r.name)}</option>`).join('');
const field = (name, label, type = 'text', value = '', attrs = '') => `<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
const selectField = (name, label, options) => `<label class="field">${label}<select name="${name}" required>${options}</select></label>`;
const empty = (title, description = '') => `<div class="empty"><strong>${title}</strong>${description}</div>`;
function modal(title, description, content) {
  $('#modal').innerHTML = `${btn(icon('close'), 'close-modal', 'small close-modal', 'aria-label="Close dialog"')}<h2 id="dialog-title">${title}</h2>${description ? `<p>${description}</p>` : ''}${content}`;
  if (!$('#modal').open) $('#modal').showModal();
}
function formModal(title, description, form, body) {
  modal(title, description, `<form data-form="${form}">${body}<div class="error-text" data-error></div><div class="form-footer">${btn('Cancel', 'close-modal')}<button class="btn primary" type="submit">Save</button></div></form>`);
}
function heading(eyebrow, title, description, actions = '') {
  return `<div class="page-heading"><div><h1>${title}</h1>${description ? `<p>${description}</p>` : ''}</div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>`;
}
const views = SafeTapViews.create({
  state: state,
  helpers: {$, esc, fmt, initials, icon, APP_NAV, visibleNav, themeButton, btn, badge,
    heading, field, selectField, empty, blockName, roomName, blockOptions, roomOptions},
  currentEvent: () => offlineController.event(),
  offlineReadiness, offlineSummary, connectionNotice
});
const {login, render, eventStrip, metrics, filteredPeople, dashboard, roomPeople, floorMap, roomDetail, peopleFilters, peopleTable, attendance, scanner, students, directoryRows, team, history, reportView, queueList, offline} = views;
async function refresh(renderPage = true) {
  try {
    // An offline reload restores local data but never persists a CSRF token.
    // Recover the current session before uploading the device queue.
    if (!state.csrf) {
      const auth = await api('/me');
      if (state.user && auth.user.id !== state.user.id) throw Object.assign(new Error('Sign in with the account that saved these records.'), {status: 401});
      state.csrf = auth.csrf;
      state.user = auth.user;
    }
    const previousEventId = state.data?.active?.event.id;
    const previousConfig = state.config;
    state.config = await api('/config');
    const knownVersion = state.data?.user.id === state.user?.id ? state.data.directoryVersion : null;
    const next = await api('/state' + (knownVersion ? '?directoryVersion=' + encodeURIComponent(knownVersion) : ''));
    state.data = {...next, students: next.students || state.data?.students, blocks: next.blocks || state.data?.blocks};
    state.user = state.data.user;
    await localSet('session', {
      user: state.user,
      data: state.data,
      config: state.config
    });
    await saveOfflinePack().catch(e => { state.offlineError = e.message; });
    updateConnectionUI();
    const eventChanged = previousEventId !== state.data.active?.event.id;
    if (state.page === 'scanner' && eventChanged) {
      await stopReaders();
      if ($('#modal').open) $('#modal').close();
      render();
      toast('Evacuation event changed. Review the event before scanning.');
    } else if (renderPage || state.page === 'scanner' && (
      state.method === 'ocr' && previousConfig.ocrAvailable !== state.config.ocrAvailable ||
      state.method === 'qr' && previousConfig.qrAvailable !== state.config.qrAvailable
    )) render();
  } catch (e) {
    if (e.status === 401) {
      state.online = false;
      toast('Sign in again to upload records. Your saved scans are still on this phone.');
      state.user = null;
      await stopReaders();
      login();
      throw e;
    } else {
      state.online = false;
      if (renderPage) render();
      throw e;
    }
  }
}
async function connectSocket() {
  if (connectSocket.running || !state.user || state.socket?.connected) return;
  connectSocket.running = true;
  const ownerId = state.user.id;
  try {
    if (!window.io) await SafeTapAssets.loadScript('/socket.io/socket.io.min.js');
    if (!window.io || state.user?.id !== ownerId) return;
    state.socket?.disconnect();
    state.socket = io();
    state.socket.on('invalidate', () => {
      if (connectSocket.timer) return;
      connectSocket.timer = setTimeout(() => {
        connectSocket.timer = null;
        refresh(!$('#modal').open && !['scanner', 'students', 'attendance', 'team'].includes(state.page)).catch(() => {});
      }, state.page === 'scanner' ? 5000 : 500);
    });
    state.socket.on('connect', () => {
      if (state.user) refresh(state.page === 'dashboard').then(() => syncQueue()).catch(() => {});
    });
    state.socket.on('disconnect', () => {
      state.online = false;
      updateConnectionUI();
      const el = $('.connection');
      if (el) {
        el.textContent = 'Reconnecting';
        el.classList.add('offline');
      }
    });
  } finally { connectSocket.running = false; }
}
function showResult(message, kind = '', name = '') {
  const target = $('#scan-result');
  if (target) target.innerHTML = `<div class="scan-result ${kind}">${name ? `<strong>${esc(name)}</strong>` : ''}<span>${esc(message)}</span></div>`;else toast(message);
}
function matching(query) {
  return SafeTapDirectory.search(offlineController.students(), query);
}
function candidates(rows, method = 'manual') {
  const target = $('#candidates');
  if (target) target.innerHTML = rows.length ? rows.map(s => `<button class="candidate" data-action="confirm-student" data-id="${s.id}" data-method="${method}"><div><strong>${esc(s.name)}</strong><small>${esc(s.studentNumber)} · ${esc(blockName(s.blockId))}</small></div><span>Confirm arrival</span></button>`).join('') : empty('No matching record', 'Try the exact student number or use student search.');
}
function connectionNotice() {
  if (state.online || !state.user || !state.data) return '';
  return `<div class="notice connection-notice">Offline · ${state.queue.length} pending · Updated ${fmt(state.data.serverTime)}</div>`;
}
function offlineSummary() {
  const saved = Boolean(state.user && state.pack?.userId === state.user.id);
  const eventReady = saved && Boolean(state.pack.event) && state.pack.event.id === offlineController.event()?.id;
  let label = 'Downloading student list';
  const ready = eventReady && state.offlineAssets && !state.offlineError;
  if (state.offlineError) label = 'Offline setup needs attention';
  else if (ready) label = 'Ready offline';
  else if (saved) label = eventReady ? 'Preparing offline app' : 'Event download needed';
  return `<span class="readiness-label ${ready ? 'ready' : 'pending'}">${icon(ready ? 'check' : 'clock')}${label}</span>`;
}
function offlineReadiness() {
  const saved = Boolean(state.user && state.pack?.userId === state.user.id);
  const eventReady = saved && Boolean(state.pack.event) && state.pack.event.id === offlineController.event()?.id;
  const row = (label, ready) => `<li>${icon(ready ? 'check' : 'clock')}<span>${label}</span></li>`;
  const directory = saved ? `${state.pack.students.length} student IDs saved` : 'Student list not downloaded';
  const event = eventReady ? 'Event saved' : 'Connect to download an active event';
  const assets = state.offlineAssets ? 'Scanner assets saved' : 'Preparing scanner assets';
  const error = state.offlineError ? `<p class="error-text">${esc(state.offlineError)}</p>${btn('Retry setup', 'prepare', '', state.online ? '' : 'disabled')}` : '';
  return `<ul class="readiness-status">${row(directory, saved)}${row(event, eventReady)}${row(assets, state.offlineAssets)}</ul>${error}`;
}
function studentForm(id) {
  const s = id ? state.data.students.find(s => s.id === id) : {};
  formModal(id ? 'Edit student' : 'Register student', 'Use a unique student number. Each student gets a QR code automatically.', 'student', `<input type="hidden" name="id" value="${esc(s.id || '')}"><div class="form-grid">${field('name', 'Full name', 'text', s.name || '', 'required maxlength="120"')}${field('studentNumber', 'Student number', 'text', s.studentNumber || '', 'required maxlength="40"')}${selectField('blockId', 'Program / block', blockOptions(s.blockId))}${field('nfcUid', id ? 'NFC ID (leave blank to keep current ID)' : 'NFC ID (optional)', 'text', '', 'placeholder="04:A1:B2:C3:D4:E5"')}<div class="full"><label class="checkbox-label"><input type="checkbox" name="active" ${s.active !== false ? 'checked' : ''}>Active student</label>${id ? '<label class="checkbox-label"><input type="checkbox" name="clearNfc">Remove existing NFC ID</label>' : ''}</div></div>`);
}
function repForm(id) {
  const u = id ? state.data.reps.find(u => u.id === id) : {};
  formModal(id ? 'Edit representative' : 'Add representative', 'Representatives manage assigned classes and can scan all CICS blocks in an evacuation.', 'rep', `<input type="hidden" name="id" value="${esc(u.id || '')}">${field('name', 'Name', 'text', u.name || '', 'required')}${field('username', 'Username', 'text', u.username || '', 'required')}${field('password', id ? 'New password (optional)' : 'Password', 'password', '', 'minlength="12" maxlength="128" ' + (id ? '' : 'required'))}<p><small>Assigned blocks</small></p>${state.data.blocks.map(b => `<label class="checkbox-label"><input type="checkbox" name="blockIds" value="${b.id}" ${u.blockIds?.includes(b.id) ? 'checked' : ''}>${esc(b.program + ' ' + b.code + ' · ' + b.term)}</label>`).join('')}<label class="checkbox-label"><input type="checkbox" name="active" ${u.active !== false ? 'checked' : ''}>Account enabled</label>`);
}
async function action(el) {
  const a = el.dataset.action,
    id = el.dataset.id;
  if (a === 'theme') { window.SafeTapTheme?.toggle(); updateThemeButtons(); return; }
  if (a === 'choose-photo' || a === 'take-photo') {
    const input = $(a === 'take-photo' ? '#ocr-camera' : '#ocr-file');
    if (state.page !== 'scanner' || state.method !== 'ocr' || !state.config.ocrAvailable || input.disabled) return;
    input.value = '';
    input.click();
    return;
  }
  if (a === 'close-modal') return $('#modal').close();
  if (a === 'more') {
    return modal('More options', '', `<nav class="more-nav" aria-label="More pages">${visibleNav().filter(([page]) => !['dashboard', 'attendance', 'scanner'].includes(page)).map(([page, symbol, label]) => btn(icon(symbol) + label, 'navigate', '', `data-page="${page}"`)).join('')}</nav><div class="more-account"><strong>${esc(state.user.name)}</strong><small>${state.user.role === 'admin' ? 'Administrator' : 'Class representative'}</small>${btn(icon('logout') + 'Sign out', 'logout', '')}</div>`);
  }
  if (a === 'navigate') {
    await stopReaders();
    if ($('#modal').open) $('#modal').close();
    state.page = el.dataset.page;
    state.report = null;
    render();
    $('#page')?.focus?.({preventScroll:true});
    window.scrollTo?.({top:0});
    return;
  }
  if (a === 'show-missing') {
    state.filterStatus = 'pending';
    state.filterBlock = '';
    state.filterProgram = '';
    state.search = '';
    render();
    $('#student-list')?.scrollIntoView?.({block: 'start'});
    $('#people-search')?.focus?.({preventScroll: true});
    return;
  }
  if (a === 'floor') {
    state.floor = Number(el.dataset.floor);
    state.room = null;
    return render();
  }
  if (a === 'room') {
    state.room = id;
    return render();
  }
  if (a === 'method') {
    await stopReaders();
    state.method = el.dataset.method;
    return render();
  }
  if (a === 'refresh') return refresh();
  if (a === 'start-event') return formModal('Start an evacuation', 'Students marked present in today’s open classes will be expected. Classes without attendance remain unknown.', 'event', `${field('name', 'Event name', 'text', 'Earthquake drill', 'required')}${selectField('type', 'Event type', '<option value="drill">Earthquake drill</option><option value="emergency">Actual evacuation</option>')}${field('area', 'Evacuation area', 'text', '', 'placeholder="Designated campus assembly point" required')}<div class="notice">${state.data.classes.filter(c => c.status === 'open').length} open sessions today. Review class attendance and last-update times before starting.</div>`);
  if (a === 'close-event') return formModal('End evacuation event', 'Late offline uploads will require admin review. Ending an event does not mean every room is physically cleared.', 'close-event', `<input type="hidden" name="id" value="${id}"><div class="notice">${state.data.active.unaccounted} expected students have not arrived yet.</div><label class="checkbox-label"><input type="checkbox" required>I have reviewed the remaining students and want to end this event.</label>`);
  if (a === 'open-class') {
    const blocks = state.data.blocks.filter(b => state.user.role === 'admin' || state.user.blockIds.includes(b.id));
    if (!blocks.length) return toast('No blocks are assigned to you. Ask an administrator to assign your block.');
    const automatic = state.user.role === 'rep' && blocks.length === 1;
    const blockField = automatic
      ? `<input type="hidden" name="blockId" value="${esc(blocks[0].id)}"><div class="notice info"><strong>${esc(blockName(blocks[0].id))}</strong><br>${esc(blocks[0].term)} · Your assigned block</div>`
      : selectField('blockId', 'Block', blockOptions('', true));
    return formModal('Open class session', automatic ? 'Choose your current classroom. Your assigned block is already selected.' : 'Select your block and its current classroom. Mark present students after opening.', 'class', blockField + selectField('roomId', 'Current room', roomOptions('')));
  }
  if (a === 'move-class') return formModal('Move class to another room', 'The next evacuation will use this room for the class.', 'move-class', `<input type="hidden" name="id" value="${id}">${selectField('roomId', 'New room', roomOptions(state.data.classes.find(c => c.id === id).roomId))}`);
  if (a === 'end-class') return formModal('Close classroom attendance', 'This class will not be included in future evacuations unless you open a new session.', 'end-class', `<input type="hidden" name="id" value="${id}"><label class="checkbox-label"><input type="checkbox" required>Class has ended; close the session.</label>`);
  if (a === 'add-block') return formModal('Add academic block', 'Program, block code, and term together identify a block.', 'block', selectField('program', 'Program', '<option value="IT">BS Information Technology</option><option value="CS">BS Computer Science</option>') + field('code', 'Block code', 'text', '', 'placeholder="3101" required') + field('term', 'Academic term', 'text', '2026–2027 / 1st semester', 'required'));
  if (a === 'add-student' || a === 'edit-student') return studentForm(id);
  if (a === 'add-rep' || a === 'edit-rep') return repForm(id);
  if (a === 'import') return formModal('Import students', 'CSV columns: studentNumber,name,blockId,nfcUid. Select a block below as the default when blockId is blank. All rows are validated before any are saved.', 'import', selectField('defaultBlock', 'Default block', blockOptions()) + '<label class="field">CSV file<input type="file" name="file" accept=".csv,text/csv" required></label><p><small>Example: DEMO-101,Jamie Santos,,04AABBCC</small></p>');
  if (a === 'student-qr') {
    const result = await api(`/students/${id}/qr`);
    return modal('Student QR card', 'Print this card or save it to the student’s phone.', `<div class="center"><img class="qr-image" src="${result.image}" alt="SafeTap QR for ${esc(result.student.name)}"><h2>${esc(result.student.name)}</h2><p>${esc(result.student.studentNumber)} · ${esc(blockName(result.student.blockId))}</p><small>Present to a representative at the assembly point.</small></div><div class="form-footer">${btn('Replace QR code', 'rotate-qr', 'danger', `data-id="${id}"`)}${btn('Print / PDF', 'print', 'primary')}</div>`);
  }
  if (a === 'rotate-qr') return formModal('Replace QR code', 'The old QR code will stop working. Download the offline student list again after replacing it.', 'rotate-qr', `<input type="hidden" name="id" value="${id}"><label class="checkbox-label"><input type="checkbox" required>Replace this student’s QR code.</label>`);
  if (a === 'reference') return modal('Campus floor-plan reference', 'Source image from the existing project. The 5th floor is CAFAD and remains outside SafeTap monitoring.', '<img class="reference-image" src="/assets/cics-floorplan.png" alt="CICS building floor-plan reference">');
  if (a === 'confirm-student') {
    const s = offlineController.students().find(student => student.id === id);
    return formModal('Confirm student arrival', 'Verify the student is physically with you at the evacuation area.', 'confirm', `<input type="hidden" name="studentId" value="${id}"><input type="hidden" name="method" value="${el.dataset.method}"><h3>${esc(s.name)}</h3><p>${esc(s.studentNumber)} · ${esc(blockName(s.blockId))}</p><label class="checkbox-label"><input type="checkbox" required>I verified this student’s identity and arrival.</label>`);
  }
  if (a === 'qr') return startQr();
  if (a === 'nfc') return startNfc();
  if (a === 'stop-reader') { await stopReaders(); return; }
  if (a === 'prepare') return prepare();
  if (a === 'sync') return syncQueue();
  if (a === 'retry-item') {
    await updateQueue(rows => rows.map(row => {
      if (row.submissionId !== id) return row;
      const {error, ...retry} = row;
      return retry;
    }));
    return syncQueue();
  }
  if (a === 'discard-item') return formModal('Remove saved record', 'This record will not be submitted again. Use this only after resolving the student’s attendance.', 'discard', `<input type="hidden" name="id" value="${id}"><label class="checkbox-label"><input type="checkbox" required>Discard this record from this device.</label>`);
  if (a === 'report') {
    state.report = await api(`/events/${id}`);
    state.page = 'history';
    return render();
  }
  if (a === 'back-history') {
    state.report = null;
    return render();
  }
  if (a === 'print') return window.print();
  if (a === 'review') return formModal(el.dataset.choice === 'approve' ? 'Approve late check-in' : 'Remove an incorrect arrival', 'Your change and reason will be saved in the history.', 'review', `<input type="hidden" name="id" value="${id}"><input type="hidden" name="action" value="${el.dataset.choice}">${field('reason', 'Reason', 'text', '', 'required maxlength="300"')}`);
  if (a === 'baseline') return formModal('Edit expected students', 'Choose whether this student was expected when the event started. Your reason is saved in the change history.', 'baseline', selectField('studentId', 'Student', state.data.students.map(s => `<option value="${s.id}">${esc(s.studentNumber + ' · ' + s.name)}</option>`).join('')) + selectField('expected', 'Was this student expected?', '<option value="true">Expected on site</option><option value="false">Not expected / off campus</option>') + selectField('roomId', 'Last recorded room (when expected)', roomOptions()) + field('reason', 'Correction reason', 'text', '', 'required maxlength="300"'));
  if (a === 'logout') {
    await updateQueue(rows => rows);
    if (state.queue.length || state.busy || syncQueue.running) return toast('Upload or remove the saved records before signing out.');
    await api('/logout', {});
    await stopReaders();
    state.socket?.disconnect();
    await localSet('pack', null);
    await localSet('session', null);
    state.pack = null;
    state.user = null;
    state.data = null;
    state.csrf = null;
    return login();
  }
}
function parseCsv(source) {
  const rows = [];
  let row = [],
    value = '',
    quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') {
      if (quoted && source[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      row.push(value.trim());
      value = '';
    } else if (ch === '\n' && !quoted) {
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = '';
    } else if (ch !== '\r' || quoted) value += ch;
  }
  if (quoted) throw new Error('CSV has an unclosed quoted field.');
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  const header = (rows.shift() || []).map(h => h.replace(/^\uFEFF/, ''));
  if (!header.includes('studentNumber') || !header.includes('name')) throw new Error('CSV must include studentNumber and name headers.');
  return rows.map((values, index) => {
    if (values.length !== header.length) throw new Error(`CSV row ${index + 2} has the wrong number of columns.`);
    return Object.fromEntries(header.map((h, i) => [h, values[i]]));
  });
}
async function submit(form) {
  const type = form.dataset.form,
    f = new FormData(form),
    body = Object.fromEntries(f.entries());
  if (type === 'login') {
    await updateQueue(rows => rows);
    const result = await api('/login', body);
    if (state.queue.length && state.queue.some(q => q.ownerId !== result.user.id)) {
      state.csrf = result.csrf;
      await api('/logout', {});
      state.csrf = null;
      throw new Error('This device has unsynced records from another user. Sign in with that same account to sync them first.');
    }
    state.socket?.disconnect();
    state.data = null;
    state.report = null;
    state.page = 'dashboard';
    await localSet('session', null);
    state.user = result.user;
    state.csrf = result.csrf;
    if (state.pack?.userId !== state.user.id) {
      state.pack = null;
      await localSet('pack', null);
    }
    await refresh();
    connectSocket().catch(() => toast('Live updates are reconnecting. Records still refresh automatically.'));
    if (state.queue.length) syncQueue().catch(e => toast(e.message));
    return;
  }
  if (type === 'confirm') {
    await record({
      method: body.method,
      studentId: body.studentId,
      confirmed: true
    });
    $('#modal').close();
    return;
  }
  if (type === 'discard') {
    await updateQueue(rows => rows.filter(row => row.submissionId !== body.id));
    $('#modal').close();
    return render();
  }
  let route;
  if (type === 'event') route = '/events';
  if (type === 'close-event') route = `/events/${body.id}/close`;
  if (type === 'class') route = '/classes';
  if (type === 'move-class' || type === 'end-class') {
    route = `/classes/${body.id}`;
    if (type === 'end-class') body.close = true;
  }
  if (type === 'block') route = '/blocks';
  if (type === 'student') {
    route = '/students';
    body.active = f.has('active');
    if (!body.id) delete body.id;
    if (body.id && !body.nfcUid && !f.has('clearNfc')) delete body.nfcUid;
  }
  if (type === 'rep') {
    route = '/reps';
    body.active = f.has('active');
    body.blockIds = f.getAll('blockIds');
    if (!body.id) delete body.id;
  }
  if (type === 'rotate-qr') route = `/students/${body.id}/rotate-qr`;
  if (type === 'review') route = `/checkins/${body.id}/review`;
  if (type === 'baseline') {
    route = `/events/${state.report.event.id}/baseline`;
    body.expected = body.expected === 'true';
  }
  if (type === 'import') {
    const file = f.get('file');
    if (file.size > 1024 * 1024) throw new Error('CSV must be under 1 MB.');
    const rows = parseCsv(await file.text()).map(r => ({
      ...r,
      blockId: r.blockId || body.defaultBlock
    }));
    await api('/students/import', {
      rows
    });
  } else await api(route, body);
  $('#modal').close();
  await refresh(false);
  if (state.report) state.report = await api(`/events/${state.report.event.id}`);
  render();
  toast('Saved successfully.');
}
document.addEventListener('click', event => {
  const el = event.target.closest('[data-action]');
  if (!el || el.disabled) return;
  action(el).catch(e => toast(e.message));
});
document.addEventListener('keydown', event => {
  if (event.target.matches('g[data-action]') && ['Enter', ' '].includes(event.key)) {
    event.preventDefault();
    action(event.target).catch(e => toast(e.message));
  }
});
document.addEventListener('submit', async event => {
  const form = event.target;
  if (!form.matches('[data-form]')) return;
  event.preventDefault();
  const submitButton = form.querySelector('[type=submit]');
  submitButton.disabled = true;
  const error = form.querySelector('[data-error]');
  if (error) error.textContent = '';
  try {
    await submit(form);
  } catch (e) {
    if (error) error.textContent = e.message;else toast(e.message);
  } finally {
    submitButton.disabled = false;
  }
});
document.addEventListener('toggle', event => {
  const panel = event.target.dataset?.disclosure;
  if (panel && Object.hasOwn(state.panels, panel)) state.panels[panel] = event.target.open;
}, true);
document.addEventListener('input', event => {
  const el = event.target;
  if (el.id === 'scan-search') candidates(el.value.trim().length >= 2 ? matching(el.value.trim()) : []);
  if (el.id === 'directory-search') $('#directory-body').innerHTML = directoryRows(el.value);
  if (el.id === 'people-search') {
    state.search = el.value;
    const table = el.closest('.card').querySelector('.table-wrap');
    table.innerHTML = peopleTable(filteredPeople(state.data.active?.people || []));
  }
});
document.addEventListener('change', async event => {
  const el = event.target;
  try {
    if (el.dataset.class) {
      el.disabled = true;
      await api(`/classes/${el.dataset.class}`, {
        studentId: el.dataset.student,
        present: el.checked
      });
      await refresh();
    }
    if (el.id === 'ocr-file' || el.id === 'ocr-camera') await ocr(el.files[0]);
    if (el.id === 'filter-block') {
      state.filterBlock = el.value;
      render();
    }
    if (el.id === 'filter-status') {
      state.filterStatus = el.value;
      render();
    }
    if (el.id === 'filter-program') {
      state.filterProgram = el.value;
      render();
    }
  } catch (e) {
    if (el.dataset.class) {
      el.checked = !el.checked;
      el.disabled = false;
    }
    toast(e.message);
  }
});
window.addEventListener('offline', () => {
  state.online = false;
  updateConnectionUI();
  if (state.user && state.page !== 'scanner') render();else {
    const el = $('.connection');
    if (el) {
      el.textContent = 'Offline';
      el.classList.add('offline');
    }
  }
});
window.addEventListener('online', async () => {
  if (!state.user) return;
  try {
    await refresh(state.page !== 'scanner');
    await syncQueue();
  } catch (e) {
    toast(e.message);
  }
});
async function resumeConnection() {
  if (!state.user || !navigator.onLine || resumeConnection.running) return;
  resumeConnection.running = true;
  try {
    await refresh(state.page !== 'scanner' && !$('#modal').open);
    await syncQueue();
  } catch (e) { toast(e.message); }
  finally { resumeConnection.running = false; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') resumeConnection();
});
window.addEventListener('pageshow', () => resumeConnection());
async function boot() {
  try {
    state.queue = (await localGet('queue')) || [];
    state.pack = (await localGet('pack')) || null;
    const saved = await localGet('session');
    let verifiedUser;
    try {
      state.config = await api('/config');
      const auth = await api('/session');
      verifiedUser = auth.user;
      if (!auth.user) {
        await localSet('session', null);
        await localSet('pack', null);
        state.pack = null;
        state.data = null;
        state.user = null;
        state.csrf = null;
        login();
        return;
      }
      state.csrf = auth.csrf;
      if (state.queue.some(q => q.ownerId !== auth.user.id)) {
        await api('/logout', {});
        throw new Error('Sign in with the account that owns this device queue.');
      }
      state.user = auth.user;
      if (saved && (saved.user.id !== auth.user.id || saved.user.role !== auth.user.role)) {
        state.data = null;
        state.report = null;
        state.page = 'dashboard';
        await localSet('session', null);
      }
      if (state.pack?.userId !== state.user.id) {
        state.pack = null;
        await localSet('pack', null);
      }
      await refresh();
      connectSocket().catch(() => toast('Live updates are reconnecting. Records still refresh automatically.'));
      if (state.queue.length) syncQueue().catch(e => toast(e.message));
    } catch (e) {
      if (e.network && saved && (!verifiedUser || (saved.user.id === verifiedUser.id && saved.user.role === verifiedUser.role))) {
        Object.assign(state, {
          user: saved.user,
          data: saved.data,
          config: saved.config,
          online: false
        });
        render();
      } else login();
    }
    if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/sw.js').catch(() => toast('Offline app installation failed. Check the secure connection.'));
  } catch (e) {
    $('#app').innerHTML = `<div class="boot"><h1>SafeTap needs device storage</h1><p>${esc(e.message)}</p><p>Allow site storage and reload. Private browsing restrictions may prevent offline recording.</p></div>`;
  }
}
setInterval(async () => {
  if (!state.user || !navigator.onLine || syncQueue.running) return;
  try {
    await refresh(state.page === 'dashboard' && !$('#modal').open && document.activeElement?.tagName !== 'INPUT');
    if (state.queue.length) await syncQueue();
  } catch {}
}, 30000);
boot();

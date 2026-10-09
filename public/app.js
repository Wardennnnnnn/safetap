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
const S = {
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
  busy: false
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
  building: '<path d="M5 21V3h14v18M2 21h20M9 7h1m4 0h1m-6 4h1m4 0h1m-5 10v-6h4v6"/>'
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
const visibleNav = () => APP_NAV.filter(([page]) => S.user?.role === 'admin' || !['students', 'team'].includes(page));
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
    connection.textContent = S.online ? 'Connected' : 'Offline';
    connection.classList.toggle('offline', !S.online);
  }
  for (const button of document.querySelectorAll?.('[data-action="sync"]') || []) {
    button.disabled = !navigator.onLine || !S.queue.length || Boolean(syncQueue.running);
  }
  const count = $('#queue-count');
  if (count) count.innerHTML = badge(S.queue.length + ' waiting', S.queue.length ? 'amber' : '');
  const readiness = $('#offline-readiness');
  if (readiness) readiness.innerHTML = offlineReadiness();
}

const dbReady = new Promise((resolve, reject) => {
  const req = indexedDB.open('safetap-device', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('kv');
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
async function localGet(key) {
  const db = await dbReady;
  return new Promise((resolve, reject) => {
    const r = db.transaction('kv').objectStore('kv').get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function localSet(key, value) {
  const db = await dbReady;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
async function api(url, body) {
  let res;
  try {
    res = await fetch('/api' + url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(S.csrf ? {
          'X-CSRF-Token': S.csrf
        } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });
  } catch (e) {
    S.online = false;
    updateConnectionUI();
    throw Object.assign(new Error('Cannot reach SafeTap. Check your connection and try again.'), {
      network: true
    });
  }
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(friendlyError(data.error || 'Request failed.')), {
    status: res.status
  });
  S.online = true;
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
  const b = S.data?.blocks.find(b => b.id === id);
  return b ? `${b.program} ${b.code}` : 'Unknown block';
};
const roomName = id => S.data?.rooms.find(r => r.id === id)?.name || 'Unknown room';
const blockOptions = (selected = '', own = false) => S.data.blocks.filter(b => !own || S.user.role === 'admin' || S.user.blockIds.includes(b.id)).map(b => `<option value="${esc(b.id)}" ${b.id === selected ? 'selected' : ''}>${esc(b.program + ' ' + b.code + ' · ' + b.term)}</option>`).join('');
const roomOptions = selected => S.data.rooms.filter(r => r.monitored).map(r => `<option value="${r.id}" ${r.id === selected ? 'selected' : ''}>Floor ${r.floor} · ${esc(r.name)}</option>`).join('');
const field = (name, label, type = 'text', value = '', attrs = '') => `<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
const selectField = (name, label, options) => `<label class="field">${label}<select name="${name}" required>${options}</select></label>`;
const empty = (title, description) => `<div class="empty"><strong>${title}</strong>${description}</div>`;
function modal(title, description, content) {
  $('#modal').innerHTML = `${btn(icon('close'), 'close-modal', 'small close-modal', 'aria-label="Close dialog"')}<h2 id="dialog-title">${title}</h2><p>${description}</p>${content}`;
  if (!$('#modal').open) $('#modal').showModal();
}
function formModal(title, description, form, body) {
  modal(title, description, `<form data-form="${form}">${body}<div class="error-text" data-error></div><div class="form-footer">${btn('Cancel', 'close-modal')}<button class="btn primary" type="submit">Save</button></div></form>`);
}
function heading(eyebrow, title, description, actions = '') {
  return `<div class="page-heading"><div><h1>${title}</h1><p>${description}</p></div><div class="actions">${actions}</div></div>`;
}
function login() {
  $('#app').innerHTML = `<div class="login-page"><section class="login-story"><div class="login-brand-row"><a class="brand" href="/"><img src="/assets/icon.svg" alt="">SafeTap</a>${themeButton()}</div><div class="login-message"><h1>Know who<br> made it safely.</h1><p>Class attendance and student arrivals, in one place.</p><div class="login-purpose"><span>${icon('building')} CICS · Alangilan Campus</span><span>${icon('nfc')} Tap an ID. Record an arrival.</span><span>${icon('offline')} Save scans when the connection drops.</span></div></div><p class="login-school">College of Informatics and Computing Sciences<br>IT & CS student monitoring</p></section><section class="login-panel"><div class="login-box"><h2>Sign in to SafeTap</h2><p>Use the account given to you by your administrator.</p>${S.config.demo ? '<div class="notice">Test workspace · fictional students<br>Admin: <b>admin</b> · Representatives: <b>repit</b>, <b>repcs</b><br>Password: <b>SafeTapDemo123!</b></div>' : ''}<form data-form="login">${field('username', 'Username', 'text', '', 'autocomplete="username" required maxlength="50"')}${field('password', 'Password', 'password', '', 'autocomplete="current-password" required maxlength="128"')}<div class="error-text" data-error role="alert"></div><button class="btn primary" type="submit">Sign in</button></form><p class="login-foot">Need access? Contact your SafeTap administrator.</p></div></section></div>`;
}
function render() {
  if (!S.user || !S.data) return login();
  const nav = visibleNav();
  const current = APP_NAV.find(([page]) => page === S.page);
  $('#app').innerHTML = `<a class="skip-link" href="#page">Skip to page content</a><div class="layout"><aside class="sidebar"><div class="sidebar-brand"><div class="brand"><img src="/assets/icon.svg" alt="">SafeTap</div><p>CICS · Alangilan</p></div><nav class="nav" aria-label="Main navigation">${nav.map(([id, symbol, name]) => `<button data-action="navigate" data-page="${id}" class="${S.page === id ? 'active' : ''}" ${S.page === id ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${name}</span></button>`).join('')}</nav><div class="sidebar-bottom"><div class="scope-card">${icon('building')}<div><strong>CICS Building</strong><small>Floors 1–4 · IT & CS<br>Floor 5 (CAFAD) is not included.</small></div></div><div class="user-card"><div class="avatar">${esc(initials(S.user.name))}</div><div class="user-info"><strong>${esc(S.user.name)}</strong><small>${S.user.role === 'admin' ? 'Administrator' : 'Class representative'}</small></div><button class="logout" data-action="logout" title="Sign out" aria-label="Sign out">${icon('logout')}</button></div></div></aside><main class="main"><header class="topbar"><span class="mobile-brand">SafeTap</span><div class="breadcrumb">CICS <span>/</span> <strong>${esc(current?.[2] || 'Overview')}</strong></div><div class="top-right"><span class="time-display">${esc(S.data.date)} · Manila</span>${themeButton()}<span class="connection ${S.online ? '' : 'offline'}" role="status">${S.online ? 'Connected' : 'Offline'}</span></div></header>${S.config.demo ? '<div class="demo-banner">Test workspace · Fictional students · Changes are saved locally.</div>' : ''}<div class="content"><div id="connection-note">${!S.online ? `<div class="notice"><strong>You’re offline.</strong> Scans are saved on this phone until you reconnect. Last update: ${fmt(S.data.serverTime)}.</div>` : ''}</div><div id="page" tabindex="-1">${{
    dashboard, attendance, scanner, students, team, history, offline
  }[S.page]()}</div><footer class="footer-note"><span>SafeTap · CICS</span><span>Updated ${fmt(S.data.serverTime)} · Manila time</span></footer></div></main><nav class="mobile-nav" aria-label="Phone navigation">${APP_NAV.slice(0, 3).map(([id, symbol, name]) => `<button data-action="navigate" data-page="${id}" ${S.page === id ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${name}</span></button>`).join('')}<button data-action="more" ${!['dashboard', 'attendance', 'scanner'].includes(S.page) ? 'aria-current="page"' : ''}>${icon('more')}<span>More</span></button></nav></div>`;
}
function eventStrip() {
  const a = S.data.active;
  return a ? `<div class="event-strip"><div>${badge(a.event.type === 'drill' ? 'Drill in progress' : 'Evacuation in progress', 'blue')} <strong>${esc(a.event.name)}</strong><p>${esc(a.event.area)} · Started ${fmt(a.event.startedAt)}</p></div><div class="actions">${btn('Scan IDs', 'navigate', 'small', 'data-page="scanner"')}${S.user.role === 'admin' ? btn('End event', 'close-event', 'small', 'data-id="' + a.event.id + '"') : ''}</div></div>` : `<div class="event-strip"><div><strong>No active evacuation</strong><p>Prepare classroom attendance first. The next event will snapshot current, open sessions.</p></div>${badge('No active event')}</div>`;
}
function metrics(a) {
  return `<div class="metrics" aria-label="Evacuation totals">${[
    ['Still missing', a?.unaccounted ?? '—', 'From the expected students', 'pending'],
    ['Arrived safely', a?.safe ?? '—', 'From the expected students', 'safe'],
    ['Expected students', a?.total ?? '—', 'Present in class when the event started', ''],
    ['Other arrivals', a?.additional ?? '—', 'Not on the expected student list', '']
  ].map(([label, value, detail, cls]) => `<article class="metric ${cls}"><div class="metric-top">${label}</div><strong>${value}</strong><small>${detail}</small></article>`).join('')}</div>`;
}
function filteredPeople(people) {
  return people.filter(p => (!S.filterBlock || p.blockId === S.filterBlock) && (!S.filterProgram || p.program === S.filterProgram) && (!S.filterStatus || (S.filterStatus === 'safe' ? p.safe : !p.safe)) && (!S.search || `${p.name} ${p.studentNumber}`.toLowerCase().includes(S.search.toLowerCase())));
}
function dashboard() {
  const a = S.data.active,
    coverage = a?.event.coverage || S.data.blocks.map(b => ({
      blockId: b.id,
      blockLabel: blockName(b.id),
      session: S.data.classes.find(c => c.blockId === b.id && c.status === 'open')
    }));
  return heading('Campus operations', 'Evacuation overview', 'See who has arrived and who still needs to be checked.', S.user.role === 'admin' && !a ? btn('+ Start evacuation', 'start-event', 'primary') : btn('Refresh', 'refresh')) + eventStrip() + metrics(a) + `<div class="dashboard-grid"><div><section class="card"><div class="card-header"><div><h2 class="section-title">${icon('building')}Building overview</h2><p>Last recorded classrooms · Student arrivals</p></div>${badge('CICS BUILDING', 'blue')}</div><div class="floor-tabs" role="group" aria-label="Select floor">${[1, 2, 3, 4, 5].map(f => `<button data-action="floor" data-floor="${f}" class="${S.floor === f ? 'active' : ''}" aria-pressed="${S.floor === f}">Floor ${f}${f === 5 ? ' · CAFAD' : ''}</button>`).join('')}</div><div class="card-body">${floorMap()}<div class="legend">${S.data.active ? '<span><i class="dot green"></i>Accounted</span><span><i class="dot amber"></i>Pending</span>' : '<span><i class="dot blue"></i>Present in class</span>'}<span><i class="dot"></i>No attendance / not included</span></div><p class="map-note">A student's last recorded classroom is not their current location. “Arrived safely” does not mean the room has been inspected or cleared.</p><div class="spacer">${btn('View original floor plan', 'reference', 'small')}</div>${roomDetail()}</div></section><section class="card"><div class="card-header"><div><h2 class="section-title">${icon('students')}Student accountability</h2><p>Find students in the current evacuation</p></div>${badge(a ? `${a.people.length} records` : 'No event')}</div>${peopleFilters()}<div class="table-wrap">${peopleTable(a ? filteredPeople(a.people) : [])}</div></section></div><div><section class="card"><div class="card-header"><h2 class="section-title">${icon('attendance')}Block progress</h2>${badge(`${coverage.length} blocks`)}</div><div class="card-body">${coverage.length ? coverage.map(c => {
    const people = a?.people.filter(p => p.blockId === c.blockId && p.expected) || [],
      safe = people.filter(p => p.safe).length;
    return `<div class="block-row"><div class="row-between"><strong>${esc(c.blockLabel)}</strong>${!c.session ? badge('No attendance', 'amber') : badge(a ? `${safe} / ${people.length}` : 'Attendance ready', a && safe === people.length && people.length ? 'green' : 'blue')}</div><progress value="${safe}" max="${people.length || 1}" aria-label="${esc(c.blockLabel)} progress"></progress><div class="row-between"><small>${c.session ? `Room ${esc(roomName(c.session.roomId))}` : 'Needs current class attendance'}</small><small>${c.session ? fmt(c.session.updatedAt) : 'Attendance not recorded'}</small></div></div>`;
  }).join('') : empty('No blocks yet', 'Add IT and CS blocks to get started.')}</div></section><section class="card"><div class="card-header"><h2 class="section-title">${icon('clock')}Recent check-ins</h2>${badge('LIVE', 'green')}</div><div class="card-body">${a?.checkins.filter(c => c.status === 'confirmed').length ? a.checkins.filter(c => c.status === 'confirmed').sort((x, y) => y.receivedAt.localeCompare(x.receivedAt)).slice(0, 6).map(c => {
    const p = a.people.find(p => p.studentId === c.studentId);
    return `<div class="list-row"><div class="mini-avatar">${esc(initials(p?.name || '?'))}</div><div><strong>${esc(p?.name)}</strong><small>${esc(p?.blockLabel)} · ${esc(c.method.toUpperCase())}</small><small> · ${fmt(c.receivedAt)}</small></div>${badge('Safe', 'green')}</div>`;
  }).join('') : empty('Waiting for check-ins', 'Confirmed evacuation scans will appear here.')}</div></section><div class="notice info"><strong>Prepared for a connection drop?</strong><br>Download the event and student list before leaving your connection.<div class="spacer">${btn('Prepare offline scanning', 'navigate', 'small', 'data-page="offline"')}</div></div></div></div>`;
}
function roomPeople(roomId) {
  if (S.data.active) return S.data.active.people.filter(p => p.roomId === roomId && p.expected);
  const classes = S.data.classes.filter(c => c.roomId === roomId && c.status === 'open'),
    ids = new Set(S.data.attendance.filter(a => a.present && classes.some(c => c.id === a.classId)).map(a => a.studentId));
  return S.data.students.filter(s => s.active && ids.has(s.id)).map(s => ({
    ...s, studentId: s.id, roomId, roomName: roomName(roomId), blockLabel: blockName(s.blockId), present: true
  }));
}
function floorMap() {
  const rooms = S.data.rooms.filter(r => r.floor === S.floor).sort((a, b) => a.position - b.position),
    width = rooms.length * 112 + 28;
  return `<div class="map-title"><strong>F${S.floor} / ${S.floor === 5 ? 'CAFAD' : 'CICS'}</strong><small>${S.floor === 5 ? 'Not included in SafeTap' : 'Room guide · not to scale'}</small></div><div class="schematic"><svg class="room-svg" viewBox="0 0 ${width} 180" role="group" aria-label="Floor ${S.floor} rooms"><rect class="corridor" x="8" y="116" width="${width - 16}" height="34" rx="4"/><text class="corridor-label" x="${width / 2}" y="138" text-anchor="middle">CORRIDOR</text>${rooms.map((r, i) => {
    const people = roomPeople(r.id),
      safe = people.filter(p => p.safe).length,
      cls = !r.monitored ? 'gray' : people.length ? !S.data.active ? 'blue' : safe === people.length ? 'green' : 'amber' : '';
    return `<g class="room-group ${cls} ${S.room === r.id ? 'selected' : ''}" data-action="room" data-id="${r.id}" tabindex="0" role="button" aria-label="${esc(r.name)}: ${r.monitored ? people.length ? S.data.active ? `${safe} of ${people.length} accounted` : `${people.length} present in class` : 'no attendance recorded' : 'CAFAD not included in SafeTap'}"><rect class="room-shape" x="${i * 112 + 14}" y="15" width="100" height="92" rx="5"/><text class="room-name" x="${i * 112 + 64}" y="51" text-anchor="middle">${esc(r.name.split(' · ').at(-1).slice(0, 13))}</text><text class="room-count" x="${i * 112 + 64}" y="77" text-anchor="middle">${!r.monitored ? 'CAFAD' : people.length ? S.data.active ? `${safe} / ${people.length} safe` : `${people.length} present` : 'No attendance'}</text></g>`;
  }).join('')}</svg></div>`;
}
function roomDetail() {
  if (!S.room) return '';
  const r = S.data.rooms.find(r => r.id === S.room),
    people = roomPeople(S.room);
  return `<div class="room-detail"><h3>Room ${esc(r.name)} ${badge('Floor ' + r.floor)}</h3>${!r.monitored ? '<p class="muted">Floor 5 is CAFAD and is not included in SafeTap. Its rooms are not counted or marked clear.</p>' : peopleTable(people)}</div>`;
}
function peopleFilters() {
  return `<div class="filter-row"><input id="people-search" aria-label="Search students" placeholder="Search name or student number" value="${esc(S.search)}"><select id="filter-program" aria-label="Filter program"><option value="">All programs</option ${S.filterProgram === 'IT' ? 'selected' : ''}>IT</option><option ${S.filterProgram === 'CS' ? 'selected' : ''}>CS</option></select><select id="filter-block" aria-label="Filter block"><option value="">All blocks</option>${blockOptions(S.filterBlock)}</select><select id="filter-status" aria-label="Filter status"><option value="">All statuses</option><option value="safe" ${S.filterStatus === 'safe' ? 'selected' : ''}>Accounted</option><option value="pending" ${S.filterStatus === 'pending' ? 'selected' : ''}>Unaccounted</option></select></div>`;
}
function peopleTable(people) {
  return people.length ? `<table><thead><tr><th>Student</th><th>Block / room</th><th>Status</th></tr></thead><tbody>${people.map(p => `<tr><td><strong>${esc(p.name)}</strong><small>${esc(p.studentNumber)}</small></td><td>${esc(p.blockLabel)}<small>${esc(p.roomName || 'No recorded room')}${p.present || p.expected ? '' : ' · Not on the expected list'}</small></td><td>${p.present ? badge('Present in class', 'blue') : badge(p.safe ? 'Arrived safely' : 'Still missing', p.safe ? 'green' : 'amber')}</td></tr>`).join('')}</tbody></table>` : empty('No records to show', S.data.active ? 'Choose another filter or room.' : 'Mark students present in an open class session to show them here.');
}
function attendance() {
  return heading('', 'Class attendance', 'Choose a class, mark who is present, and keep its room up to date.', btn('+ Open class session', 'open-class', 'primary', S.online ? '' : 'disabled')) + (S.data.active ? '<div class="notice">An evacuation is in progress. Class attendance is locked because the expected student list has already been saved.</div>' : '') + `<div class="notice info">Only today’s open classes are included in the next event’s expected student list. Mark departures and close sessions when classes end.</div>` + (!S.data.classes.length ? `<section class="card">${empty('No class sessions today', 'Open a session, select your room, and mark the students who are present.')}</section>` : S.data.classes.map(c => {
    const roster = S.data.students.filter(s => s.blockId === c.blockId && s.active),
      present = S.data.attendance.filter(a => a.classId === c.id && a.present).length;
    return `<section class="card"><div class="card-header"><div><h2>${esc(blockName(c.blockId))} · Room ${esc(roomName(c.roomId))}</h2><p>${present} present / ${roster.length} registered · Updated ${fmt(c.updatedAt)}</p></div><div class="actions">${badge(c.status, c.status === 'open' ? 'green' : '')}${c.status === 'open' ? btn('Move room', 'move-class', 'small', `data-id="${c.id}"`) + btn('End class', 'end-class', 'small', `data-id="${c.id}"`) : ''}</div></div><div class="table-wrap"><table><thead><tr><th>Student</th><th>Student number</th><th>Currently present</th></tr></thead><tbody>${roster.map(s => `<tr><td>${esc(s.name)}</td><td>${esc(s.studentNumber)}</td><td><label class="checkbox-row"><input type="checkbox" data-class="${c.id}" data-student="${s.id}" ${S.data.attendance.some(a => a.classId === c.id && a.studentId === s.id && a.present) ? 'checked' : ''} ${c.status !== 'open' || S.data.active || !S.online ? 'disabled' : ''} aria-label="${esc(s.name)} present">Present</label></td></tr>`).join('')}</tbody></table></div></section>`;
  }).join(''));
}
function scanner() {
  const event = S.online ? S.data.active?.event : S.pack?.event;
  const methods = [['nfc', 'nfc', 'NFC'], ['qr', 'qr', 'QR code'], ['manual', 'search', 'Search'], ['ocr', 'photo', 'ID photo']];
  const active = (S.data?.active?.event.id === event?.id ? S.data.active : null);
  let reader;
  if (S.method === 'nfc') reader = `<div class="scan-target"><div class="scan-icon">${icon('nfc')}</div><h2>Tap a student ID</h2><p>Start the reader, then hold the ID near the back of your phone.</p><div class="actions scan-actions">${btn('Start NFC scan', 'nfc', 'primary', !event ? 'disabled' : '')}${btn('Stop reader', 'stop-reader', '', 'id="stop-reader" disabled')}</div><p class="reader-help">Use Android Chrome with NFC switched on.</p></div>`;
  else if (S.method === 'qr') reader = `<div id="camera"></div><div class="scan-target"><div class="scan-icon">${icon('qr')}</div><h2>Scan a student QR code</h2><p>Point the camera at the printed card or the code on the student’s phone.</p>${btn('Open camera', 'qr', 'primary', !S.config.qrAvailable || !event ? 'disabled' : '')}</div>${!S.config.qrAvailable ? '<div class="notice">QR scanning is not set up yet. Use NFC or student search.</div>' : ''}`;
  else if (S.method === 'manual') reader = `<label class="field">Find a student<input id="scan-search" type="search" placeholder="Name or student number" autocomplete="off"></label><div id="candidates">${empty('Search for a student', 'Enter at least two characters, then confirm their arrival.')}</div>`;
  else reader = `<div class="scan-target"><div class="scan-icon">${icon('photo')}</div><h2>Read a student ID photo</h2><p>Take a clear photo of the name and student number. Check the match before recording the arrival.</p><div class="actions photo-actions">${btn('Choose file', 'choose-photo', '', !S.config.ocrAvailable || !event ? 'disabled' : '')}${btn('Take photo', 'take-photo', 'primary', !S.config.ocrAvailable || !event ? 'disabled' : '')}</div><input id="ocr-file" type="file" accept="image/*" hidden ${!S.config.ocrAvailable || !event ? 'disabled' : ''}><input id="ocr-camera" type="file" accept="image/*" capture="environment" hidden ${!S.config.ocrAvailable || !event ? 'disabled' : ''}><p class="reader-help">Choose an existing image or use your phone’s camera. You’ll confirm the match before an arrival is saved.</p></div><div id="ocr-status" class="muted" role="status"></div><div id="candidates"></div>${!S.config.ocrAvailable ? '<div class="notice">ID photo scanning is not set up yet. Use NFC or student search.</div>' : ''}`;
  return heading('', 'Scan student IDs', 'At the assembly point, scan only students who are here with you.') + `<div class="scanner-layout"><section class="card scanner-card"><div class="card-header"><div><h2>${event ? esc(event.name) : 'No evacuation selected'}</h2><p>${event ? esc(event.area) : 'Start an evacuation or download an active event before scanning.'}</p></div>${badge(event ? S.online ? 'Ready to scan' : 'Saving on phone' : 'Not ready', event ? S.online ? 'green' : 'amber' : '')}</div><div class="card-body"><div class="scanner-methods" role="group" aria-label="Scanning method">${methods.map(([id, symbol, label]) => btn(icon(symbol) + label, 'method', id === S.method ? 'active' : '', `data-method="${id}" aria-pressed="${id === S.method}"`)).join('')}</div><div id="scan-result" role="status" aria-live="polite" aria-atomic="true"></div>${reader}</div></section><aside class="scanner-support"><section class="card"><div class="card-header"><div><h2>Saved on this phone</h2><p>Waiting to upload when connected.</p></div><span id="queue-count">${badge(S.queue.length + ' waiting', S.queue.length ? 'amber' : '')}</span></div><div class="card-body"><div id="device-queue">${queueList()}</div>${btn('Upload saved records', 'sync', 'full-button', navigator.onLine && S.queue.length ? '' : 'disabled')}<p class="reader-help">Records upload automatically when the connection returns.</p></div></section>${active ? `<div class="scanner-summary"><span><strong>${active.safe}</strong> arrived safely</span><span><strong>${active.unaccounted}</strong> still missing</span></div>` : ''}<div class="scanner-note"><h3>One student, one count.</h3><p>Scanning the same ID again does not add another arrival.</p><div id="offline-readiness" role="status">${offlineReadiness()}</div></div></aside></div>`;
}
function students() {
  return heading('Campus directory', 'Students & blocks', 'Manage students, class blocks, NFC IDs, and QR cards.', btn('Import CSV', 'import') + btn('+ Add block', 'add-block') + btn('+ Add student', 'add-student', 'primary')) + `<section class="card"><div class="card-header"><h2 class="section-title">${icon('students')}Student directory</h2>${badge(S.data.students.length + ' registered')}</div><div class="filter-row"><input id="directory-search" placeholder="Search name or student number" aria-label="Search directory"></div><div class="table-wrap"><table><thead><tr><th>Student</th><th>Program / block</th><th>Status</th><th>Student IDs</th></tr></thead><tbody id="directory-body">${directoryRows('')}</tbody></table></div></section><section class="card"><div class="card-header"><h2 class="section-title">${icon('building')}Academic blocks</h2></div><div class="table-wrap"><table><thead><tr><th>Program / code</th><th>Academic term</th><th>Students</th></tr></thead><tbody>${S.data.blocks.map(b => `<tr><td>${esc(b.program + ' ' + b.code)}</td><td>${esc(b.term)}</td><td>${S.data.students.filter(s => s.blockId === b.id && s.active).length}</td></tr>`).join('')}</tbody></table></div></section>`;
}
function directoryRows(query) {
  return S.data.students.filter(s => `${s.name} ${s.studentNumber}`.toLowerCase().includes(query.toLowerCase())).map(s => `<tr><td><strong>${esc(s.name)}</strong><small>${esc(s.studentNumber)}</small></td><td>${esc(blockName(s.blockId))}</td><td>${badge(s.active ? 'Active' : 'Inactive', s.active ? 'green' : '')}</td><td><div class="actions">${btn('Edit', 'edit-student', 'small', `data-id="${s.id}"`)}${btn('QR card', 'student-qr', 'small', `data-id="${s.id}"`)}</div></td></tr>`).join('');
}
function team() {
  return heading('People & access', 'Class representatives', 'Give each representative an account and assign their class blocks.', btn('+ Add representative', 'add-rep', 'primary')) + `<section class="card"><div class="table-wrap"><table><thead><tr><th>Representative</th><th>Assigned blocks</th><th>Status</th><th></th></tr></thead><tbody>${S.data.reps.map(u => `<tr><td><strong>${esc(u.name)}</strong><small>${esc(u.username)}</small></td><td>${esc(u.blockIds.map(blockName).join(', '))}</td><td>${badge(u.active ? 'Active' : 'Disabled', u.active ? 'green' : '')}</td><td>${btn('Edit access', 'edit-rep', 'small', `data-id="${u.id}"`)}</td></tr>`).join('')}</tbody></table></div></section><div class="notice info">Class attendance is restricted to assigned blocks. During an evacuation, any active representative may account for students from any CICS block.</div>`;
}
function history() {
  if (S.report) return reportView();
  return heading('Records & review', 'History & reports', 'Review past evacuations, student arrivals, and recorded changes.') + `<section class="card"><div class="table-wrap"><table><thead><tr><th>Event</th><th>Expected</th><th>Safe</th><th>Unaccounted</th><th>Additional</th><th></th></tr></thead><tbody>${S.data.history.map(h => `<tr><td><strong>${esc(h.event.name)}</strong><small>${fmt(h.event.startedAt)} · ${esc(h.event.status)}</small></td><td>${h.total}</td><td>${h.safe}</td><td>${h.unaccounted}</td><td>${h.additional}</td><td>${btn('View report', 'report', 'small', `data-id="${h.event.id}"`)}</td></tr>`).join('')}</tbody></table>${!S.data.history.length ? empty('No evacuation events yet', 'Completed and active event reports will appear here.') : ''}</div></section>${S.user.role === 'admin' ? `<section class="card"><div class="card-header"><h2 class="section-title">${icon('history')}Change history</h2>${badge('ADMIN')}</div><div class="table-wrap"><table><thead><tr><th>Time / actor</th><th>Action</th><th>Detail</th></tr></thead><tbody>${S.data.audit.map(a => `<tr><td>${fmt(a.time)}<small>${esc(a.actor)}</small></td><td>${esc(a.action)}</td><td>${esc(a.detail)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}`;
}
function reportView() {
  const r = S.report;
  return heading('Event report', esc(r.event.name), `${esc(r.event.area)} · ${fmt(r.event.startedAt)} · ${esc(r.event.status)}`, btn('All events', 'back-history') + btn('Print / PDF', 'print') + (S.user.role === 'admin' ? `<a class="btn" href="/api/events/${r.event.id}/export">${icon('download')}Export CSV</a>` + btn('Edit expected students', 'baseline') : '')) + `<h1 class="print-only">SafeTap · ${esc(r.event.name)}</h1><p class="print-only">${esc(r.event.area)} · ${fmt(r.event.startedAt)}</p>` + metrics(r) + `<section class="card"><div class="card-header"><h2>Expected students and arrivals</h2>${badge('Saved at event time')}</div><div class="table-wrap">${peopleTable(r.people)}</div></section>${S.user.role === 'admin' ? `<section class="card"><div class="card-header"><h2>Review student arrivals</h2></div><div class="table-wrap"><table><thead><tr><th>Student</th><th>Captured / received</th><th>Operator / method</th><th>Status / action</th></tr></thead><tbody>${r.checkins.map(c => `<tr><td>${esc(r.people.find(p => p.studentId === c.studentId)?.name || S.data.students.find(s => s.id === c.studentId)?.name || c.studentId)}</td><td>${fmt(c.capturedAt)}<small>Received ${fmt(c.receivedAt)}</small></td><td>${esc(c.actor)}<small>${esc(c.method)}</small></td><td>${badge(c.status, c.status === 'review' ? 'amber' : c.status === 'confirmed' ? 'green' : '')} ${c.status === 'review' ? btn('Approve', 'review', 'small', `data-id="${c.id}" data-choice="approve"`) : ''} ${c.status !== 'void' ? btn('Void', 'review', 'small', `data-id="${c.id}" data-choice="void"`) : ''}<small>${esc(c.reason || '')}</small></td></tr>`).join('')}</tbody></table></div></section>` : ''}`;
}
function queueList() {
  return S.queue.length ? S.queue.map(q => `<div class="pending-item"><div class="row-between"><strong>${esc(q.name)}</strong>${badge(q.error ? 'Needs attention' : 'Waiting to upload', 'amber')}</div><p>${esc(q.method.toUpperCase())} · ${fmt(q.capturedAt)}${q.error ? '<br>' + esc(q.error) : ''}</p>${q.error ? btn('Retry', 'retry-item', 'small', `data-id="${q.submissionId}"`) : ''}${btn('Remove record', 'discard-item', 'small', `data-id="${q.submissionId}"`)}</div>`).join('') : empty('No records waiting', 'Scans saved offline will appear here until they upload.');
}
function offline() {
  const prepared = Boolean(S.pack);
  return heading('', 'Offline records', 'Keep scanning if your connection drops. Upload saved records when you reconnect.', btn('Refresh offline copy', 'prepare', 'primary', S.online && S.data.active ? '' : 'disabled')) + `<div class="split"><section class="card"><div class="card-header"><h2>Ready for offline scanning?</h2>${badge(prepared ? 'Downloaded' : 'Not downloaded', prepared ? 'green' : 'amber')}</div><div class="card-body"><div class="readiness">${icon(prepared ? 'check' : 'offline')}<div><strong>Event and student list</strong><p>${prepared ? `${esc(S.pack.event.name)} · ${S.pack.students.length} students<br>Downloaded ${fmt(S.pack.preparedAt)}` : 'The active event and student IDs save automatically while this phone is connected.'}</p></div></div><div id="offline-readiness" role="status">${offlineReadiness()}</div><div class="readiness">${icon('nfc')}<div><strong>NFC scanning</strong><p>Available on supported Android browsers. Your student list must include the scanned ID.</p></div></div><div class="readiness">${icon('qr')}<div><strong>QR camera</strong><p>${S.config.qrAvailable ? 'Available. Assets save automatically while connected.' : 'Not set up on the server yet.'}</p></div></div><div class="readiness">${icon('photo')}<div><strong>ID photo reader</strong><p>${S.config.ocrAvailable ? 'Available. Assets save automatically while connected.' : 'Not set up on the server yet.'}</p></div></div><div class="notice info"><strong>Before you leave</strong><p>Keep this account signed in. Event and student IDs update automatically while connected. Arrivals appear on other devices after they reach the server.</p></div></div></section><section class="card"><div class="card-header"><div><h2 class="section-title">${icon('offline')}Waiting to upload</h2><p>${S.queue.length} saved record${S.queue.length === 1 ? '' : 's'}</p></div>${btn('Upload saved records', 'sync', '', navigator.onLine && S.queue.length ? '' : 'disabled')}</div><div class="card-body">${queueList()}<p class="muted">If the event has ended, late records need an administrator’s approval.</p></div></section></div>`;
}
async function refresh(renderPage = true) {
  try {
    // An offline reload restores local data but never persists a CSRF token.
    // Recover the current session before uploading the device queue.
    if (!S.csrf) {
      const auth = await api('/me');
      if (S.user && auth.user.id !== S.user.id) throw Object.assign(new Error('Sign in with the account that saved these records.'), {status: 401});
      S.csrf = auth.csrf;
      S.user = auth.user;
    }
    const previousEventId = S.data?.active?.event.id;
    const previousConfig = S.config;
    S.config = await api('/config');
    S.data = await api('/state');
    S.user = S.data.user;
    await localSet('session', {
      user: S.user,
      data: S.data,
      config: S.config
    });
    await saveOfflinePack().catch(e => { S.offlineError = e.message; });
    updateConnectionUI();
    const eventChanged = previousEventId !== S.data.active?.event.id;
    if (S.page === 'scanner' && eventChanged) {
      await stopReaders();
      if ($('#modal').open) $('#modal').close();
      render();
      toast('Evacuation event changed. Review the event before scanning.');
    } else if (renderPage || S.page === 'scanner' && (
      S.method === 'ocr' && previousConfig.ocrAvailable !== S.config.ocrAvailable ||
      S.method === 'qr' && previousConfig.qrAvailable !== S.config.qrAvailable
    )) render();
  } catch (e) {
    if (e.status === 401) {
      S.online = false;
      toast('Sign in again to upload records. Your saved scans are still on this phone.');
      S.user = null;
      login();
      throw e;
    } else {
      S.online = false;
      if (renderPage) render();
      throw e;
    }
  }
}
function connectSocket() {
  S.socket?.disconnect();
  if (!window.io) return;
  S.socket = io();
  S.socket.on('invalidate', () => {
    clearTimeout(connectSocket.timer);
    connectSocket.timer = setTimeout(() => refresh(!$('#modal').open && !['scanner', 'students', 'attendance', 'team'].includes(S.page)).catch(() => {}), 250);
  });
  S.socket.on('connect', () => {
    if (S.user) refresh(S.page === 'dashboard').then(() => syncQueue()).catch(() => {});
  });
  S.socket.on('disconnect', () => {
    S.online = false;
    updateConnectionUI();
    const el = $('.connection');
    if (el) {
      el.textContent = 'Reconnecting';
      el.classList.add('offline');
    }
  });
}
async function stopReaders() {
  S.nfcController?.abort();
  S.nfcController = null;
  S.nfcState = 'idle';
  updateNfcUI();
  if (S.scanner) {
    try {
      await S.scanner.stop();
      S.scanner.clear();
    } catch {}
    S.scanner = null;
  }
}
async function loadScript(src) {
  if (document.querySelector(`script[data-src="${src}"]`)) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.dataset.src = src;
    s.onload = resolve;
    s.onerror = () => {
      s.remove();
      reject(new Error('Scanner assets could not be loaded. Prepare this device while connected.'));
    };
    document.head.append(s);
  });
}
function showResult(message, kind = '') {
  const target = $('#scan-result');
  if (target) target.innerHTML = `<div class="scan-result ${kind}">${esc(message)}</div>`;else toast(message);
}
function matching(query) {
  const roster = S.online ? S.data.students : S.pack?.students || [];
  return roster.filter(s => s.active && `${s.studentNumber} ${s.name}`.toLowerCase().includes(query.toLowerCase())).slice(0, 12);
}
function candidates(rows, method = 'manual') {
  const target = $('#candidates');
  if (target) target.innerHTML = rows.length ? rows.map(s => `<button class="candidate" data-action="confirm-student" data-id="${s.id}" data-method="${method}"><div><strong>${esc(s.name)}</strong><small>${esc(s.studentNumber)} · ${esc(blockName(s.blockId))}</small></div><span>Confirm arrival</span></button>`).join('') : empty('No matching record', 'Try the exact student number or use student search.');
}
async function persistQueue() {
  await localSet('queue', S.queue);
}
async function record(input) {
  if (S.busy) return;
  S.busy = true;
  try {
    const event = S.online ? S.data.active?.event : S.pack?.event;
    if (!event) throw new Error('Start an evacuation or download an active event before scanning.');
    const scan = {
      submissionId: crypto.randomUUID(),
      eventId: event.id,
      capturedAt: new Date().toISOString(),
      ...input,
      ownerId: S.user.id
    };
    const studentList = S.online ? S.data.students : S.pack?.students || [];
    let student = studentList.find(s => s.id === input.studentId);
    if (input.method === 'nfc') student = studentList.find(s => s.nfcUid && s.nfcUid === String(input.credential || '').replace(/[:\s-]/g, '').toUpperCase());
    if (input.method === 'qr') student = studentList.find(s => s.qrToken === String(input.credential || '').replace(/^safetap:/, ''));
    if (!S.online) {
      if (!S.pack || S.pack.userId !== S.user.id) throw new Error('Connect once to save this event and its student IDs before scanning offline.');
      if (input.method === 'qr') student = S.pack.students.find(s => s.qrToken === String(input.credential).replace(/^safetap:/, ''));
      if (!student?.active) throw new Error('ID not found in the downloaded student list. Update the list while connected.');
    }
    // Persist first, before sending. A lost response is retried with the same submission ID.
    scan.name = student?.name || `${input.method.toUpperCase()} scan`;
    S.queue.push(scan);
    try {
      await persistQueue();
    } catch (e) {
      S.queue.pop();
      throw new Error('This phone could not save the scan. Allow site storage and try again.');
    }
    if (S.online) {
      try {
        const result = await api('/checkins', scan);
        S.queue = S.queue.filter(q => q.submissionId !== scan.submissionId);
        await persistQueue();
        await refresh(false).catch(() => {});
        showResult(`${result.name} · ${result.status === 'duplicate' ? 'Already recorded · counted once' : result.status === 'review' ? 'Waiting for administrator approval' : 'Arrived safely · saved to server'}`);
        return;
      } catch (e) {
        if (e.status === 401 || e.status === 403) {
          S.csrf = null;
          showResult('Saved on this phone. Reconnect or sign in again to upload.', 'pending');
          return;
        }
        if (!e.network) {
          scan.error = e.message;
          await persistQueue();
          showResult(e.message + ' · saved on this phone for review', 'error');
          return;
        }
      }
    }
    showResult(`${scan.name} · Saved on this device — waiting to upload`, 'pending');
  } catch (e) {
    showResult(friendlyError(e.message), 'error');
  } finally {
    S.busy = false;
    if ($('#device-queue')) $('#device-queue').innerHTML = queueList();
    updateConnectionUI();
  }
}
async function syncQueue() {
  if (syncQueue.running || !S.user || !S.queue.length) return;
  syncQueue.running = true;
  try {
    // A cookie may have changed in another tab. Always use the current session.
    const auth = await api('/me');
    if (auth.user.id !== S.user.id) throw Object.assign(new Error('Sign in with the account that saved these records.'), {status: 401});
    S.csrf = auth.csrf;
    for (const q of S.queue) {
      if (q.ownerId === S.user.id && (
        /^Session verification failed\./.test(q.error || '') ||
        q.error === 'Please refresh and sign in again. Your saved scans will stay on this phone.'
      )) delete q.error;
    }
    let accepted = 0, rejected = 0;
    while (true) {
      const scans = S.queue.filter(q => q.ownerId === S.user.id && !q.error).slice(0, 100);
      if (!scans.length) break;
      const {
        results
      } = await api('/sync', {
        scans
      });
      for (const r of results) {
        const q = S.queue.find(q => q.submissionId === r.submissionId);
        if (r.status === 'rejected') {
          if (q) q.error = r.error;
        } else S.queue = S.queue.filter(q => q.submissionId !== r.submissionId);
      }
      await persistQueue();
      accepted += results.filter(r => r.status !== 'rejected').length;
      rejected += results.filter(r => r.status === 'rejected').length;
      if (!results.length) break;
    }
    if (!accepted && !rejected) return;
    await refresh(false);
    toast(`Sync complete: ${accepted} accepted or already recorded; ${rejected} need attention.`);
    if (S.page !== 'scanner') render();
    else if ($('#device-queue')) $('#device-queue').innerHTML = queueList();
  } catch (e) {
    if (e.status === 401) {
      S.csrf = null;
      S.user = null;
      await stopReaders();
      login();
      toast('Sign in again to upload. Saved scans are still on this phone.');
    }
    throw e;
  } finally {
    syncQueue.running = false;
    updateConnectionUI();
  }
}
function offlineReadiness() {
  if (S.offlineError) return `<p class="error-text">Offline setup needs attention: ${esc(S.offlineError)}</p>${btn('Retry offline setup', 'prepare', '', S.online && S.data.active ? '' : 'disabled')}`;
  if (!S.pack || S.pack.userId !== S.user?.id || S.online && S.pack.event.id !== S.data.active?.event.id) return '<p>Event and student list save automatically while connected. Keep this page open until ready.</p>';
  return `<p>Event and ${S.pack.students.length} student IDs saved automatically ${fmt(S.pack.preparedAt)}. NFC and student search are ready offline.</p><p class="muted">${S.offlineAssets ? 'Offline app, QR and photo assets saved.' : 'Offline app and camera assets are still downloading. Keep this page open while connected.'}</p>`;
}
async function saveOfflinePack() {
  if (!S.user || !S.online) return;
  if (!S.data.active) {
    S.pack = null;
    await localSet('pack', null);
    S.offlineError = '';
    return;
  }
  const ownerId = S.user.id, eventId = S.data.active.event.id;
  const pack = await api('/offline');
  if (S.user?.id !== ownerId || S.data.active?.event.id !== eventId || pack.userId !== ownerId || pack.event.id !== eventId) return;
  await localSet('pack', pack);
  S.pack = pack;
  S.offlineError = '';
  cacheOfflineAssets().catch(e => { S.offlineError = e.message; updateConnectionUI(); });
}
async function cacheOfflineAssets() {
  if (S.offlineAssets) return;
  if (cacheOfflineAssets.running) return cacheOfflineAssets.running;
  cacheOfflineAssets.running = (async () => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) throw new Error('Offline preparation requires HTTPS (or localhost) and service-worker support.');
    await navigator.serviceWorker.register('/sw.js');
    await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('Offline shell is not ready. Reload on a secure connection and retry.')), 10000))]);
    if (S.config.qrAvailable || S.config.ocrAvailable) {
      const response = await fetch('/vendor/manifest.json');
      if (!response.ok) throw new Error('Vendor manifest missing. Run npm run vendor on the server.');
      const files = await response.json();
      const cache = await caches.open('safetap-vendor-v1');
      for (const file of files) if (!await cache.match(file)) await cache.add(file);
    }
    S.offlineAssets = true;
    S.offlineError = '';
    if (navigator.storage?.persist) await navigator.storage.persist().catch(() => {});
    updateConnectionUI();
  })();
  try { await cacheOfflineAssets.running; } finally { cacheOfflineAssets.running = null; }
}
async function prepare() {
  if (!S.data.active) throw new Error('Start an event first.');
  await saveOfflinePack();
  await cacheOfflineAssets();
  toast('Event, student IDs and scanner assets saved on this phone.');
  render();
}
async function startQr() {
  await stopReaders();
  await loadScript('/vendor/html5-qrcode.min.js');
  S.scanner = new Html5Qrcode('camera');
  let last = '',
    time = 0;
  await S.scanner.start({
    facingMode: 'environment'
  }, {
    fps: 8,
    qrbox: {
      width: 220,
      height: 220
    }
  }, value => {
    if (value === last && Date.now() - time < 4000) return;
    last = value;
    time = Date.now();
    record({
      method: 'qr',
      credential: value
    });
  }, () => {});
}
function updateNfcUI() {
  const start = $('[data-action="nfc"]');
  const stop = $('#stop-reader');
  if (start) {
    start.disabled = S.nfcState !== 'idle' || !(S.online ? S.data?.active?.event : S.pack?.event);
    start.innerHTML = icon('nfc') + (S.nfcState === 'starting' ? 'Starting reader…' : S.nfcState === 'reading' ? 'NFC reader is on' : 'Start NFC scan');
  }
  if (stop) stop.disabled = S.nfcState === 'idle';
}
async function startNfc() {
  if (!('NDEFReader' in window)) return showResult('NFC scanning is not available in this browser. Use Android Chrome with NFC switched on, or choose QR code or Search.', 'error');
  if (!(S.online ? S.data?.active?.event : S.pack?.event)) return showResult('Start an evacuation or download an active event before scanning.', 'error');
  await stopReaders();
  const controller = new AbortController();
  S.nfcController = controller;
  S.nfcState = 'starting';
  updateNfcUI();
  try {
    const reader = new NDEFReader();
    let lastUid = '', lastReadAt = 0;
    reader.onreading = event => {
      if (controller.signal.aborted || S.page !== 'scanner' || S.method !== 'nfc') return;
      const uid = String(event.serialNumber || '').replace(/[:\s-]/g, '').toUpperCase();
      if (!uid || !/^[0-9A-F]{4,40}$/.test(uid) || uid.length % 2 !== 0) return showResult('The phone could not read this ID number. Try again, or use QR code or Search.', 'error');
      if (uid === lastUid && Date.now() - lastReadAt < 2000) return;
      lastUid = uid;
      lastReadAt = Date.now();
      record({method:'nfc', credential:uid});
    };
    reader.onreadingerror = () => {
      if (!controller.signal.aborted) showResult('Could not read the ID. Hold it still near the phone and try again.', 'error');
    };
    await reader.scan({signal: controller.signal});
    if (controller.signal.aborted) return;
    S.nfcState = 'reading';
    updateNfcUI();
    showResult('Reader is on. Hold the student ID near the back of your phone.', 'pending');
  } catch (e) {
    if (controller.signal.aborted) return;
    S.nfcController = null;
    S.nfcState = 'idle';
    updateNfcUI();
    showResult(e.name === 'NotAllowedError' ? 'NFC permission was denied. Allow NFC for this site, then try again.' : 'The NFC reader could not start. Check that NFC is switched on and try again.', 'error');
  }
}
async function ocr(file) {
  if (!file) return;
  if (file.size > 12 * 1024 * 1024) throw new Error('Choose an image smaller than 12 MB.');
  await loadScript('/vendor/tesseract.min.js');
  $('#ocr-status').textContent = 'Reading the ID on this device…';
  if (!S.worker) S.worker = await Tesseract.createWorker('eng', 1, {
    workerPath: '/vendor/worker.min.js',
    corePath: '/vendor',
    langPath: '/vendor',
    logger: m => {
      if ($('#ocr-status')) $('#ocr-status').textContent = `${m.status} ${Math.round((m.progress || 0) * 100)}%`;
    }
  });
  const {
    data: {
      text
    }
  } = await S.worker.recognize(file);
  const normalized = text.toLowerCase().replace(/[^a-z0-9]/g, '');
  const roster = S.online ? S.data.students : S.pack?.students || [];
  const numberMatches = roster.filter(s => normalized.includes(s.studentNumber.toLowerCase().replace(/[^a-z0-9]/g, '')));
  let rows = numberMatches;
  if (!rows.length) rows = roster.filter(s => s.name.toLowerCase().split(/\s+/).filter(w => w.length > 2).filter(w => text.toLowerCase().includes(w)).length >= 2);
  if ($('#ocr-status')) $('#ocr-status').textContent = 'Reading complete. Check the student number and confirm the correct person. No arrival has been recorded yet.';
  candidates(rows.slice(0, 12), 'ocr');
}
function studentForm(id) {
  const s = id ? S.data.students.find(s => s.id === id) : {};
  formModal(id ? 'Edit student' : 'Register student', 'Use a unique student number. Each student gets a QR code automatically.', 'student', `<input type="hidden" name="id" value="${esc(s.id || '')}"><div class="form-grid">${field('name', 'Full name', 'text', s.name || '', 'required maxlength="120"')}${field('studentNumber', 'Student number', 'text', s.studentNumber || '', 'required maxlength="40"')}${selectField('blockId', 'Program / block', blockOptions(s.blockId))}${field('nfcUid', id ? 'NFC ID (leave blank to keep current ID)' : 'NFC ID (optional)', 'text', '', 'placeholder="04:A1:B2:C3:D4:E5"')}<div class="full"><label class="checkbox-label"><input type="checkbox" name="active" ${s.active !== false ? 'checked' : ''}>Active student</label>${id ? '<label class="checkbox-label"><input type="checkbox" name="clearNfc">Remove existing NFC ID</label>' : ''}</div></div>`);
}
function repForm(id) {
  const u = id ? S.data.reps.find(u => u.id === id) : {};
  formModal(id ? 'Edit representative' : 'Add representative', 'Representatives manage assigned classes and can scan all CICS blocks in an evacuation.', 'rep', `<input type="hidden" name="id" value="${esc(u.id || '')}">${field('name', 'Name', 'text', u.name || '', 'required')}${field('username', 'Username', 'text', u.username || '', 'required')}${field('password', id ? 'New password (optional)' : 'Password', 'password', '', 'minlength="12" maxlength="128" ' + (id ? '' : 'required'))}<p><small>Assigned blocks</small></p>${S.data.blocks.map(b => `<label class="checkbox-label"><input type="checkbox" name="blockIds" value="${b.id}" ${u.blockIds?.includes(b.id) ? 'checked' : ''}>${esc(b.program + ' ' + b.code + ' · ' + b.term)}</label>`).join('')}<label class="checkbox-label"><input type="checkbox" name="active" ${u.active !== false ? 'checked' : ''}>Account enabled</label>`);
}
async function action(el) {
  const a = el.dataset.action,
    id = el.dataset.id;
  if (a === 'theme') { window.SafeTapTheme?.toggle(); updateThemeButtons(); return; }
  if (a === 'choose-photo' || a === 'take-photo') {
    const input = $(a === 'take-photo' ? '#ocr-camera' : '#ocr-file');
    if (S.page !== 'scanner' || S.method !== 'ocr' || !S.config.ocrAvailable || input.disabled) return;
    input.value = '';
    input.click();
    return;
  }
  if (a === 'close-modal') return $('#modal').close();
  if (a === 'more') {
    return modal('More options', '', `<nav class="more-nav" aria-label="More pages">${visibleNav().filter(([page]) => !['dashboard', 'attendance', 'scanner'].includes(page)).map(([page, symbol, label]) => btn(icon(symbol) + label, 'navigate', '', `data-page="${page}"`)).join('')}</nav><div class="more-account"><strong>${esc(S.user.name)}</strong><small>${S.user.role === 'admin' ? 'Administrator' : 'Class representative'}</small>${btn(icon('logout') + 'Sign out', 'logout', '')}</div>`);
  }
  if (a === 'navigate') {
    await stopReaders();
    if ($('#modal').open) $('#modal').close();
    S.page = el.dataset.page;
    S.report = null;
    render();
    $('#page')?.focus?.({preventScroll:true});
    window.scrollTo?.({top:0});
    return;
  }
  if (a === 'floor') {
    S.floor = Number(el.dataset.floor);
    S.room = null;
    return render();
  }
  if (a === 'room') {
    S.room = id;
    return render();
  }
  if (a === 'method') {
    await stopReaders();
    S.method = el.dataset.method;
    return render();
  }
  if (a === 'refresh') return refresh();
  if (a === 'start-event') return formModal('Start an evacuation', 'Students marked present in today’s open classes will be expected. Classes without attendance remain unknown.', 'event', `${field('name', 'Event name', 'text', 'Earthquake drill', 'required')}${selectField('type', 'Event type', '<option value="drill">Earthquake drill</option><option value="emergency">Actual evacuation</option>')}${field('area', 'Evacuation area', 'text', '', 'placeholder="Designated campus assembly point" required')}<div class="notice">${S.data.classes.filter(c => c.status === 'open').length} open sessions today. Review class attendance and last-update times before starting.</div>`);
  if (a === 'close-event') return formModal('End evacuation event', 'Late offline uploads will require admin review. Ending an event does not mean every room is physically cleared.', 'close-event', `<input type="hidden" name="id" value="${id}"><div class="notice">${S.data.active.unaccounted} expected students have not arrived yet.</div><label class="checkbox-label"><input type="checkbox" required>I have reviewed the remaining students and want to end this event.</label>`);
  if (a === 'open-class') {
    const blocks = S.data.blocks.filter(b => S.user.role === 'admin' || S.user.blockIds.includes(b.id));
    if (!blocks.length) return toast('No blocks are assigned to you. Ask an administrator to assign your block.');
    const automatic = S.user.role === 'rep' && blocks.length === 1;
    const blockField = automatic
      ? `<input type="hidden" name="blockId" value="${esc(blocks[0].id)}"><div class="notice info"><strong>${esc(blockName(blocks[0].id))}</strong><br>${esc(blocks[0].term)} · Your assigned block</div>`
      : selectField('blockId', 'Block', blockOptions('', true));
    return formModal('Open class session', automatic ? 'Choose your current classroom. Your assigned block is already selected.' : 'Select your block and its current classroom. Mark present students after opening.', 'class', blockField + selectField('roomId', 'Current room', roomOptions('')));
  }
  if (a === 'move-class') return formModal('Move class to another room', 'The next evacuation will use this room for the class.', 'move-class', `<input type="hidden" name="id" value="${id}">${selectField('roomId', 'New room', roomOptions(S.data.classes.find(c => c.id === id).roomId))}`);
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
    const s = S.data.students.find(s => s.id === id) || S.pack?.students.find(s => s.id === id);
    return formModal('Confirm student arrival', 'Verify the student is physically with you at the evacuation area.', 'confirm', `<input type="hidden" name="studentId" value="${id}"><input type="hidden" name="method" value="${el.dataset.method}"><h3>${esc(s.name)}</h3><p>${esc(s.studentNumber)} · ${esc(blockName(s.blockId))}</p><label class="checkbox-label"><input type="checkbox" required>I verified this student’s identity and arrival.</label>`);
  }
  if (a === 'qr') return startQr();
  if (a === 'nfc') return startNfc();
  if (a === 'stop-reader') { await stopReaders(); return showResult('Reader stopped. Start again when you are ready.'); }
  if (a === 'prepare') return prepare();
  if (a === 'sync') return syncQueue();
  if (a === 'retry-item') {
    const q = S.queue.find(q => q.submissionId === id);
    delete q.error;
    await persistQueue();
    return syncQueue();
  }
  if (a === 'discard-item') return formModal('Remove saved record', 'This record will not be submitted again. Use this only after resolving the student’s attendance.', 'discard', `<input type="hidden" name="id" value="${id}"><label class="checkbox-label"><input type="checkbox" required>Discard this record from this device.</label>`);
  if (a === 'report') {
    S.report = await api(`/events/${id}`);
    S.page = 'history';
    return render();
  }
  if (a === 'back-history') {
    S.report = null;
    return render();
  }
  if (a === 'print') return window.print();
  if (a === 'review') return formModal(el.dataset.choice === 'approve' ? 'Approve late check-in' : 'Remove an incorrect arrival', 'Your change and reason will be saved in the history.', 'review', `<input type="hidden" name="id" value="${id}"><input type="hidden" name="action" value="${el.dataset.choice}">${field('reason', 'Reason', 'text', '', 'required maxlength="300"')}`);
  if (a === 'baseline') return formModal('Edit expected students', 'Choose whether this student was expected when the event started. Your reason is saved in the change history.', 'baseline', selectField('studentId', 'Student', S.data.students.map(s => `<option value="${s.id}">${esc(s.studentNumber + ' · ' + s.name)}</option>`).join('')) + selectField('expected', 'Was this student expected?', '<option value="true">Expected on site</option><option value="false">Not expected / off campus</option>') + selectField('roomId', 'Last recorded room (when expected)', roomOptions()) + field('reason', 'Correction reason', 'text', '', 'required maxlength="300"'));
  if (a === 'logout') {
    if (S.queue.length) return toast('Upload or remove the saved records before signing out.');
    await api('/logout', {});
    await stopReaders();
    S.socket?.disconnect();
    await localSet('pack', null);
    await localSet('session', null);
    S.pack = null;
    S.user = null;
    S.data = null;
    S.csrf = null;
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
    const result = await api('/login', body);
    if (S.queue.length && S.queue.some(q => q.ownerId !== result.user.id)) {
      S.csrf = result.csrf;
      await api('/logout', {});
      S.csrf = null;
      throw new Error('This device has unsynced records from another user. Sign in with that same account to sync them first.');
    }
    S.user = result.user;
    S.csrf = result.csrf;
    if (S.pack?.userId !== S.user.id) {
      S.pack = null;
      await localSet('pack', null);
    }
    await refresh();
    connectSocket();
    if (S.queue.length) syncQueue().catch(e => toast(e.message));
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
    S.queue = S.queue.filter(q => q.submissionId !== body.id);
    await persistQueue();
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
    route = `/events/${S.report.event.id}/baseline`;
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
  if (S.report) S.report = await api(`/events/${S.report.event.id}`);
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
document.addEventListener('input', event => {
  const el = event.target;
  if (el.id === 'scan-search') candidates(el.value.trim().length >= 2 ? matching(el.value.trim()) : []);
  if (el.id === 'directory-search') $('#directory-body').innerHTML = directoryRows(el.value);
  if (el.id === 'people-search') {
    S.search = el.value;
    const table = el.closest('.card').querySelector('.table-wrap');
    table.innerHTML = peopleTable(filteredPeople(S.data.active?.people || []));
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
      S.filterBlock = el.value;
      render();
    }
    if (el.id === 'filter-status') {
      S.filterStatus = el.value;
      render();
    }
    if (el.id === 'filter-program') {
      S.filterProgram = el.value;
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
  S.online = false;
  updateConnectionUI();
  if (S.user && S.page !== 'scanner') render();else {
    const el = $('.connection');
    if (el) {
      el.textContent = 'Offline';
      el.classList.add('offline');
    }
  }
});
window.addEventListener('online', async () => {
  if (!S.user) return;
  try {
    await refresh(S.page !== 'scanner');
    await syncQueue();
  } catch (e) {
    toast(e.message);
  }
});
async function resumeConnection() {
  if (!S.user || !navigator.onLine || resumeConnection.running) return;
  resumeConnection.running = true;
  try {
    await refresh(S.page !== 'scanner' && !$('#modal').open);
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
    S.queue = (await localGet('queue')) || [];
    S.pack = (await localGet('pack')) || null;
    const saved = await localGet('session');
    try {
      S.config = await api('/config');
      const auth = await api('/me');
      S.csrf = auth.csrf;
      if (S.queue.some(q => q.ownerId !== auth.user.id)) {
        await api('/logout', {});
        throw new Error('Sign in with the account that owns this device queue.');
      }
      S.user = auth.user;
      if (S.pack?.userId !== S.user.id) {
        S.pack = null;
        await localSet('pack', null);
      }
      await refresh();
      connectSocket();
      if (S.queue.length) syncQueue().catch(e => toast(e.message));
    } catch (e) {
      if (e.network && saved) {
        Object.assign(S, {
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
  if (!S.user || !navigator.onLine || syncQueue.running) return;
  try {
    await refresh(S.page === 'dashboard' && !$('#modal').open && document.activeElement?.tagName !== 'INPUT');
    if (S.queue.length) await syncQueue();
  } catch {}
}, 30000);
boot();

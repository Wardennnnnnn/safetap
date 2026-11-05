'use strict';

// Page rendering has no network or storage calls. Controllers supply state and
// actions; this module builds the existing campus interface from that state.
globalThis.SafeTapViews = {create({state, helpers, currentEvent, offlineReadiness, offlineSummary, connectionNotice}) {
  const {$, esc, fmt, initials, icon, APP_NAV, visibleNav, themeButton, btn, badge,
    heading, field, selectField, empty, blockName, roomName, blockOptions, roomOptions} = helpers;
  function login() {
    $('#app').innerHTML = `
      <main class="login-page">
      <section class="login-story">
      <div class="login-brand-row"><a class="brand" href="/"><img src="/assets/icon-maroon.svg" alt="">SafeTap</a>${themeButton()}
      </div>
      <div class="login-message">
      <h1>Know who<br> made it safely.
      </h1>
      </div>
      <p class="login-school">College of Informatics and Computing Sciences<br>IT & CS student monitoring
      </p>
      </section>
      <section class="login-panel">
      <div class="login-box">
      <h2>Sign in
      </h2>
${state.config.demo ? '<details class="demo-accounts"><summary>Demo accounts</summary><p>Admin: <b>admin</b> · Reps: <b>repit</b>, <b>repcs</b><br>Password: <b>SafeTapDemo123!</b></p></details>' : ''}
      <form data-form="login">${field('username', 'Username', 'text', '', 'autocomplete="username" required maxlength="50"')}${field('password', 'Password', 'password', '', 'autocomplete="current-password" required maxlength="128"')}
      <div class="error-text" data-error role="alert">
      </div><button class="btn primary" type="submit">Sign in</button>
      </form>
      <p class="login-foot">Access help: contact your administrator.
      </p>
      </div>
      </section>
      </main>`;
  }
  function render() {
    if (!state.user || !state.data) return login();
    const nav = visibleNav();
    const current = APP_NAV.find(([page]) => page === state.page);
    $('#app').innerHTML = `<a class="skip-link" href="#page">Skip to page content</a>
      <div class="layout">
      <aside class="sidebar">
      <div class="sidebar-brand">
      <div class="brand"><img src="/assets/icon-maroon.svg" alt="">SafeTap
      </div>
      <p>CICS · Alangilan
      </p>
      </div>
      <nav class="nav" aria-label="Main navigation">${nav.map(([id, symbol, name]) => `<button data-action="navigate" data-page="${id}" class="${state.page === id ? 'active' : ''}" ${state.page === id ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${name}</span></button>`).join('')}
      </nav>
      <div class="sidebar-bottom">
      <div class="scope-card">${icon('building')}
      <div><strong>CICS Building</strong><small>Floors 1–4 · CAFAD excluded</small>
      </div>
      </div>
      <div class="user-card">
      <div class="avatar">${esc(initials(state.user.name))}
      </div>
      <div class="user-info"><strong title="${esc(state.user.name)}">${esc(state.user.name)}</strong><small>${state.user.role === 'admin' ? 'Administrator' : 'Class representative'}</small>
      </div><button class="logout" data-action="logout" title="Sign out" aria-label="Sign out">${icon('logout')}</button>
      </div>
      </div>
      </aside>
      <main class="main">
      <header class="topbar"><span class="mobile-brand">SafeTap</span>
      <div class="breadcrumb">CICS <span>/</span> <strong>${esc(current?.[2] || 'Overview')}</strong>
      </div>
      <div class="top-right">${state.config.demo ? '<span class="demo-label">Demo</span>' : ''}${themeButton()}<span class="connection ${state.online ? '' : 'offline'}" role="status">${state.online ? 'Connected' : 'Offline'}</span>
      </div>
      </header>
      <div class="content">
      <div id="connection-note">${connectionNotice()}</div>
      <div id="page" data-page="${esc(state.page)}" tabindex="-1">${{
      dashboard, attendance, scanner, students, team, history, offline
    }[state.page]()}
      </div>
      <footer class="footer-note"><span>Updated ${fmt(state.data.serverTime)}</span><span>Campus photo: <a href="https://commons.wikimedia.org/wiki/File:College_of_Engineering,_Architecture,_Fine_Arts_and_Computing_Sciences_Building.JPG">Kampfgruppe</a> · <a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a> · resized and tinted</span>
      </footer>
      </div>
      </main>
      <nav class="mobile-nav" aria-label="Phone navigation">${APP_NAV.slice(0, 3).map(([id, symbol, name]) => `<button data-action="navigate" data-page="${id}" ${state.page === id ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${name}</span></button>`).join('')}<button data-action="more" ${!['dashboard', 'attendance', 'scanner'].includes(state.page) ? 'aria-current="page"' : ''}>${icon('more')}<span>More</span></button>
      </nav>
      </div>`;
  }
  function eventStrip() {
    const active = state.data.active;
    if (!active) return `<div class="event-strip"><div class="event-context"><span class="event-eyebrow">Evacuation status</span><strong>No active evacuation</strong><p>Counts will appear when an event starts.</p></div>${state.user.role === 'admin' ? btn('Start evacuation', 'start-event', 'primary', state.online ? '' : 'disabled') : ''}</div>`;
    return `<div class="event-strip">
      <div class="event-context"><span class="event-eyebrow">Evacuation status</span><strong>${esc(active.event.name)}</strong><p>${esc(active.event.area)} · Started ${fmt(active.event.startedAt)}</p></div>
      <div class="actions">${badge(active.event.type === 'drill' ? 'DRILL ACTIVE' : 'EVACUATION ACTIVE', active.event.type === 'drill' ? 'blue' : 'red')}${btn('Scan IDs', 'navigate', 'primary', 'data-page="scanner"')}${state.user.role === 'admin' ? btn('End event', 'close-event', 'danger small', `data-id="${active.event.id}"`) : ''}</div>
    </div>`;
  }
  function metrics(event) {
    const items = [
      ['Still missing', event?.unaccounted ?? '—', event?.unaccounted > 0 ? (event.event?.type === 'emergency' ? 'urgent' : 'pending') : ''],
      ['Arrived safely', event?.safe ?? '—', event?.safe > 0 ? 'safe' : ''],
      ['Expected', event?.total ?? '—', ''],
      ['Other arrivals', event?.additional ?? '—', '']
    ];
    return `<div class="metrics" aria-label="Evacuation totals">${items.map(([label, value, style]) => `<article class="metric ${style}"><div class="metric-top">${label}</div><strong>${value}</strong></article>`).join('')}</div>`;
  }
  function filteredPeople(people) {
    return people.filter(p => (!state.filterBlock || p.blockId === state.filterBlock) && (!state.filterProgram || p.program === state.filterProgram) && (!state.filterStatus || (state.filterStatus === 'safe' ? p.safe : p.expected && !p.safe)) && (!state.search || `${p.name} ${p.studentNumber}`.toLowerCase().includes(state.search.toLowerCase())));
  }
  function dashboard() {
    const active = state.data.active;
    const coverage = active?.event.coverage || state.data.blocks.map(block => ({
      blockId: block.id,
      blockLabel: blockName(block.id),
      session: state.data.classes.find(session => session.blockId === block.id && session.status === 'open')
    }));
    const checkins = (active?.checkins || []).filter(checkin => checkin.status === 'confirmed')
      .sort((first, second) => second.receivedAt.localeCompare(first.receivedAt)).slice(0, 6);
    const lastEvent = state.data.history.find(item => item.event.status !== 'active');
    const openSessions = state.data.classes.filter(item => item.status === 'open').length;
    const readiness = `<div class="idle-readiness" aria-label="Attendance readiness"><div><strong>${state.data.students.filter(student => student.active).length}</strong><span>Active students</span></div><div><strong>${openSessions}</strong><span>${state.user.role === 'rep' ? 'My open sessions today' : 'Open sessions today'}</span></div><div><strong>${lastEvent ? esc(lastEvent.event.name) : 'None yet'}</strong><span>${lastEvent ? `Last event · ${fmt(lastEvent.event.startedAt)}` : 'Last event'}</span></div></div>`;
    const deviceStatus = state.user.role === 'rep' ? `<section class="device-summary"><div><strong>Student list on this phone</strong><small id="directory-updated">${state.pack?.userId === state.user.id ? `Downloaded ${fmt(state.pack.preparedAt)}` : 'Student list not downloaded'}</small><span id="offline-status">${offlineSummary()}</span></div>${btn('Offline records', 'navigate', 'small', 'data-page="offline"')}</section>` : '';
    return heading('', 'Evacuation overview', '', btn('Refresh', 'refresh')) + `<section class="overview-board" aria-label="Evacuation status">` + eventStrip() + (active ? metrics(active) : readiness) + (active?.total === 0 ? '<p class="overview-note">No students are on the expected list for this event. Additional arrivals are counted separately.</p>' : '') + (active?.total > 0 ? `<div class="expected-progress"><span>${active.safe} of ${active.total} expected students arrived</span><progress value="${active.safe}" max="${active.total}" aria-label="Expected students who arrived"></progress></div>` : '') + `<p class="overview-updated">Last server update: <strong>${fmt(state.data.serverTime)}</strong>${state.online ? '' : ' · Offline data'}</p>` + (active?.unaccounted > 0 ? `<div class="missing-shortcut">${btn('Find missing students', 'show-missing', 'small')}</div>` : '') + `</section>` + deviceStatus + `
      <div class="dashboard-grid ${active ? '' : 'no-event'}">
        <details class="card disclosure-card coverage-card" data-disclosure="coverage" ${state.panels?.coverage ? 'open' : ''}><summary><span class="section-title">${icon('attendance')}Block progress ${badge(`${coverage.length} blocks`)}</span><span class="disclosure-chevron">${icon('chevron')}</span></summary>
          <div class="card-body">${coverage.length ? coverage.map(block => {
            const expected = active?.people.filter(person => person.blockId === block.blockId && person.expected) || [];
            const arrived = expected.filter(person => person.safe).length;
            return `<div class="block-row"><div class="row-between"><strong>${esc(block.blockLabel)}</strong>${!block.session ? badge('No attendance', 'amber') : badge(active ? `${arrived} / ${expected.length}` : 'Attendance ready', active && arrived === expected.length && expected.length ? 'green' : 'blue')}</div>
              <progress value="${arrived}" max="${expected.length || 1}" aria-label="${esc(block.blockLabel)} progress"></progress>
              ${block.session ? `<div class="row-between"><small>${esc(roomName(block.session.roomId))}</small><small>${fmt(block.session.updatedAt)}</small></div>` : ''}</div>`;
          }).join('') : empty('No blocks yet', '')}</div>
        </details>
        ${active ? `<section class="card"><div class="card-header"><h2 class="section-title">${icon('clock')}Recent arrivals</h2>${badge('Confirmed', 'green')}</div>
          <div class="card-body">${checkins.length ? checkins.map(checkin => {
            const person = active.people.find(person => person.studentId === checkin.studentId);
            return `<div class="list-row"><div class="mini-avatar">${esc(initials(person?.name || '?'))}</div><div><strong>${esc(person?.name)}</strong><small>${esc(person?.blockLabel)} · ${esc(checkin.method.toUpperCase())}</small><small>${fmt(checkin.receivedAt)}</small></div></div>`;
          }).join('') : empty('No arrivals yet', '')}</div>
        </section>` : ''}
      </div>
      <details class="card disclosure-card" data-disclosure="building" ${state.panels?.building ? 'open' : ''}>
        <summary><span class="section-title">${icon('building')}Building overview</span><span class="disclosure-chevron">${icon('chevron')}</span></summary>
        <div class="floor-tabs" role="group" aria-label="Select floor">${[1, 2, 3, 4, 5].map(floor => `<button data-action="floor" data-floor="${floor}" class="${state.floor === floor ? 'active' : ''}" aria-pressed="${state.floor === floor}">Floor ${floor}${floor === 5 ? ' · CAFAD' : ''}</button>`).join('')}</div>
        <div class="card-body">${floorMap()}<div class="legend">${active ? '<span><i class="dot green"></i>Arrived</span><span><i class="dot amber"></i>Missing</span>' : '<span><i class="dot blue"></i>Present</span>'}<span><i class="dot"></i>No attendance / excluded</span></div>
          <p class="map-note">Last recorded rooms, not current locations. Room clearance is not tracked.</p>
          ${btn('Original floor plan', 'reference', 'small')}${roomDetail()}</div>
      </details>
      ${active ? `<section class="card" id="student-list"><div class="card-header"><h2 class="section-title">${icon('students')}Students</h2>${badge(`${active.people.length} records`)}</div>
        ${peopleFilters()}<div class="table-wrap">${peopleTable(filteredPeople(active.people))}</div>
      </section>` : ''}`;
  }
  function roomPeople(roomId) {
    if (state.data.active) return state.data.active.people.filter(p => p.roomId === roomId && p.expected);
    const classes = state.data.classes.filter(c => c.roomId === roomId && c.status === 'open'),
      ids = new Set(state.data.attendance.filter(a => a.present && classes.some(c => c.id === a.classId)).map(a => a.studentId));
    return state.data.students.filter(s => s.active && ids.has(s.id)).map(s => ({
      ...s, studentId: s.id, roomId, roomName: roomName(roomId), blockLabel: blockName(s.blockId), present: true
    }));
  }
  function floorMap() {
    const rooms = state.data.rooms.filter(r => r.floor === state.floor).sort((a, b) => a.position - b.position),
      width = rooms.length * 112 + 28;
    return `
      <div class="map-title"><strong>F${state.floor} / ${state.floor === 5 ? 'CAFAD' : 'CICS'}</strong><small>${state.floor === 5 ? 'Not included in SafeTap' : 'Room guide · not to scale'}</small>
      </div>
      <div class="schematic"><svg class="room-svg" viewBox="0 0 ${width} 180" role="group" aria-label="Floor ${state.floor} rooms"><rect class="corridor" x="8" y="116" width="${width - 16}" height="34" rx="4"/><text class="corridor-label" x="${width / 2}" y="138" text-anchor="middle">CORRIDOR</text>${rooms.map((r, i) => {
      const people = roomPeople(r.id),
        safe = people.filter(p => p.safe).length,
        cls = !r.monitored ? 'gray' : people.length ? !state.data.active ? 'blue' : safe === people.length ? 'green' : 'amber' : '';
      return `<g class="room-group ${cls} ${state.room === r.id ? 'selected' : ''}" data-action="room" data-id="${r.id}" tabindex="0" role="button" aria-label="${esc(r.name)}: ${r.monitored ? people.length ? state.data.active ? `${safe} of ${people.length} accounted` : `${people.length} present in class` : 'no attendance recorded' : 'CAFAD not included in SafeTap'}"><rect class="room-shape" x="${i * 112 + 14}" y="15" width="100" height="92" rx="5"/><text class="room-name" x="${i * 112 + 64}" y="51" text-anchor="middle">${esc(r.name.split(' · ').at(-1).slice(0, 13))}</text><text class="room-count" x="${i * 112 + 64}" y="77" text-anchor="middle">${!r.monitored ? 'CAFAD' : people.length ? state.data.active ? `${safe} / ${people.length} safe` : `${people.length} present` : 'No attendance'}</text></g>`;
    }).join('')}</svg><div class="room-tiles">${rooms.map(r => {
      const people = roomPeople(r.id);
      const safe = people.filter(p => p.safe).length;
      const status = !r.monitored ? 'CAFAD not included' : !people.length ? 'No attendance' : state.data.active ? `${safe} / ${people.length} accounted` : `${people.length} present in class`;
      return `<button type="button" class="room-tile ${state.room === r.id ? 'selected' : ''}" data-action="room" data-id="${esc(r.id)}" aria-pressed="${state.room === r.id}"><strong>${esc(r.name)}</strong><span>${esc(status)}</span></button>`;
    }).join('')}</div>
      </div>`;
  }
  function roomDetail() {
    if (!state.room) return '';
    const r = state.data.rooms.find(r => r.id === state.room),
      people = roomPeople(state.room);
    return `
      <div class="room-detail">
      <h3>Room ${esc(r.name)} ${badge('Floor ' + r.floor)}
      </h3>${!r.monitored ? '<p class="muted">Floor 5 is CAFAD and is not included in SafeTap. Its rooms are not counted or marked clear.</p>' : peopleTable(people)}
      </div>`;
  }
  function peopleFilters() {
    return `
      <div class="filter-row"><input id="people-search" aria-label="Search students" placeholder="Search name or student number" value="${esc(state.search)}"><select id="filter-program" aria-label="Filter program"><option value="">All programs</option><option ${state.filterProgram === 'IT' ? 'selected' : ''}>IT</option><option ${state.filterProgram === 'CS' ? 'selected' : ''}>CS</option></select><select id="filter-block" aria-label="Filter block"><option value="">All blocks</option>${blockOptions(state.filterBlock)}</select><select id="filter-status" aria-label="Filter status"><option value="">All statuses</option><option value="safe" ${state.filterStatus === 'safe' ? 'selected' : ''}>Arrived safely</option><option value="pending" ${state.filterStatus === 'pending' ? 'selected' : ''}>Still missing</option></select>
      </div>`;
  }
  function peopleTable(people) {
    return people.length ? `
      <table class="people-table">
      <thead>
      <tr><th>Student</th><th>Block / room</th><th>Status</th>
      </tr>
      </thead>
      <tbody>${people.map(p => `
      <tr><td><strong>${esc(p.name)}</strong><small>${esc(p.studentNumber)}</small></td><td>${esc(p.blockLabel)}<small>${esc(p.roomName || 'No recorded room')}${p.present || p.expected ? '' : ' · Not on the expected list'}</small></td><td>${p.present ? badge('Present in class', 'blue') : badge(p.safe ? 'Arrived safely' : 'Still missing', p.safe ? 'green' : 'amber')}</td>
      </tr>`).join('')}
      </tbody>
      </table>` : empty('No matching students', state.data.active ? '' : 'Record class attendance to begin.');
  }
  function attendance() {
    return heading('', 'Class attendance', '', btn('+ Open class session', 'open-class', 'primary', state.online ? '' : 'disabled')) + (state.data.active ? '<div class="notice">Attendance locked during evacuation.</div>' : '') + (!state.data.classes.length ? `
      <section class="card">${empty('No class sessions today', 'Open a session to record attendance.')}
      </section>` : state.data.classes.map(c => {
      const roster = state.data.students.filter(s => s.blockId === c.blockId && s.active),
        present = state.data.attendance.filter(a => a.classId === c.id && a.present).length;
      return `
      <section class="card">
      <div class="card-header">
      <div>
      <h2>${esc(blockName(c.blockId))} · Room ${esc(roomName(c.roomId))}
      </h2>
      <p>${present} present / ${roster.length} registered · Updated ${fmt(c.updatedAt)}
      </p>
      </div>
      <div class="actions">${badge(c.status, c.status === 'open' ? 'green' : '')}${c.status === 'open' ? btn('Move room', 'move-class', 'small', `data-id="${c.id}"`) + btn('End class', 'end-class', 'small', `data-id="${c.id}"`) : ''}
      </div>
      </div>
      <div class="table-wrap">
      <table>
      <thead>
      <tr><th>Student</th><th>Student number</th><th>Currently present</th>
      </tr>
      </thead>
      <tbody>${roster.map(s => `
      <tr><td>${esc(s.name)}</td><td>${esc(s.studentNumber)}</td><td>
      <label class="checkbox-row"><input type="checkbox" data-class="${c.id}" data-student="${s.id}" ${state.data.attendance.some(a => a.classId === c.id && a.studentId === s.id && a.present) ? 'checked' : ''} ${c.status !== 'open' || state.data.active || !state.online ? 'disabled' : ''} aria-label="${esc(s.name)} present">Present
      </label></td>
      </tr>`).join('')}
      </tbody>
      </table>
      </div>
      </section>`;
    }).join(''));
  }
  function scanner() {
    const event = currentEvent();
    const methods = [['nfc', 'nfc', 'NFC'], ['qr', 'qr', 'QR'], ['manual', 'search', 'Search']];
    const active = state.data?.active?.event.id === event?.id ? state.data.active : null;
    let reader;
    if (state.method === 'nfc') {
      const reading = state.nfcState === 'reading';
      reader = `<div class="scan-target"><div class="scan-icon">${icon('nfc')}</div><h2>Tap student ID</h2>
        <p id="reader-status" class="reader-status" role="status">${reading ? 'NFC reader on' : 'NFC reader off'}</p>
        <div class="actions scan-actions">${btn('Start NFC scan', 'nfc', 'primary', `${!event ? 'disabled' : ''} ${reading ? 'hidden' : ''}`)}${btn('Stop reader', 'stop-reader', 'primary', `id="stop-reader" ${state.nfcState === 'idle' ? 'hidden disabled' : ''}`)}</div></div>`;
    } else if (state.method === 'qr') {
      reader = `<div id="camera"></div><div class="scan-target"><div class="scan-icon">${icon('qr')}</div><h2>Scan student QR</h2>${btn('Open camera', 'qr', 'primary', !state.config.qrAvailable || !event ? 'disabled' : '')}</div>${!state.config.qrAvailable ? '<div class="notice">QR unavailable. Use NFC or search.</div>' : ''}`;
    } else {
      reader = `<label class="field">Find student<input id="scan-search" type="search" placeholder="Name or student number" autocomplete="off"></label><div id="candidates">${empty('Enter at least 2 characters', '')}</div>`;
    }
    return heading('', 'Scan IDs', '') + `<div class="scanner-layout">
      <section class="card scanner-card"><div class="card-header"><div><h2>${event ? esc(event.name) : 'No active event'}</h2>${event ? `<p>${esc(event.area)}</p>` : '<p>Connect to download an active event.</p>'}</div>${event ? badge(event.type === 'drill' ? 'DRILL' : 'EVACUATION', event.type === 'drill' ? 'blue' : 'red') + (state.online ? '' : badge('Offline', 'amber')) : badge('Not ready', 'amber')}</div>
        <div class="card-body"><div class="scanner-methods" role="group" aria-label="Scanning method">${methods.map(([id, symbol, label]) => btn(icon(symbol) + label, 'method', id === state.method ? 'active' : '', `data-method="${id}" aria-pressed="${id === state.method}"`)).join('')}</div>
          <div id="scan-result" role="status" aria-live="polite" aria-atomic="true"></div>${reader}</div>
      </section>
      <aside class="scanner-support">
        <details class="scan-readiness" data-disclosure="readiness" ${state.panels?.readiness ? 'open' : ''}><summary><span id="offline-status">${offlineSummary()}</span><span class="disclosure-chevron">${icon('chevron')}</span></summary><div id="offline-readiness" role="status">${offlineReadiness()}</div></details>
        ${active ? `<div class="scanner-summary"><span><strong>${active.safe}</strong> arrived</span><span><strong>${active.unaccounted}</strong> missing</span></div>` : ''}
        <section class="card queue-card"><div class="card-header"><h2>Pending uploads</h2><span id="queue-count">${badge(`${state.queue.length} pending`, state.queue.length ? 'amber' : '')}</span></div>
          <div class="card-body">${btn('Upload records', 'sync', 'full-button', navigator.onLine && state.queue.length ? '' : 'disabled')}
            <details class="queue-details" data-disclosure="records" ${state.panels?.records || state.queue.some(record => record.error) ? 'open' : ''}><summary>Saved records<span class="disclosure-chevron">${icon('chevron')}</span></summary><div id="device-queue">${queueList()}</div></details>
          </div>
        </section>
      </aside>
    </div>`;
  }
  function students() {
    return heading('', 'Students & blocks', '', btn('Import CSV', 'import') + btn('+ Add block', 'add-block') + btn('+ Add student', 'add-student', 'primary')) + `
      <section class="card">
      <div class="card-header">
      <h2 class="section-title">${icon('students')}Student directory
      </h2>${badge(state.data.students.length + ' registered')}
      </div>
      <div class="filter-row"><input id="directory-search" placeholder="Search name or student number" aria-label="Search directory"><select id="directory-block" aria-label="Filter directory by block"><option value="">All blocks</option>${blockOptions(state.directoryBlock)}</select>
      </div>
      <div class="table-wrap">
      <table>
      <thead>
      <tr><th>Student</th><th>Program / block</th><th>Status</th><th>Actions</th>
      </tr>
      </thead>
      <tbody id="directory-body">${directoryRows('')}
      </tbody>
      </table>
      </div>
      </section>
      <section class="card">
      <div class="card-header">
      <h2 class="section-title">${icon('building')}Academic blocks
      </h2>
      </div>
      <div class="table-wrap">
      <table>
      <thead>
      <tr><th>Program / code</th><th>Academic term</th><th>Students</th>
      </tr>
      </thead>
      <tbody>${state.data.blocks.map(b => `
      <tr><td>${esc(b.program + ' ' + b.code)}</td><td>${esc(b.term)}</td><td>${state.data.students.filter(s => s.blockId === b.id && s.active).length}</td>
      </tr>`).join('')}
      </tbody>
      </table>
      </div>
      </section>`;
  }
  function directoryRows(query) {
    return state.data.students.filter(s => (!state.directoryBlock || s.blockId === state.directoryBlock) && `${s.name} ${s.studentNumber}`.toLowerCase().includes(query.toLowerCase())).map(s => `
      <tr><td><strong>${esc(s.name)}</strong><small>${esc(s.studentNumber)}</small></td><td>${esc(blockName(s.blockId))}</td><td>${s.active ? 'Active' : badge('Inactive', 'amber')}</td><td>
      <div class="actions">${btn('Edit', 'edit-student', 'small quiet', `data-id="${s.id}"`)}${btn('QR card', 'student-qr', 'small quiet', `data-id="${s.id}"`)}
      </div></td>
      </tr>`).join('');
  }
  function team() {
    return heading('', 'Representatives', '', btn('+ Add representative', 'add-rep', 'primary')) + `
      <section class="card">
      <div class="table-wrap">
      <table>
      <thead>
      <tr><th>Representative</th><th>Assigned blocks</th><th>Status</th><th></th>
      </tr>
      </thead>
      <tbody>${state.data.reps.map(u => `
      <tr><td><strong>${esc(u.name)}</strong><small>${esc(u.username)}</small></td><td>${esc(u.blockIds.map(blockName).join(', '))}</td><td>${badge(u.active ? 'Active' : 'Disabled', u.active ? 'green' : '')}</td><td>${btn('Edit access', 'edit-rep', 'small', `data-id="${u.id}"`)}</td>
      </tr>`).join('')}
      </tbody>
      </table>
      </div>
      </section>
      <div class="notice info">Class attendance is restricted to assigned blocks. During an evacuation, any active representative may account for students from any CICS block.
      </div>`;
  }
  function history() {
    if (state.report) return reportView();
    return heading('', 'History & reports', '') + `
      <section class="card">
      <div class="table-wrap">
      <table>
      <thead>
      <tr><th>Event</th><th>Expected</th><th>Safe</th><th>Unaccounted</th><th>Additional</th><th></th>
      </tr>
      </thead>
      <tbody>${state.data.history.map(h => `
      <tr><td><strong>${esc(h.event.name)}</strong><small>${fmt(h.event.startedAt)} · ${esc(h.event.status)}</small></td><td>${h.total}</td><td>${h.safe}</td><td>${h.unaccounted}</td><td>${h.additional}</td><td>${btn('View report', 'report', 'small', `data-id="${h.event.id}"`)}</td>
      </tr>`).join('')}
      </tbody>
      </table>${!state.data.history.length ? empty('No evacuation events yet', '') : ''}
      </div>
      </section>${state.user.role === 'admin' ? `
      <section class="card">
      <div class="card-header">
      <h2 class="section-title">${icon('history')}Change history
      </h2>${badge('ADMIN')}
      </div>
      <div class="table-wrap">
      <table>
      <thead>
      <tr><th>Time / actor</th><th>Action</th><th>Detail</th>
      </tr>
      </thead>
      <tbody>${state.data.audit.map(a => `
      <tr><td>${fmt(a.time)}<small>${esc(a.actor)}</small></td><td>${esc(a.action)}</td><td>${esc(a.detail)}</td>
      </tr>`).join('')}
      </tbody>
      </table>
      </div>
      </section>` : ''}`;
  }
  function reportView() {
    const r = state.report;
    return heading('Event report', esc(r.event.name), `${esc(r.event.area)} · ${fmt(r.event.startedAt)} · ${esc(r.event.status)}`, btn('All events', 'back-history') + btn('Print / PDF', 'print') + (state.user.role === 'admin' ? `<a class="btn" href="/api/events/${r.event.id}/export">${icon('download')}Export CSV</a>` + btn('Edit expected students', 'baseline') : '')) + `
      <h1 class="print-only">SafeTap · ${esc(r.event.name)}
      </h1>
      <p class="print-only">${esc(r.event.area)} · ${fmt(r.event.startedAt)}
      </p>` + metrics(r) + `
      <section class="card">
      <div class="card-header">
      <h2>Expected students and arrivals
      </h2>${badge('Saved at event time')}
      </div>
      <div class="table-wrap">${peopleTable(r.people)}
      </div>
      </section>${state.user.role === 'admin' ? `
      <section class="card">
      <div class="card-header">
      <h2>Review student arrivals
      </h2>
      </div>
      <div class="table-wrap">
      <table>
      <thead>
      <tr><th>Student</th><th>Captured / received</th><th>Operator / method</th><th>Status / action</th>
      </tr>
      </thead>
      <tbody>${r.checkins.map(c => `
      <tr><td>${esc(r.people.find(p => p.studentId === c.studentId)?.name || state.data.students.find(s => s.id === c.studentId)?.name || c.studentId)}</td><td>${fmt(c.capturedAt)}<small>Received ${fmt(c.receivedAt)}</small></td><td>${esc(c.actor)}<small>${esc(c.method)}</small></td><td>${badge(c.status, c.status === 'review' ? 'amber' : c.status === 'confirmed' ? 'green' : '')} ${c.status === 'review' ? btn('Approve', 'review', 'small', `data-id="${c.id}" data-choice="approve"`) : ''} ${c.status !== 'void' ? btn('Void', 'review', 'small', `data-id="${c.id}" data-choice="void"`) : ''}<small>${esc(c.reason || '')}</small></td>
      </tr>`).join('')}
      </tbody>
      </table>
      </div>
      </section>` : ''}`;
  }
  function queueList() {
    return state.queue.length ? state.queue.map(q => `
      <div class="pending-item">
      <div class="row-between"><strong>${esc(q.name)}</strong>${badge(q.error ? 'Needs attention' : 'Pending', 'amber')}
      </div>
      <p>${esc(q.method.toUpperCase())} · ${fmt(q.capturedAt)}${q.error ? '<br>' + esc(q.error) : ''}
      </p>${q.error ? btn('Retry', 'retry-item', 'small', `data-id="${q.submissionId}"`) : ''}${btn('Remove', 'discard-item', 'small', `data-id="${q.submissionId}"`)}
      </div>`).join('') : empty('No pending records', '');
  }
  function offline() {
    const pack = state.pack?.userId === state.user?.id ? state.pack : null;
    const lateRecords = state.queue.some(record => record.eventId !== state.data.active?.event.id);
    return heading('', 'Offline records', '', btn('Update download', 'prepare', 'primary', state.online ? '' : 'disabled')) + `<div class="split">
      <section class="card"><div class="card-header"><h2>Device readiness</h2>${badge(pack ? 'Downloaded' : 'Not downloaded', pack ? 'green' : 'amber')}</div>
        <div class="card-body"><div id="offline-readiness" role="status">${offlineReadiness()}</div>
          ${pack ? `<p class="download-time">Downloaded ${fmt(pack.preparedAt)}</p>` : ''}
          <dl class="offline-facts"><div><dt>QR camera</dt><dd>${state.config.qrAvailable ? 'Available' : 'Unavailable'}</dd></div></dl>
        </div>
      </section>
      <section class="card"><div class="card-header"><h2>Pending uploads</h2><span id="queue-count">${badge(`${state.queue.length} pending`, state.queue.length ? 'amber' : '')}</span></div>
        <div class="card-body">${btn('Upload records', 'sync', 'full-button', navigator.onLine && state.queue.length ? '' : 'disabled')}<div id="device-queue">${queueList()}</div>${lateRecords ? '<p class="muted">Closed-event uploads need administrator approval.</p>' : ''}</div>
      </section>
    </div>`;
  }
  return {login, render, eventStrip, metrics, filteredPeople, dashboard, roomPeople, floorMap, roomDetail, peopleFilters, peopleTable, attendance, scanner, students, directoryRows, team, history, reportView, queueList, offline};
}};

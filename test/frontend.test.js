'use strict';

const {
  test
} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {
  randomUUID
} = require('node:crypto');
const D = require('../src/domain');
const {fakeIndexedDB} = require('./helpers/indexeddb');
const {offlinePack} = require('../src/offline-directory');
function environment() {
  const f = {
    db: D.baseDb({
      demo: true,
      password: 'SafeTapDemo123!'
    })
  };
  f.syncBatches = [];
  f.requests = [];
  f.user = f.db.users[0];
  f.config = {demo: true, qrAvailable: false};
  const c = D.openClass(f.db, f.user, {
    blockId: f.db.blocks[0].id,
    roomId: 'F3-3'
  });
  D.updateClass(f.db, f.user, c.id, {
    studentId: f.db.students[0].id,
    present: true
  });
  f.event = D.startEvent(f.db, f.user, {
    name: 'Client drill',
    type: 'drill',
    area: 'Assembly A'
  });
  const nodes = new Map();
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, {
      innerHTML: '',
      textContent: '',
      open: false,
      classList: {
        add() {},
        remove() {},
        toggle() {}
      },
      showModal() {
        this.open = true;
      },
      close() {
        this.open = false;
      }
    });
    return nodes.get(selector);
  };
  const idb = fakeIndexedDB();
  let network = false,
    failState = false;
  const context = vm.createContext({
    console,
    structuredClone,
    URL,
    AbortSignal,
    AbortController,
    crypto: {
      randomUUID
    },
    setTimeout: (fn, ms) => {
      if (ms < 1000) return setTimeout(fn, ms);
      return 0;
    },
    clearTimeout,
    setInterval: () => 0,
    queueMicrotask,
    FormData,
    Blob,
    document: {
      querySelector: node,
      addEventListener() {},
      createElement: () => ({dataset: {}, remove() {}}),
      head: {
        append(script) { queueMicrotask(() => script.onload?.()); }
      },
      activeElement: null
    },
    window: {
      addEventListener() {},
      isSecureContext: true
    },
    navigator: {
      onLine: true
    },
    indexedDB: idb,
    fetch: async (url, options = {}) => {
      f.requests.push(url);
      if (!network) throw new Error('Network lost');
      let data;
      if (url.endsWith('/config')) data = f.config;else if ((url.endsWith('/me') || url.endsWith('/session'))) data = {
        user: D.publicUser(f.user),
        csrf: 'test'
      };else if (url.split('?')[0].endsWith('/state')) {
        if (failState) throw new Error('Dashboard connection lost');
        data = D.snapshot(f.db, f.user);
        if (new URL(url, 'http://localhost').searchParams.get('directoryVersion') === data.directoryVersion) {
          delete data.students;
          delete data.blocks;
        }
      } else if (url.split('?')[0].endsWith('/offline')) data = offlinePack(f.db, f.user, new URL(url, 'http://localhost').searchParams.get('version'));else if (url.endsWith('/checkins')) data = D.checkin(f.db, f.user, JSON.parse(options.body));else if (url.endsWith('/sync')) {
        f.syncBatches.push(JSON.parse(options.body).scans.length);
        assert.equal(options.headers['X-CSRF-Token'], 'test', 'uploads require the current authenticated session token');
        data = {
        results: JSON.parse(options.body).scans.map(s => ({
          submissionId: s.submissionId,
          ...D.checkin(f.db, f.user, s)
        }))
        };
      } else throw new Error('Unexpected ' + url);
      return {
        ok: true,
        status: 200,
        json: async () => data
      };
    }
  });
  for (const name of ['js/device-store.js', 'js/assets.js', 'js/student-directory.js', 'js/scanners.js', 'js/offline-controller.js', 'js/views.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public', name), 'utf8'), context);
  }
  return {
    ...f,
    context,
    node,
    idb,
    setNetwork: value => network = value,
    setFailState: value => failState = value,
    run: code => vm.runInContext(code, context)
  };
}
async function ready() {
  const e = environment();
  await new Promise(r => setImmediate(r));
  const state = D.snapshot(e.db, e.user);
  e.context.testState = state;
  e.context.testPack = {
    userId: e.user.id,
    event: e.event,
    students: e.db.students,
    blocks: e.db.blocks,
    preparedAt: D.now()
  };
  e.run('state.user=testState.user;state.data=testState;state.pack=testPack;state.config={demo:true};state.online=false;');
  return e;
}
test('all client pages render, escape student HTML, and preserve CAFAD scope', async () => {
  const e = await ready();
  e.run('state.data.students[0].name="<img src=x onerror=alert(1)>"');
  for (const page of ['dashboard', 'attendance', 'scanner', 'students', 'team', 'history', 'offline']) {
    e.run(`state.page='${page}';render()`);
    assert(e.node('#app').innerHTML.includes('SafeTap'));
    assert(!e.node('#app').innerHTML.includes('<img src=x'));
  }
  e.run('state.page="dashboard";state.floor=5;render()');
  assert(e.node('#app').innerHTML.includes('Not included in SafeTap'));
  assert(e.node('#app').innerHTML.includes('CAFAD'));
});
test('floor plan shows open class attendance before an event and preserves the event snapshot', async () => {
  const e = await ready();
  e.context.savedEvent = structuredClone(e.context.testState.active);
  e.run('state.floor=3;state.room="F3-3";state.data.active=null');
  assert.match(e.run('floorMap()'), /1 present/);
  assert.match(e.run('roomDetail()'), /Present in class/);
  assert.doesNotMatch(e.run('roomDetail()'), /Still missing|Not on the expected list/);
  e.run('state.data.attendance.push({...state.data.attendance[0]})');
  assert.equal(e.run('roomPeople("F3-3").length'), 1, 'attendance is deduplicated');
  e.run('state.data.classes[0].status="closed"');
  assert.equal(e.run('roomPeople("F3-3").length'), 0);
  e.run('state.data.active=savedEvent');
  assert.match(e.run('floorMap()'), /0 \/ 1 safe/);
  assert.match(e.run('roomDetail()'), /Still missing/);
});
test('attendance automatically selects a single assigned block and restricts multiple-block choices', async () => {
  const e = await ready();
  e.context.assignedId = e.db.blocks[0].id;
  e.run('state.user={...state.user,role:"rep",blockIds:[assignedId]}');
  await e.run('action({dataset:{action:"open-class"}})');
  let html = e.node('#modal').innerHTML;
  assert.match(html, /type="hidden" name="blockId"/);
  assert(html.includes(`value="${e.db.blocks[0].id}"`));
  assert.doesNotMatch(html, /<select name="blockId"/);
  assert.match(html, /<select name="roomId"/);
  e.run('state.user.blockIds=state.data.blocks.map(b=>b.id)');
  await e.run('action({dataset:{action:"open-class"}})');
  assert.match(e.node('#modal').innerHTML, /<select name="blockId"/);
  e.run('state.user.role="admin";state.user.blockIds=[]');
  await e.run('action({dataset:{action:"open-class"}})');
  assert.match(e.node('#modal').innerHTML, /<select name="blockId"/);
  e.run('state.user.role="rep";state.user.blockIds=[]');
  await e.run('action({dataset:{action:"open-class"}})');
  assert.match(e.node('#toast').textContent, /No blocks are assigned/);
});
test('offline record persists, then sync removes it and counts once', async () => {
  const e = await ready();
  e.context.studentId = e.db.students[0].id;
  await e.run('record({method:"manual",studentId,confirmed:true})');
  assert.equal(e.idb.rows.get('queue').length, 1);
  assert(e.node('#scan-result').innerHTML.includes('waiting to upload'));
  assert.equal(D.eventSummary(e.db, e.event.id).safe, 0);
  e.setNetwork(true);
  e.run('state.online=true');
  await e.run('syncQueue()');
  assert.equal(e.idb.rows.get('queue').length, 0);
  assert.equal(D.eventSummary(e.db, e.event.id).safe, 1);
});
test('committed scan stays confirmed when the dashboard refresh subsequently fails', async () => {
  const e = await ready();
  e.setNetwork(true);
  e.setFailState(true);
  e.context.studentId = e.db.students[0].id;
  e.run('state.online=true');
  await e.run('record({method:"manual",studentId,confirmed:true})');
  await e.run('syncQueue()');
  assert(e.node('#scan-result').innerHTML.includes('saved to server'));
  assert.equal(e.idb.rows.get('queue').length, 0);
  assert.equal(D.eventSummary(e.db, e.event.id).safe, 1);
});
test('unknown offline QR is not saved and shows a clear error', async () => {
  const e = await ready();
  await e.run('record({method:"qr",credential:"unregistered"})');
  assert.equal(e.run('state.queue.length'), 0);
  assert(e.node('#scan-result').innerHTML.includes('not found'));
});
test('CSV handles quoted names and refuses inconsistent rows', async () => {
  const e = await ready();
  const result = e.run('parseCsv(\'studentNumber,name,blockId,nfcUid\\nID-1,"Surname, Given",,\\n\')');
  assert.equal(result[0].name, 'Surname, Given');
  assert.throws(() => e.run('parseCsv("studentNumber,name\\nX,Y,Z")'), /wrong number/);
});

test('scanner stops showing an old event when the server switches events', async () => {
  const e = await ready();
  e.run('state.page="scanner";render()');
  e.db.events[0].status = 'closed';
  D.startEvent(e.db, e.user, {name: 'Replacement event', type: 'drill', area: 'Assembly B'});
  e.setNetwork(true);
  await e.run('refresh(false)');
  assert(e.node('#app').innerHTML.includes('Replacement event'));
  assert(e.node('#toast').textContent.includes('event changed'));
});

test('scanner displays NFC on desktop and mobile, with a start button and unsupported-device feedback', async () => {
  const e = await ready();
  e.run('state.page="scanner";render()');
  assert(e.node('#app').innerHTML.includes('data-method="nfc"'));
  await e.run('action({dataset:{action:"method",method:"nfc"}})');
  assert(e.node('#app').innerHTML.includes('Start NFC scan'));
  await e.run('action({dataset:{action:"nfc"}})');
  assert(e.node('#scan-result').innerHTML.includes('NFC scanning is not available'));
});

test('offline NFC identifies the student, persists the scan, and uploads once', async () => {
  const e = await ready();
  e.db.students[0].nfcUid = '04AABBCC';
  e.run('state.pack.students[0].nfcUid="04AABBCC";state.page="scanner"');
  await e.run('record({method:"nfc",credential:"04:AA:BB:CC"})');
  assert.equal(e.idb.rows.get('queue').length, 1);
  assert.equal(e.idb.rows.get('queue')[0].name, e.db.students[0].name);
  e.setNetwork(true);
  e.run('state.online=true');
  await e.run('syncQueue()');
  assert.equal(e.idb.rows.get('queue').length, 0);
  assert.equal(D.eventSummary(e.db, e.event.id).safe, 1);
  await e.run('record({method:"nfc",credential:"04AABBCC"})');
  assert.equal(D.eventSummary(e.db, e.event.id).safe, 1);
  assert(e.node('#scan-result').innerHTML.includes('Already recorded'));
});

test('NFC reader stops on method changes and ignores scans after leaving the page', async () => {
  const e = await ready();
  let reader;
  class FakeReader {
    constructor() { reader = this; }
    async scan(options) { this.signal = options.signal; }
  }
  e.context.NDEFReader = FakeReader;
  e.context.window.NDEFReader = FakeReader;
  e.run('state.page="scanner";state.pack.students[0].nfcUid="04AABBCC";render()');
  await e.run('startNfc()');
  assert.equal(e.run('state.nfcState'), 'reading');
  assert.equal(e.node('[data-action="nfc"]').hidden, true);
  assert.equal(e.node('#stop-reader').hidden, false);
  assert.equal(e.node('#reader-status').textContent, 'NFC reader on');
  await e.run('action({dataset:{action:"stop-reader"}})');
  assert.equal(reader.signal.aborted, true);
  assert.equal(e.node('[data-action="nfc"]').hidden, false);
  assert.equal(e.node('#stop-reader').hidden, true);
  await e.run('startNfc()');
  await e.run('action({dataset:{action:"method",method:"manual"}})');
  assert.equal(reader.signal.aborted, true);
  reader.onreading({serialNumber:'04:AA:BB:CC'});
  assert.equal(e.run('state.queue.length'), 0);
});

test('phone More navigation preserves admin and representative access and uses plain labels', async () => {
  const e = await ready();
  for (const page of ['dashboard','attendance','scanner','offline','students','team','history']) {
    e.run(`state.page='${page}';render()`);
    const html = e.node('#app').innerHTML;
    assert(html.includes('aria-label="Phone navigation"'));
    const visibleText = html.replace(/<[^>]*>/g, ' ');
    assert(!/baseline|roster|stale data|credential/i.test(visibleText), `${page}: ${visibleText.match(/.{0,40}(baseline|roster|stale data|credential).{0,60}/i)?.[0]}`);
  }
  await e.run('action({dataset:{action:"more"}})');
  assert(e.node('#modal').innerHTML.includes('Students & blocks'));
  e.run('state.user.role="rep"');
  await e.run('action({dataset:{action:"more"}})');
  assert(!e.node('#modal').innerHTML.includes('Students & blocks'));
  assert(!e.node('#modal').innerHTML.includes('Representatives'));
  assert(e.node('#modal').innerHTML.includes('Reports'));
});

test('offline reload recovers the session before uploading and refuses another account', async () => {
  const e = await ready();
  const studentId = e.db.students[0].id;
  await e.run(`record({method:'manual',studentId:'${studentId}',confirmed:true})`);
  e.run('state.csrf=""');
  e.setNetwork(true);
  await e.run('syncQueue()');
  assert.equal(e.run('state.queue.length'), 0);
  assert.equal(e.run('state.csrf'), 'test');

  const other = await ready();
  await other.run(`record({method:'manual',studentId:'${other.db.students[0].id}',confirmed:true})`);
  other.user.id = other.db.users[1].id;
  other.setNetwork(true);
  await assert.rejects(other.run('syncQueue()'), /account that saved/);
  assert.equal(other.run('state.queue.length'), 1);
  assert.equal(other.db.checkins.length, 0);
});

test('online refresh automatically saves NFC and QR IDs; offline reload retains scans', async () => {
  const e = await ready();
  e.db.students[0].nfcUid = '04AABBCC';
  e.setNetwork(true);
  e.run('state.pack=null;state.csrf="test"');
  await e.run('refresh(false)');
  assert.equal(e.idb.rows.get('pack').event.id, e.event.id);
  assert.equal(e.idb.rows.get('pack').students[0].nfcUid, '04AABBCC');
  assert.equal(e.idb.rows.get('pack').students[0].qrToken, e.db.students[0].qrToken);
  e.setNetwork(false);
  e.run('state.online=false');
  await e.run('record({method:"nfc",credential:"04:AA:BB:CC"})');
  assert.equal(e.idb.rows.get('queue').length, 1);
  await e.run('boot()');
  assert.equal(e.run('state.queue.length'), 1);
  assert.equal(e.run('state.pack.event.id'), e.event.id);
  e.setNetwork(true);
  await e.run('syncQueue()');
  assert.equal(e.run('state.queue.length'), 0);
  assert.equal(D.eventSummary(e.db, e.event.id).safe, 1);
});

test('automatic preparation caches scanner assets once without interrupting NFC', async () => {
  const e = await ready();
  const cached = new Set();
  e.context.navigator.serviceWorker = {register: async () => {}, ready: Promise.resolve({})};
  e.context.navigator.storage = {persist: async () => true};
  e.context.caches = {open: async () => ({match: async key => cached.has(key), add: async key => cached.add(key)})};
  e.context.fetch = async () => ({ok: true, json: async () => ['/vendor/html5-qrcode.min.js']});
  e.run('state.config={qrAvailable:true};state.nfcController=new AbortController();state.nfcState="reading"');
  await e.run('cacheOfflineAssets()');
  assert.deepEqual([...cached], ['/vendor/html5-qrcode.min.js']);
  assert.equal(e.run('state.offlineAssets'), true);
  assert.equal(e.run('state.nfcController.signal.aborted'), false);
  assert.match(e.run('offlineReadiness()'), /12 student IDs saved/);
});

test('sync refreshes stale session tokens, recovers legacy auth errors and drains all batches', async () => {
  const e = await ready();
  e.context.pendingScans = Array.from({length: 105}, (_, i) => ({
    submissionId: randomUUID(), eventId: e.event.id, ownerId: e.user.id,
    studentId: e.db.students[0].id, method: 'manual', confirmed: true, capturedAt: D.now(),
    error: i % 2 ? 'Session verification failed. Refresh and sign in again.' : 'Please refresh and sign in again. Your saved scans will stay on this phone.'
  }));
  e.run('state.queue=pendingScans;state.csrf="old-token";state.page="scanner";state.nfcController=new AbortController();state.nfcState="reading"');
  await e.run("localSet('queue', state.queue)");
  e.setNetwork(true);
  await e.run('syncQueue()');
  assert.deepEqual(e.syncBatches, [100, 5]);
  assert.equal(e.run('state.queue.length'), 0);
  assert.equal(e.run('state.csrf'), 'test');
  assert.equal(e.run('state.nfcController.signal.aborted'), false);
  assert.equal(D.eventSummary(e.db, e.event.id).safe, 1);
});

test('closing an event retains the student directory and pending records for review', async () => {
  const e = await ready();
  await e.run(`record({method:'manual',studentId:'${e.db.students[0].id}',confirmed:true})`);
  e.db.events[0].status = 'closed';
  e.setNetwork(true);
  await e.run('refresh(false)');
  assert.equal(e.run('state.pack.event'), null);
  assert.equal(e.run('state.pack.students.length'), e.db.students.length);
  assert.equal(e.idb.rows.get('queue').length, 1);
  assert.equal(e.idb.rows.get('queue')[0].eventId, e.event.id);
});

test('changing appearance leaves an active NFC reader and page intact', async () => {
  const e = await ready();
  let toggleCount = 0;
  e.context.window.SafeTapTheme = {current: 'light', toggle() {this.current = 'dark'; toggleCount++;}};
  e.run('state.page="scanner";state.method="nfc";state.nfcController=new AbortController();state.nfcState="reading";render()');
  await e.run('action({dataset:{action:"theme"}})');
  assert.equal(toggleCount, 1);
  assert.equal(e.run('state.nfcController.signal.aborted'), false);
  assert.equal(e.run('state.page'), 'scanner');
});

test('reconnect refresh replaces stale QR availability and enables the camera', async () => {
  const e = await ready();
  e.run('state.config.qrAvailable=false;state.page="scanner";state.method="qr";render()');
  assert(e.node('#app').innerHTML.includes('QR unavailable'));
  e.config.qrAvailable = true;
  e.setNetwork(true);
  await e.run('refresh(false)');
  assert(!e.node('#app').innerHTML.includes('QR unavailable'));
  assert(!e.node('#app').innerHTML.match(/<button[^>]*data-action="qr"[^>]*>/)[0].includes('disabled'));
  assert.equal(e.idb.rows.get('session').config.qrAvailable, true);
});

test('online scanning uses the downloaded NFC/QR directory and makes no per-scan requests', async () => {
  const e = await ready();
  e.db.students[0].nfcUid = '04AABBCC';
  e.setNetwork(true);
  await e.run('refresh(false)');
  const count = e.requests.length;
  await e.run('record({method:"nfc",credential:"04:AA:BB:CC"})');
  await e.run(`record({method:'qr',credential:'safetap:${e.db.students[1].qrToken}'})`);
  assert.equal(e.requests.length, count, 'capturing IDs must not wait for HTTP');
  assert.equal(e.idb.rows.get('queue').length, 2);
  assert.equal(e.db.checkins.length, 0, 'queued scans are distinct from server-confirmed arrivals');
  await e.run('syncQueue()');
  assert.deepEqual(e.syncBatches, [2]);
  assert.equal(e.idb.rows.get('queue').length, 0);
  assert.equal(e.db.checkins.length, 2);
});

test('unchanged student lists are reused; edited IDs refresh the cache and lookup index', async () => {
  const e = await ready();
  e.setNetwork(true);
  await e.run('refresh(false)');
  const downloads = () => e.requests.filter(url => url.startsWith('/api/offline')).length;
  assert.equal(downloads(), 1);
  await e.run('refresh(false)');
  assert.equal(downloads(), 1);
  assert.equal(e.run('state.data.students.length'), e.db.students.length, 'compact state retains the local directory');
  e.run('SafeTapDirectory.resolve(state.pack.students,{method:"qr",credential:state.pack.students[0].qrToken})');
  const oldToken = e.db.students[0].qrToken;
  e.db.students[0].qrToken = 'replacement-qr-token';
  await e.run('refresh(false)');
  assert.equal(downloads(), 2);
  await e.run(`record({method:'qr',credential:'${oldToken}'})`);
  assert.equal(e.run('state.queue.length'), 0, 'rotated credentials stop matching after refresh');
  await e.run('record({method:"qr",credential:"replacement-qr-token"})');
  assert.equal(e.idb.rows.get('queue').length, 1);
});

test('directory saves before an evacuation and stays available after an offline reload', async () => {
  const e = await ready();
  e.db.events[0].status = 'closed';
  e.setNetwork(true);
  await e.run('refresh(false)');
  assert.equal(e.idb.rows.get('pack').event, null);
  assert.equal(e.idb.rows.get('pack').students.length, e.db.students.length);
  e.setNetwork(false);
  await e.run('boot()');
  assert.equal(e.run('matching("Jamie").length'), 1);
  await e.run(`record({method:'manual',studentId:'${e.db.students[0].id}',confirmed:true})`);
  assert.equal(e.run('state.queue.length'), 0, 'an offline phone cannot invent a new event');
});

test('repeated IDs are deduplicated on the phone before upload', async () => {
  const e = await ready();
  const command = `record({method:'manual',studentId:'${e.db.students[0].id}',confirmed:true})`;
  await e.run(command);
  await e.run(command);
  assert.equal(e.idb.rows.get('queue').length, 1);
  assert.match(e.node('#scan-result').innerHTML, /Already recorded on this phone/);
});

test('storage failure never reports a successful capture or sends a scan', async () => {
  const e = await ready();
  e.setNetwork(true);
  e.run('state.online=true');
  e.idb.failNextWrite();
  const before = e.requests.length;
  await e.run(`record({method:'manual',studentId:'${e.db.students[0].id}',confirmed:true})`);
  assert.equal(e.run('state.queue.length'), 0);
  assert.equal(e.idb.rows.get('queue'), undefined);
  assert.match(e.node('#scan-result').innerHTML, /could not save/);
  assert.equal(e.requests.length, before);
});

test('a lost upload response retains the same submission and retries without double counting', async () => {
  const e = await ready();
  await e.run(`record({method:'manual',studentId:'${e.db.students[0].id}',confirmed:true})`);
  const originalId = e.idb.rows.get('queue')[0].submissionId;
  e.setNetwork(true);
  const fetch = e.context.fetch;
  e.context.fetch = async (url, options) => {
    const response = await fetch(url, options);
    if (url.endsWith('/sync')) throw new Error('Response lost after server commit');
    return response;
  };
  await assert.rejects(e.run('syncQueue()'), /Cannot reach/);
  assert.equal(e.db.checkins.length, 1);
  assert.equal(e.idb.rows.get('queue')[0].submissionId, originalId);
  e.context.fetch = fetch;
  await e.run('syncQueue()');
  assert.equal(e.idb.rows.get('queue').length, 0);
  assert.equal(e.db.checkins.length, 1);
});

test('a new scan captured during upload is preserved and included in the next batch', async () => {
  const e = await ready();
  await e.run(`record({method:'manual',studentId:'${e.db.students[0].id}',confirmed:true})`);
  e.setNetwork(true);
  const fetch = e.context.fetch;
  let injected = false;
  e.context.fetch = async (url, options) => {
    const response = await fetch(url, options);
    if (url.endsWith('/sync') && !injected) {
      injected = true;
      await e.run(`record({method:'manual',studentId:'${e.db.students[1].id}',confirmed:true})`);
    }
    return response;
  };
  await e.run('syncQueue()');
  assert.deepEqual(e.syncBatches, [1, 1]);
  assert.equal(e.idb.rows.get('queue').length, 0);
  assert.equal(e.db.checkins.length, 2);
});

test('concurrent device transactions preserve records saved by different tabs', async () => {
  const idb = fakeIndexedDB();
  const first = vm.createContext({indexedDB: idb});
  const second = vm.createContext({indexedDB: idb});
  const source = fs.readFileSync(path.join(__dirname, '../public/js/device-store.js'), 'utf8');
  vm.runInContext(source, first);
  vm.runInContext(source, second);
  await Promise.all([
    vm.runInContext('SafeTapDevice.update("queue", rows => [...(rows || []), {submissionId:"first"}])', first),
    vm.runInContext('SafeTapDevice.update("queue", rows => [...(rows || []), {submissionId:"second"}])', second)
  ]);
  assert.deepEqual(idb.rows.get('queue').map(row => row.submissionId), ['first', 'second']);
});

test('a rejected credential remains visible for review and an expired session keeps pending records', async () => {
  const e = await ready();
  await e.run(`record({method:'qr',credential:'${e.db.students[0].qrToken}'})`);
  e.db.students[0].qrToken = 'changed-after-capture';
  e.setNetwork(true);
  // Use the real endpoint so individual validation failures become rejections.
  const fetch = e.context.fetch;
  e.context.fetch = async (url, options) => {
    if (!url.endsWith('/sync')) return fetch(url, options);
    const scans = JSON.parse(options.body).scans;
    return {ok: true, json: async () => ({results: scans.map(scan => {
      try {return {submissionId: scan.submissionId, ...D.checkin(e.db, e.user, scan)};}
      catch (error) {return {submissionId: scan.submissionId, status: 'rejected', error: error.message};}
    })})};
  };
  await e.run('syncQueue()');
  assert.equal(e.idb.rows.get('queue').length, 1);
  assert.match(e.idb.rows.get('queue')[0].error, /not registered/);
  assert.match(e.run('queueList()'), /Needs attention/);
  e.context.fetch = async () => ({ok: false, status: 401, json: async () => ({error:'Please sign in again.'})});
  await assert.rejects(e.run('syncQueue()'), /sign in again/);
  assert.equal(e.idb.rows.get('queue').length, 1);
  assert.equal(e.run('state.user'), null);
});

test('login has a main landmark and guest discovery does not load Socket.IO', async () => {
  const e = environment();
  e.context.fetch = async url => ({ok: true, json: async () => url.endsWith('/config') ? e.config : {user:null,csrf:null}});
  await e.run('boot()');
  assert.match(e.node('#app').innerHTML, /<main class="login-page">/);
  assert.equal(e.run('state.socket'), null);
  assert(!fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8').includes('src="/socket.io/'));
});


test('device storage reopens a closing connection without losing saved records', async () => {
  const idb = fakeIndexedDB();
  const context = vm.createContext({indexedDB: idb});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/device-store.js'), 'utf8'), context);
  await vm.runInContext('SafeTapDevice.set("queue", [{submissionId:"saved"}])', context);
  idb.closeOnNextTransaction();
  const saved = await vm.runInContext('SafeTapDevice.get("queue")', context);
  assert.equal(saved[0].submissionId, 'saved');
  assert.equal(idb.openCount, 2);
  idb.closeOnNextTransaction();
  await vm.runInContext('SafeTapDevice.update("queue", rows => [...rows, {submissionId:"new"}])', context);
  assert.deepEqual(idb.rows.get('queue').map(row => row.submissionId), ['saved', 'new']);
});


test('missing shortcut shows expected students who have not arrived', async () => {
  const e = await ready();
  e.run('state.search="old"; state.filterBlock="other"; state.filterStatus="safe"');
  await e.run('action({dataset:{action:"show-missing"}})');
  assert.equal(e.run('state.filterStatus'), 'pending');
  assert.equal(e.run('state.search'), '');
  assert.equal(e.run('state.filterBlock'), '');
  const result = e.run(`filteredPeople([
    {name:'Missing', studentNumber:'1', expected:true, safe:false},
    {name:'Arrived', studentNumber:'2', expected:true, safe:true},
    {name:'Not expected', studentNumber:'3', expected:false, safe:false}
  ]).map(person => person.name).join(',')`);
  assert.equal(result, 'Missing');
});

test('scan feedback separates the student name from the saved status', async () => {
  const e = await ready();
  e.context.studentId = e.db.students[0].id;
  await e.run('record({method:"manual",studentId,confirmed:true})');
  const result = e.node('#scan-result').innerHTML;
  assert.match(result, /<strong>[^<]+<\/strong>/);
  assert.match(result, /waiting to upload/);
  assert.equal(e.idb.rows.get('queue').length, 1);
});

test('verified representative cannot restore a cached admin session on a failed refresh', async () => {
  const e = await ready();
  const saved = {user: structuredClone(e.user), data: D.snapshot(e.db, e.user), config: {demo:true}};
  e.idb.rows.set('session', saved);
  e.user.role = 'rep';
  e.user.blockIds = [e.db.blocks[0].id];
  e.setNetwork(true);
  e.setFailState(true);
  await e.run('boot()');
  assert.equal(e.idb.rows.get('session'), null);
  assert.match(e.node('#app').innerHTML, /Sign in/);
  assert.doesNotMatch(e.node('#app').innerHTML, /Change history/);
});

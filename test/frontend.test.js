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
function fakeIndexedDB() {
  const rows = new Map();
  const db = {
    createObjectStore() {},
    transaction() {
      const tx = {
        objectStore() {
          return {
            get(key) {
              const r = {};
              queueMicrotask(() => {
                r.result = structuredClone(rows.get(key));
                r.onsuccess?.();
              });
              return r;
            },
            put(value, key) {
              rows.set(key, structuredClone(value));
              queueMicrotask(() => tx.oncomplete?.());
            }
          };
        }
      };
      return tx;
    }
  };
  return {
    open() {
      const req = {
        result: db
      };
      queueMicrotask(() => req.onsuccess?.());
      return req;
    },
    rows
  };
}
function environment() {
  const f = {
    db: D.baseDb({
      demo: true,
      password: 'SafeTapDemo123!'
    })
  };
  f.syncBatches = [];
  f.user = f.db.users[0];
  f.config = {demo: true, qrAvailable: false, ocrAvailable: false};
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
      head: {
        append() {}
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
      if (!network) throw new Error('Network lost');
      let data;
      if (url.endsWith('/config')) data = f.config;else if (url.endsWith('/me')) data = {
        user: D.publicUser(f.user),
        csrf: 'test'
      };else if (url.endsWith('/state')) {
        if (failState) throw new Error('Dashboard connection lost');
        data = D.snapshot(f.db, f.user);
      } else if (url.endsWith('/offline')) data = {
        userId: f.user.id, event: f.db.events.find(e => e.status === 'active'),
        students: structuredClone(f.db.students.filter(s => s.active)), blocks: structuredClone(f.db.blocks), preparedAt: D.now()
      };else if (url.endsWith('/checkins')) data = D.checkin(f.db, f.user, JSON.parse(options.body));else if (url.endsWith('/sync')) {
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
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8'), context);
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
  e.run('S.user=testState.user;S.data=testState;S.pack=testPack;S.config={demo:true};S.online=false;');
  return e;
}
test('all client pages render, escape student HTML, and preserve CAFAD scope', async () => {
  const e = await ready();
  e.run('S.data.students[0].name="<img src=x onerror=alert(1)>"');
  for (const page of ['dashboard', 'attendance', 'scanner', 'students', 'team', 'history', 'offline']) {
    e.run(`S.page='${page}';render()`);
    assert(e.node('#app').innerHTML.includes('SafeTap'));
    assert(!e.node('#app').innerHTML.includes('<img src=x'));
  }
  e.run('S.page="dashboard";S.floor=5;render()');
  assert(e.node('#app').innerHTML.includes('Not included in SafeTap'));
  assert(e.node('#app').innerHTML.includes('CAFAD'));
});
test('floor plan shows open class attendance before an event and preserves the event snapshot', async () => {
  const e = await ready();
  e.context.savedEvent = structuredClone(e.context.testState.active);
  e.run('S.floor=3;S.room="F3-3";S.data.active=null');
  assert.match(e.run('floorMap()'), /1 present/);
  assert.match(e.run('roomDetail()'), /Present in class/);
  assert.doesNotMatch(e.run('roomDetail()'), /Still missing|Not on the expected list/);
  e.run('S.data.attendance.push({...S.data.attendance[0]})');
  assert.equal(e.run('roomPeople("F3-3").length'), 1, 'attendance is deduplicated');
  e.run('S.data.classes[0].status="closed"');
  assert.equal(e.run('roomPeople("F3-3").length'), 0);
  e.run('S.data.active=savedEvent');
  assert.match(e.run('floorMap()'), /0 \/ 1 safe/);
  assert.match(e.run('roomDetail()'), /Still missing/);
});
test('attendance automatically selects a single assigned block and restricts multiple-block choices', async () => {
  const e = await ready();
  e.context.assignedId = e.db.blocks[0].id;
  e.run('S.user={...S.user,role:"rep",blockIds:[assignedId]}');
  await e.run('action({dataset:{action:"open-class"}})');
  let html = e.node('#modal').innerHTML;
  assert.match(html, /type="hidden" name="blockId"/);
  assert(html.includes(`value="${e.db.blocks[0].id}"`));
  assert.doesNotMatch(html, /<select name="blockId"/);
  assert.match(html, /<select name="roomId"/);
  e.run('S.user.blockIds=S.data.blocks.map(b=>b.id)');
  await e.run('action({dataset:{action:"open-class"}})');
  assert.match(e.node('#modal').innerHTML, /<select name="blockId"/);
  e.run('S.user.role="admin";S.user.blockIds=[]');
  await e.run('action({dataset:{action:"open-class"}})');
  assert.match(e.node('#modal').innerHTML, /<select name="blockId"/);
  e.run('S.user.role="rep";S.user.blockIds=[]');
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
  e.run('S.online=true');
  await e.run('syncQueue()');
  assert.equal(e.idb.rows.get('queue').length, 0);
  assert.equal(D.eventSummary(e.db, e.event.id).safe, 1);
});
test('committed scan stays confirmed when the dashboard refresh subsequently fails', async () => {
  const e = await ready();
  e.setNetwork(true);
  e.setFailState(true);
  e.context.studentId = e.db.students[0].id;
  e.run('S.online=true');
  await e.run('record({method:"manual",studentId,confirmed:true})');
  assert(e.node('#scan-result').innerHTML.includes('saved to server'));
  assert.equal(e.idb.rows.get('queue').length, 0);
  assert.equal(D.eventSummary(e.db, e.event.id).safe, 1);
});
test('unknown offline QR is not saved and shows a clear error', async () => {
  const e = await ready();
  await e.run('record({method:"qr",credential:"unregistered"})');
  assert.equal(e.run('S.queue.length'), 0);
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
  e.run('S.page="scanner";render()');
  e.db.events[0].status = 'closed';
  D.startEvent(e.db, e.user, {name: 'Replacement event', type: 'drill', area: 'Assembly B'});
  e.setNetwork(true);
  await e.run('refresh(false)');
  assert(e.node('#app').innerHTML.includes('Replacement event'));
  assert(e.node('#toast').textContent.includes('event changed'));
});

test('scanner displays NFC on desktop and mobile, with a start button and unsupported-device feedback', async () => {
  const e = await ready();
  e.run('S.page="scanner";render()');
  assert(e.node('#app').innerHTML.includes('data-method="nfc"'));
  await e.run('action({dataset:{action:"method",method:"nfc"}})');
  assert(e.node('#app').innerHTML.includes('Start NFC scan'));
  await e.run('action({dataset:{action:"nfc"}})');
  assert(e.node('#scan-result').innerHTML.includes('NFC scanning is not available'));
});

test('offline NFC identifies the student, persists the scan, and uploads once', async () => {
  const e = await ready();
  e.db.students[0].nfcUid = '04AABBCC';
  e.run('S.pack.students[0].nfcUid="04AABBCC";S.page="scanner"');
  await e.run('record({method:"nfc",credential:"04:AA:BB:CC"})');
  assert.equal(e.idb.rows.get('queue').length, 1);
  assert.equal(e.idb.rows.get('queue')[0].name, e.db.students[0].name);
  e.setNetwork(true);
  e.run('S.online=true');
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
  e.run('S.page="scanner";S.pack.students[0].nfcUid="04AABBCC";render()');
  await e.run('startNfc()');
  assert.equal(e.run('S.nfcState'), 'reading');
  await e.run('action({dataset:{action:"method",method:"manual"}})');
  assert.equal(reader.signal.aborted, true);
  reader.onreading({serialNumber:'04:AA:BB:CC'});
  assert.equal(e.run('S.queue.length'), 0);
});

test('phone More navigation preserves admin and representative access and uses plain labels', async () => {
  const e = await ready();
  for (const page of ['dashboard','attendance','scanner','offline','students','team','history']) {
    e.run(`S.page='${page}';render()`);
    const html = e.node('#app').innerHTML;
    assert(html.includes('aria-label="Phone navigation"'));
    const visibleText = html.replace(/<[^>]*>/g, ' ');
    assert(!/baseline|roster|stale data|credential/i.test(visibleText), `${page}: ${visibleText.match(/.{0,40}(baseline|roster|stale data|credential).{0,60}/i)?.[0]}`);
  }
  await e.run('action({dataset:{action:"more"}})');
  assert(e.node('#modal').innerHTML.includes('Students & blocks'));
  e.run('S.user.role="rep"');
  await e.run('action({dataset:{action:"more"}})');
  assert(!e.node('#modal').innerHTML.includes('Students & blocks'));
  assert(!e.node('#modal').innerHTML.includes('Representatives'));
  assert(e.node('#modal').innerHTML.includes('Reports'));
});

test('offline reload recovers the session before uploading and refuses another account', async () => {
  const e = await ready();
  const studentId = e.db.students[0].id;
  await e.run(`record({method:'manual',studentId:'${studentId}',confirmed:true})`);
  e.run('S.csrf=""');
  e.setNetwork(true);
  await e.run('syncQueue()');
  assert.equal(e.run('S.queue.length'), 0);
  assert.equal(e.run('S.csrf'), 'test');

  const other = await ready();
  await other.run(`record({method:'manual',studentId:'${other.db.students[0].id}',confirmed:true})`);
  other.user.id = other.db.users[1].id;
  other.setNetwork(true);
  await assert.rejects(other.run('syncQueue()'), /account that saved/);
  assert.equal(other.run('S.queue.length'), 1);
  assert.equal(other.db.checkins.length, 0);
});

test('online refresh automatically saves NFC and QR IDs; offline reload retains scans', async () => {
  const e = await ready();
  e.db.students[0].nfcUid = '04AABBCC';
  e.setNetwork(true);
  e.run('S.pack=null;S.csrf="test"');
  await e.run('refresh(false)');
  assert.equal(e.idb.rows.get('pack').event.id, e.event.id);
  assert.equal(e.idb.rows.get('pack').students[0].nfcUid, '04AABBCC');
  assert.equal(e.idb.rows.get('pack').students[0].qrToken, e.db.students[0].qrToken);
  e.setNetwork(false);
  e.run('S.online=false');
  await e.run('record({method:"nfc",credential:"04:AA:BB:CC"})');
  assert.equal(e.idb.rows.get('queue').length, 1);
  await e.run('boot()');
  assert.equal(e.run('S.queue.length'), 1);
  assert.equal(e.run('S.pack.event.id'), e.event.id);
  e.setNetwork(true);
  await e.run('syncQueue()');
  assert.equal(e.run('S.queue.length'), 0);
  assert.equal(D.eventSummary(e.db, e.event.id).safe, 1);
});

test('automatic preparation caches scanner assets once without interrupting NFC', async () => {
  const e = await ready();
  const cached = new Set();
  e.context.navigator.serviceWorker = {register: async () => {}, ready: Promise.resolve({})};
  e.context.navigator.storage = {persist: async () => true};
  e.context.caches = {open: async () => ({match: async key => cached.has(key), add: async key => cached.add(key)})};
  e.context.fetch = async () => ({ok: true, json: async () => ['/vendor/qr.js', '/vendor/ocr.wasm']});
  e.run('S.config={qrAvailable:true,ocrAvailable:true};S.nfcController=new AbortController();S.nfcState="reading"');
  await e.run('cacheOfflineAssets()');
  assert.deepEqual([...cached], ['/vendor/qr.js', '/vendor/ocr.wasm']);
  assert.equal(e.run('S.offlineAssets'), true);
  assert.equal(e.run('S.nfcController.signal.aborted'), false);
  assert.match(e.run('offlineReadiness()'), /saved automatically/);
});

test('sync refreshes stale session tokens, recovers legacy auth errors and drains all batches', async () => {
  const e = await ready();
  e.context.pendingScans = Array.from({length: 105}, (_, i) => ({
    submissionId: randomUUID(), eventId: e.event.id, ownerId: e.user.id,
    studentId: e.db.students[0].id, method: 'manual', confirmed: true, capturedAt: D.now(),
    error: i % 2 ? 'Session verification failed. Refresh and sign in again.' : 'Please refresh and sign in again. Your saved scans will stay on this phone.'
  }));
  e.run('S.queue=pendingScans;S.csrf="old-token";S.page="scanner";S.nfcController=new AbortController();S.nfcState="reading"');
  e.setNetwork(true);
  await e.run('syncQueue()');
  assert.deepEqual(e.syncBatches, [100, 5]);
  assert.equal(e.run('S.queue.length'), 0);
  assert.equal(e.run('S.csrf'), 'test');
  assert.equal(e.run('S.nfcController.signal.aborted'), false);
  assert.equal(D.eventSummary(e.db, e.event.id).safe, 1);
});

test('closing an event clears only its offline pack, preserving pending records for review', async () => {
  const e = await ready();
  await e.run(`record({method:'manual',studentId:'${e.db.students[0].id}',confirmed:true})`);
  e.db.events[0].status = 'closed';
  e.setNetwork(true);
  await e.run('refresh(false)');
  assert.equal(e.run('S.pack'), null);
  assert.equal(e.idb.rows.get('queue').length, 1);
  assert.equal(e.idb.rows.get('queue')[0].eventId, e.event.id);
});

test('ID photo offers distinct file and camera inputs without recording an arrival', async () => {
  const e = await ready();
  e.run('S.config.ocrAvailable=true;S.page="scanner";S.method="ocr";render()');
  const html = e.node('#app').innerHTML;
  assert(html.includes('Choose file'));
  assert(html.includes('Take photo'));
  assert(!html.match(/<input id="ocr-file"[^>]*>/)[0].includes('capture='));
  assert(html.match(/<input id="ocr-camera"[^>]*>/)[0].includes('capture="environment"'));
  let chosen = 0, taken = 0;
  e.node('#ocr-file').click = () => chosen++;
  e.node('#ocr-camera').click = () => taken++;
  await e.run('action({dataset:{action:"choose-photo"}})');
  await e.run('action({dataset:{action:"take-photo"}})');
  assert.equal(chosen, 1);
  assert.equal(taken, 1);
  assert.equal(e.db.checkins.length, 0);
  e.run('S.config.ocrAvailable=false');
  await e.run('action({dataset:{action:"take-photo"}})');
  assert.equal(taken, 1);
});

test('changing appearance leaves an active NFC reader and page intact', async () => {
  const e = await ready();
  let toggleCount = 0;
  e.context.window.SafeTapTheme = {current: 'light', toggle() {this.current = 'dark'; toggleCount++;}};
  e.run('S.page="scanner";S.method="nfc";S.nfcController=new AbortController();S.nfcState="reading";render()');
  await e.run('action({dataset:{action:"theme"}})');
  assert.equal(toggleCount, 1);
  assert.equal(e.run('S.nfcController.signal.aborted'), false);
  assert.equal(e.run('S.page'), 'scanner');
});

test('reconnect refresh replaces stale OCR availability and enables the photo controls', async () => {
  const e = await ready();
  e.run('S.config.ocrAvailable=false;S.page="scanner";S.method="ocr";render()');
  assert(e.node('#app').innerHTML.includes('ID photo scanning is not set up yet'));
  e.config.ocrAvailable = true;
  e.setNetwork(true);
  await e.run('refresh(false)');
  assert(!e.node('#app').innerHTML.includes('ID photo scanning is not set up yet'));
  assert(!e.node('#app').innerHTML.match(/<input id="ocr-file"[^>]*>/)[0].includes('disabled'));
  assert.equal(e.idb.rows.get('session').config.ocrAvailable, true);
});

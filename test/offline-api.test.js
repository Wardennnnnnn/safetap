'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createApplication} = require('../server');
const {MemoryStore} = require('../src/store');
const D = require('../src/domain');
const {request} = require('./helpers/request');

async function fixture(t) {
  const db = D.baseDb({demo: true, password: 'SafeTapDemo123!'});
  db.students[0].nfcUid = '04AABBCC';
  const store = new MemoryStore(db);
  const instance = createApplication(store, {demo: true});
  t.after(() => instance.close());
  const login = await request(instance.app, {path: '/api/login', method: 'POST', body: {username: 'repit', password: 'SafeTapDemo123!'}});
  const cookieHeader = login.headers['set-cookie'];
  const cookie = (Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader).split(';')[0];
  const get = async (path, authenticated = true) => {
    const response = await request(instance.app, {path, headers: authenticated ? {cookie} : {}});
    return {...response, data: JSON.parse(response.body)};
  };
  return {db, store, get};
}

test('representatives download all active blocks before an event without exposing accounts', async t => {
  const {db, store, get} = await fixture(t);
  assert.equal((await get('/api/offline', false)).status, 401);
  await store.transact(data => { data.students[0].active = false; });
  const response = await get('/api/offline');
  assert.equal(response.status, 200);
  assert.equal((await get('/api/OFFLINE/')).status, 200);
  assert.equal((await get('/api/state/')).status, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.data.event, null);
  assert.equal(response.data.students.length, db.students.length - 1);
  assert(response.data.students.some(student => student.blockId === db.blocks[1].id), 'cross-block arrivals work offline');
  assert(response.data.students.every(student => student.qrToken));
  assert(!response.body.includes('passwordHash'));
  assert(!response.body.includes('users'));
});

test('conditional downloads omit unchanged directory data and invalidate when credentials change', async t => {
  const {db, store, get} = await fixture(t);
  const first = await get('/api/offline');
  const version = first.data.version;
  assert.equal((await get('/api/state')).data.directoryVersion, version);
  const unchanged = await get('/api/offline?version=' + version);
  assert.equal(unchanged.data.unchanged, true);
  assert.equal(unchanged.data.students, undefined);
  const compact = await get('/api/state?directoryVersion=' + version);
  assert.equal(compact.data.students, undefined);
  assert.equal(compact.data.blocks, undefined);
  assert(compact.data.rooms.length);
  const stale = await get('/api/state?directoryVersion=old');
  assert.equal(stale.data.students.length, db.students.length);
  assert(!stale.body.includes('qrToken'), 'dashboard never exposes scan credentials');
  await store.transact(data => {data.students[0].qrToken = 'rotated';});
  const changed = await get('/api/offline?version=' + version);
  assert.notEqual(changed.data.version, version);
  assert.equal(changed.data.students[0].qrToken, 'rotated');
});

test('public guest session/config/version are normal 200 responses while protected state stays private', async t => {
  const {get} = await fixture(t);
  assert.equal((await get('/api/config', false)).status, 200);
  const guest = await get('/api/session', false);
  assert.deepEqual(guest.data, {user: null, csrf: null});
  assert.equal(guest.status, 200);
  assert.equal((await get('/api/me', false)).status, 401);
  assert.equal((await get('/api/state', false)).status, 401);
  assert.equal((await get('/api/session')).data.user.role, 'rep');
  const version = await get('/api/version', false);
  assert.equal(version.data.build, 'v14-role-boundaries');
  assert.equal(version.data.version, '1.1.0');
  assert.equal(version.headers['cache-control'], 'no-store');
  const csp = version.headers['content-security-policy'];
  assert(csp.includes('https://static.cloudflareinsights.com'));
  assert.equal(version.headers['cross-origin-opener-policy'], 'same-origin');
});

test('representative responses exclude admin review details and operator identities', async t => {
  const {store, get} = await fixture(t);
  let eventId;
  await store.transact(db => {
    const admin = db.users.find(user => user.role === 'admin');
    admin.name = 'PRIVATE_OPERATOR';
    const session = D.openClass(db, admin, {blockId: db.blocks[0].id, roomId: 'F3-3'});
    D.updateClass(db, admin, session.id, {studentId: db.students[0].id, present: true});
    eventId = D.startEvent(db, admin, {name: 'Privacy drill', type: 'drill', area: 'Assembly'}).id;
    const result = D.checkin(db, admin, {eventId, submissionId: 'privacy-check-0001', studentId: db.students[0].id, method: 'manual', confirmed: true});
    D.reviewCheckin(db, admin, result.checkinId, {action: 'void', reason: 'PRIVATE_CORRECTION'});
    const adminReport = D.eventSummary(db, eventId, admin);
    assert.equal(adminReport.checkins[0].reason, 'PRIVATE_CORRECTION');
    assert.equal(adminReport.unaccounted, 1);
  });
  for (const path of ['/api/state', '/api/offline', `/api/events/${eventId}`]) {
    const response = await get(path);
    assert.equal(response.status, 200);
    assert.doesNotMatch(response.body, /PRIVATE_OPERATOR|PRIVATE_CORRECTION|passwordHash|createdBy/);
    const event = response.data.active?.event || response.data.event;
    assert.equal(event.coverage[0].session.userId, undefined);
    if (path === '/api/state') {
      assert.deepEqual(response.data.reps, []);
      assert.deepEqual(response.data.audit, []);
      assert.equal(response.data.active.unaccounted, 1);
    }
    if (path.includes('/events/')) assert.deepEqual(response.data.checkins, []);
  }
});


test('inactive student edits invalidate admin directory but not representative downloads', () => {
  const db = D.baseDb({demo:true, password:'SafeTapDemo123!'});
  const admin = db.users.find(user => user.role === 'admin');
  const rep = db.users.find(user => user.role === 'rep');
  db.students[0].active = false;
  const beforeAdmin = D.snapshot(db, admin);
  const beforeRep = D.snapshot(db, rep);
  db.students[0].name = 'Updated inactive student';
  const afterAdmin = D.snapshot(db, admin);
  const afterRep = D.snapshot(db, rep);
  assert.notEqual(beforeAdmin.directoryVersion, afterAdmin.directoryVersion);
  assert.equal(beforeRep.directoryVersion, afterRep.directoryVersion);
  assert.equal(beforeAdmin.offlineDirectoryVersion, afterAdmin.offlineDirectoryVersion);
  assert(afterAdmin.students.some(student => student.id === db.students[0].id));
  assert(!afterRep.students.some(student => student.id === db.students[0].id));
});

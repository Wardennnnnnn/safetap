'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {parseEnv} = require('node:util');
const {randomUUID, randomBytes} = require('node:crypto');
const mysql = require('mysql2/promise');
const {poolConfig, MysqlStore} = require('../src/store');
const {MysqlSessionStore} = require('../src/sessions');
const {snapshot, importSnapshot, checksum} = require('../src/migration');
const D = require('../src/domain');
const {request} = require('./helpers/request');
const {createApplication} = require('../server');
function testConfig(env) {
  return {...poolConfig(env), ...(process.env.MYSQL_TEST_SOCKET ? {socketPath: process.env.MYSQL_TEST_SOCKET} : {})};
}

test('real MySQL: TLS, directory migration, restart-persistent sessions, and duplicate arrivals', {skip: !process.env.MYSQL_TEST_ENV}, async () => {
  const env = parseEnv(fs.readFileSync(process.env.MYSQL_TEST_ENV, 'utf8'));
  const database = 'safetap_test_' + randomUUID().replaceAll('-', '');
  const admin = mysql.createPool(testConfig(env));
  let pool, created = false;
  try {
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`);
    created = true;
    pool = mysql.createPool(testConfig({...env, DB_NAME: database}));
    const db = D.baseDb({demo: true, password: 'SafeTapDemo123!'});
    const data = snapshot(db);
    await importSnapshot(pool, database, data, {dryRun: true});
    await importSnapshot(pool, database, data);
    await assert.rejects(importSnapshot(pool, database, data), /not empty/);
    const store = new MysqlStore(pool);
    assert.equal(checksum(await store.read()), data.checksum);
    await store.ping();
    const token = randomBytes(32).toString('hex');
    const session = {userId: db.users[0].id, csrf: randomBytes(24).toString('hex'), expires: Date.now() + 43200000};
    await store.sessions.set(token, session);
    await pool.end();
    pool = mysql.createPool(testConfig({...env, DB_NAME: database}));
    assert.deepEqual(await new MysqlSessionStore(pool).get(token), session);
    const restarted = new MysqlStore(pool);
    const event = await restarted.transact(current => {
      const user = current.users[0];
      const c = D.openClass(current, user, {blockId: current.blocks[0].id, roomId: 'F3-3'});
      D.updateClass(current, user, c.id, {studentId: current.students[0].id, present: true});
      return D.startEvent(current, user, {name: 'Cloud test', type: 'drill', area: 'Test assembly'});
    });
    const student = (await restarted.read()).students[0];
    await Promise.all([1, 2].map(() => restarted.transact(current => D.checkin(current, current.users[0], {
      submissionId: randomUUID(), eventId: event.id, method: 'manual', studentId: student.id, confirmed: true, capturedAt: D.now()
    }))));
    assert.equal(D.eventSummary(await restarted.read(), event.id).safe, 1);
  } finally {
    if (pool) await pool.end();
    if (created) await admin.query(`DROP DATABASE \`${database}\``);
    await admin.end();
  }
});

test('real MySQL: 2,840 students, concurrent batches, scoped reads and rollback', {skip: !process.env.MYSQL_TEST_ENV}, async t => {
  const env = parseEnv(fs.readFileSync(process.env.MYSQL_TEST_ENV, 'utf8'));
  const database = 'safetap_perf_' + randomUUID().replaceAll('-', '');
  const adminPool = mysql.createPool(testConfig(env));
  let pool, app, created = false;
  try {
    await adminPool.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`);
    created = true;
    pool = mysql.createPool(testConfig({...env, DB_NAME: database}));
    await require('../src/store').migrate(pool);
    const store = new MysqlStore(pool);
    const db = D.baseDb({demo: true, password: 'SafeTapDemo123!'});
    const operator = db.users.find(user => user.role === 'rep');
    db.blocks = Array.from({length:71}, (_, index) => ({id:randomUUID(), program:index < 53 ? 'IT' : 'CS', code:String(index + 1), term:'Test term'}));
    operator.blockIds = [db.blocks[0].id];
    db.students = Array.from({length: 2840}, (_, index) => ({
      id: randomUUID(), name: `Student ${index}`, studentNumber: `TEST-${index}`,
      blockId: db.blocks[Math.floor(index / 40)].id, active: true,
      nfcUid: index.toString(16).padStart(8, '0').toUpperCase(), qrToken: randomBytes(24).toString('hex')
    }));
    const event = D.startEvent(db, db.users[0], {name:'Concurrent scan test', type:'drill', area:'Assembly'});
    await store.transact(current => { for (const table of D.TABLES) current[table] = db[table]; });
    // Observe the actual SQL issued by the HTTP routes, not an emulated store.
    const sql = [];
    const wrapped = new WeakSet();
    const getConnection = pool.getConnection.bind(pool);
    pool.getConnection = async () => {
      const conn = await getConnection();
      if (!wrapped.has(conn)) {
        wrapped.add(conn);
        for (const method of ['query', 'execute']) {
          const original = conn[method].bind(conn);
          conn[method] = (...args) => { sql.push(args[0]); return original(...args); };
        }
      }
      return conn;
    };
    app = createApplication(store);
    const login = await request(app.app, {path:'/api/login', method:'POST', body:{username:operator.username, password:'SafeTapDemo123!'}});
    assert.equal(login.status, 200);
    const cookieHeader = login.headers['set-cookie'];
    const cookie = (Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader).split(';')[0];
    const headers = {cookie, 'x-csrf-token': JSON.parse(login.body).csrf};
    sql.length = 0;
    assert.equal((await request(app.app, {path:'/api/me', headers})).status, 200);
    assert(!sql.some(query => /FROM `(?:students|events|audit|submissions)`/.test(query)), 'session checks do not load application tables');
    const batches = Array.from({length:71}, (_, index) => db.students.slice(index * 40, (index + 1) * 40).map((student, offset) => ({
      submissionId: randomUUID(), eventId:event.id, method: offset % 2 ? 'nfc' : 'qr',
      credential: offset % 2 ? student.nfcUid : 'safetap:' + student.qrToken
    })));
    sql.length = 0;
    const started = performance.now();
    const responses = await Promise.all(batches.map(scans => request(app.app, {path:'/api/sync', method:'POST', headers, body:{scans}})));
    const elapsed = performance.now() - started;
    for (const response of responses) {
      assert.equal(response.status, 200);
      assert(JSON.parse(response.body).results.every(result => result.status === 'confirmed'));
    }
    assert(!sql.some(query => /^SELECT \* FROM `\w+`$/.test(query)), 'uploads have no full-table SELECT');
    assert(!sql.some(query => /FROM `(?:classes|attendance|audit)`/.test(query)), 'uploads do not read unrelated tables or old audit records');
    const summary = D.eventSummary(await store.read(), event.id);
    assert.equal(summary.additional, 2840);
    const retry = await request(app.app, {path:'/api/sync', method:'POST', headers, body:{scans:batches[0]}});
    assert.equal(retry.status, 200);
    assert.equal(D.eventSummary(await store.read(), event.id).additional, 2840);
    const conflict = {...batches[0][0], eventId:'different-event'};
    const denied = await request(app.app, {path:'/api/sync', method:'POST', headers, body:{scans:[conflict]}});
    assert.equal(JSON.parse(denied.body).results[0].status, 'rejected');
    const extra = {...db.students[0], id:randomUUID(), studentNumber:'EXTRA', nfcUid:null, qrToken:randomBytes(24).toString('hex')};
    await store.transact(current => current.students.push(extra));
    const simultaneous = await Promise.all([1, 2].map(() => request(app.app, {path:'/api/sync', method:'POST', headers, body:{scans:[{
      submissionId:randomUUID(), eventId:event.id, method:'manual', studentId:extra.id, confirmed:true
    }]}})));
    assert.deepEqual(simultaneous.map(response => JSON.parse(response.body).results[0].status).sort(), ['confirmed', 'duplicate']);
    assert.equal(D.eventSummary(await store.read(), event.id).additional, 2841);
    const before = await store.read();
    await assert.rejects(store.transact(current => {
      current.blocks[0].term = 'Must roll back';
      current.students[0].blockId = 'missing-block';
    }));
    assert.equal(checksum(await store.read()), checksum(before), 'SQL failure rolls back earlier batched writes');
    await assert.rejects(store.transact(current => {
      D.reviewCheckin(current, current.users[0], current.checkins[0].id, {action:'void', reason:'Rollback test'});
      throw new Error('Forced rollback');
    }), /Forced rollback/);
    assert.equal(checksum(await store.read()), checksum(before));
    t.diagnostic(`71 concurrent uploads / 2,840 students: ${Math.round(elapsed)} ms on isolated local MySQL; not a production latency guarantee.`);
  } finally {
    if (app) { await app.close(); pool = null; }
    if (pool) await pool.end();
    if (created) await adminPool.query(`DROP DATABASE \`${database}\``);
    await adminPool.end();
  }
});

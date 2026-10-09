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

test('real MySQL: TLS, directory migration, restart-persistent sessions, and duplicate arrivals', {skip: !process.env.MYSQL_TEST_ENV}, async () => {
  const env = parseEnv(fs.readFileSync(process.env.MYSQL_TEST_ENV, 'utf8'));
  const database = 'safetap_test_' + randomUUID().replaceAll('-', '');
  const admin = mysql.createPool(poolConfig(env));
  let pool, created = false;
  try {
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`);
    created = true;
    pool = mysql.createPool(poolConfig({...env, DB_NAME: database}));
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
    pool = mysql.createPool(poolConfig({...env, DB_NAME: database}));
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

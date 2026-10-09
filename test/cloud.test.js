'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const tls = require('node:tls');
const {createHash} = require('node:crypto');
const {MemoryStore, MysqlStore, poolConfig} = require('../src/store');
const {MysqlSessionStore} = require('../src/sessions');
const {createApplication} = require('../server');
const {request} = require('./helpers/request');
const D = require('../src/domain');

test('TLS configuration validates CA files, requires hostname verification, and preserves localhost mode', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'safetap-tls-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const ca = path.join(dir, 'ca.pem');
  fs.writeFileSync(ca, tls.rootCertificates[0]);
  const config = poolConfig({DB_SSL: '1', DB_SSL_CA_FILE: ca, DB_HOST: 'test.example'});
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.equal(config.ssl.verifyIdentity, true);
  assert.equal(config.host, 'test.example');
  assert.equal(poolConfig({DB_SSL: '0'}).ssl, undefined);
  assert.throws(() => poolConfig({DB_SSL: '1'}), /required/);
  assert.throws(() => poolConfig({DB_SSL: 'maybe'}), /0 or 1/);
  fs.writeFileSync(ca, '-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----');
  assert.throws(() => poolConfig({DB_SSL: '1', DB_SSL_CA_FILE: ca}), /valid database CA/);
  assert.throws(() => poolConfig({DB_SSL: '1', DB_SSL_CA_FILE: path.join(dir, 'missing')}), /valid database CA/);
});

// SQL-backed session adapter tested against a shared relational contract. Real
// provider integration is covered by the optional MYSQL_TEST_ENV runbook.
function sessionPool() {
  const rows = new Map();
  return {rows, async execute(sql, args) {
    if (sql.startsWith('INSERT')) rows.set(args[0], {userId: args[1], csrf: args[2], expires: String(args[3])});
    else if (sql.startsWith('SELECT')) return [[rows.get(args[0])].filter(Boolean)];
    else if (sql.includes('tokenHash =')) rows.delete(args[0]);
    else if (sql.startsWith('DELETE')) for (const [key, row] of rows) if (Number(row.expires) <= args[0]) rows.delete(key);
    else throw Error('Unexpected session SQL');
    return [{}];
  }};
}

test('SQL sessions survive a new application instance, enforce CSRF, expiry, logout, and account revocation', async t => {
  const db = D.baseDb({demo: true, password: 'SafeTapDemo123!'});
  const pool = sessionPool();
  const store = new MemoryStore(db);
  store.sessions = new MysqlSessionStore(pool);
  let app = createApplication(store, {demo: true});
  t.after(() => app.close());
  const login = async () => {
    const r = await request(app.app, {path: '/api/login', method: 'POST', body: {username: 'admin', password: 'SafeTapDemo123!'}});
    assert.equal(r.status, 200);
    const cookies = r.headers['set-cookie'];
    return {cookie: (Array.isArray(cookies) ? cookies[0] : cookies).split(';')[0], csrf: JSON.parse(r.body).csrf};
  };
  const session = await login();
  const token = session.cookie.split('=')[1];
  assert(!pool.rows.has(token));
  assert(pool.rows.has(createHash('sha256').update(token).digest('hex')));
  await app.close();
  store.sessions = new MysqlSessionStore(pool);
  app = createApplication(store, {demo: true});
  const headers = {cookie: session.cookie};
  assert.equal((await request(app.app, {path: '/api/me', headers})).status, 200);
  assert.equal((await request(app.app, {path: '/api/logout', method: 'POST', headers, body: {}})).status, 403);
  assert.equal((await request(app.app, {path: '/api/logout', method: 'POST', headers: {...headers, 'x-csrf-token': session.csrf}, body: {}})).status, 200);
  assert.equal((await request(app.app, {path: '/api/me', headers})).status, 401);
  const expired = await login();
  for (const row of pool.rows.values()) row.expires = String(Date.now() - 1);
  assert.equal((await request(app.app, {path: '/api/me', headers: {cookie: expired.cookie}})).status, 401);
  const revoked = await login();
  await store.transact(db => { db.users[0].active = false; });
  assert.equal((await request(app.app, {path: '/api/me', headers: {cookie: revoked.cookie}})).status, 401);
  assert.equal(pool.rows.size, 0);
});

test('health checks database readiness without leaking connection errors', async t => {
  const store = new MemoryStore(D.baseDb({password: 'SafeTapDemo123!'}));
  const app = createApplication(store);
  t.after(() => app.close());
  assert.equal((await request(app.app, {path: '/health'})).status, 200);
  store.ping = async () => { throw Error('provider-password-secret'); };
  const r = await request(app.app, {path: '/health'});
  assert.equal(r.status, 503);
  assert(!r.body.includes('provider-password-secret'));
  const calls = [];
  await new MysqlStore({query: async sql => calls.push(sql)}).ping();
  assert.deepEqual(calls, ['SELECT 1']);
});

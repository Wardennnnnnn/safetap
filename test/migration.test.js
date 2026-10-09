'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/domain');
const {schema} = require('../src/schema');
const {snapshot, validateSnapshot, importSnapshot, checksum} = require('../src/migration');

function directory() {
  const db = D.baseDb({demo: true, password: 'SafeTapDemo123!'});
  db.students[0].nfcUid = '04AABBCC';
  return db;
}
function fakePool({populated = false, failStudent = false} = {}) {
  let state = populated ? directory() : Object.fromEntries(D.TABLES.map(t => [t, []]));
  const operations = [];
  const pool = {
    operations,
    get db() {return structuredClone(state);},
    async query(sql) { operations.push(sql); return [{}]; },
    async getConnection() {
      let working = null;
      const conn = {
        async beginTransaction() {working = structuredClone(state);},
        async commit() {state = working; working = null; operations.push('COMMIT');},
        async rollback() {working = null; operations.push('ROLLBACK');},
        release() {},
        async query(sql) {
          operations.push(sql);
          const db = working || state;
          if (sql.includes('app_lock')) return [[{id: 1}]];
          const table = sql.match(/FROM `([^`]+)`/)?.[1];
          if (sql.includes('COUNT(*)')) return [[{count: db[table]?.length || 0}]];
          if (sql.startsWith('SELECT *')) return [structuredClone(db[table])];
          throw Error('Unexpected query');
        },
        async execute(sql, args) {
          operations.push(sql);
          if (sql.includes('information_schema')) return [[...D.TABLES, 'app_sessions'].map(name => ({name}))];
          const table = sql.match(/INSERT INTO `([^`]+)`/)?.[1];
          if (!table || !working) throw Error('Unexpected insert');
          if (table === 'students' && failStudent) throw Error('Simulated student insert failure');
          working[table].push(Object.fromEntries(Object.entries(schema[table]).map(([field, type], i) => [field, type === 'JSON' ? JSON.parse(args[i]) : args[i]])));
          return [{}];
        }
      };
      return conn;
    }
  };
  return pool;
}

test('directory export preserves identities and secrets without migrating operational history', () => {
  const db = directory();
  const before = structuredClone(db);
  const data = snapshot(db);
  assert.deepEqual(Object.keys(data.tables), ['blocks', 'rooms', 'users', 'students']);
  const original = db.students[0], migrated = data.tables.students.find(s => s.id === original.id);
  assert.equal(migrated.nfcUid, original.nfcUid);
  assert.equal(migrated.qrToken, original.qrToken);
  assert.equal(data.tables.users.find(u => u.id === db.users[0].id).passwordHash, db.users[0].passwordHash);
  assert.deepEqual(db, before);
  assert.equal(validateSnapshot(JSON.parse(JSON.stringify(data))).checksum, data.checksum);
});

test('migration rejects damaged exports, duplicate IDs/UIDs, and missing block references', () => {
  const db = directory();
  const corrupt = snapshot(db);
  corrupt.tables.students[0].name = 'Changed';
  assert.throws(() => validateSnapshot(corrupt), /checksum/);
  db.students[1].nfcUid = db.students[0].nfcUid;
  assert.throws(() => snapshot(db), /Duplicate NFC/);
  db.students[1].nfcUid = null;
  db.students[0].blockId = 'missing';
  assert.throws(() => snapshot(db), /missing block/);
  db.students[0].blockId = db.blocks[0].id;
  db.users[1].blockIds = ['missing'];
  assert.throws(() => snapshot(db), /representative block/);
  db.users[1].blockIds = [db.blocks[0].id];
  db.students[1].id = db.students[0].id;
  assert.throws(() => snapshot(db), /Duplicate ID/);
});

test('dry run is read-only; populated targets are refused before schema or data changes', async () => {
  const data = snapshot(directory());
  const empty = fakePool();
  await importSnapshot(empty, 'preview', data, {dryRun: true});
  assert(empty.operations.every(sql => sql.startsWith('SELECT')));
  assert.equal(empty.db.users.length, 0);
  const populated = fakePool({populated: true});
  const before = populated.db;
  await assert.rejects(importSnapshot(populated, 'production', data), /not empty/);
  assert.deepEqual(populated.db, before);
  assert(!populated.operations.some(sql => /CREATE|INSERT|COMMIT/.test(sql)));
});

test('import verifies records inside a transaction; any insert failure rolls all records back', async () => {
  const data = snapshot(directory());
  const pool = fakePool();
  await importSnapshot(pool, 'production', data);
  assert.equal(checksum(pool.db), data.checksum);
  assert.equal(pool.db.events.length, 0);
  assert.equal(pool.db.audit.length, 0);
  assert(pool.operations.includes('COMMIT'));
  const failed = fakePool({failStudent: true});
  await assert.rejects(importSnapshot(failed, 'production', data), /insert failure/);
  assert(failed.operations.includes('ROLLBACK'));
  for (const rows of Object.values(failed.db)) assert.equal(rows.length, 0);
});

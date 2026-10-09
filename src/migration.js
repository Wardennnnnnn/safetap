'use strict';
const {createHash} = require('node:crypto');
const {schema} = require('./schema');
const {TABLES} = require('./domain');
const {MysqlStore, migrate} = require('./store');
const selected = ['blocks', 'rooms', 'users', 'students'];
const fail = message => { throw new Error(message); };

function validateTables(tables) {
  if (!tables || Object.keys(tables).length !== selected.length || selected.some(t => !Array.isArray(tables[t]))) fail('Expected only blocks, rooms, users, and students.');
  for (const table of selected) {
    const ids = new Set();
    for (const row of tables[table]) {
      const fields = Object.keys(schema[table]);
      if (!row || Object.keys(row).length !== fields.length || fields.some(f => !Object.hasOwn(row, f))) fail(`Invalid field set in ${table}.`);
      for (const [field, type] of Object.entries(schema[table])) {
        const value = row[field];
        if (field === 'nfcUid' && value === null) continue;
        if (type.startsWith('VARCHAR')) {
          const limit = Number(type.match(/\d+/)[0]);
          if (typeof value !== 'string' || !value.trim() || [...value].length > limit) fail(`Invalid ${table}.${field}.`);
        } else if (type === 'BOOLEAN' && typeof value !== 'boolean') fail(`Invalid ${table}.${field}.`);
        else if (type === 'INT' && (!Number.isInteger(value) || value < 0)) fail(`Invalid ${table}.${field}.`);
        else if (type === 'JSON' && (!Array.isArray(value) || value.some(v => typeof v !== 'string'))) fail(`Invalid ${table}.${field}.`);
      }
      if (ids.has(row.id)) fail(`Duplicate ID in ${table}.`);
      ids.add(row.id);
    }
  }
  function unique(table, value, label) {
    const seen = new Set();
    for (const row of tables[table]) {
      const key = value(row);
      if (key === null) continue;
      if (seen.has(key)) fail(`Duplicate ${label}.`);
      seen.add(key);
    }
  }
  unique('blocks', b => JSON.stringify([b.program, b.code, b.term]), 'program/block/term');
  unique('users', u => u.username, 'username');
  unique('students', s => s.studentNumber, 'student number');
  unique('students', s => s.nfcUid, 'NFC ID');
  unique('students', s => s.qrToken, 'QR token');
  const blockIds = new Set(tables.blocks.map(b => b.id));
  if (!tables.users.some(u => u.role === 'admin' && u.active)) fail('An active administrator is required.');
  for (const b of tables.blocks) if (!['IT', 'CS'].includes(b.program)) fail('Unsupported block program.');
  for (const u of tables.users) {
    if (!['admin', 'rep'].includes(u.role) || !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(u.passwordHash)) fail('Invalid user role or password hash.');
    if (u.role === 'rep' && !u.blockIds.length || u.blockIds.some(id => !blockIds.has(id))) fail('Invalid representative block assignment.');
  }
  for (const s of tables.students) {
    if (!blockIds.has(s.blockId)) fail('Student references a missing block.');
    if (s.nfcUid !== null && (!/^[0-9A-F]{4,40}$/.test(s.nfcUid) || s.nfcUid.length % 2)) fail('Invalid normalized NFC ID.');
    if (!/^[a-f0-9]{48}$/.test(s.qrToken)) fail('Invalid QR token.');
  }
  for (const r of tables.rooms) if (r.floor < 1 || r.floor > 5 || r.floor === 5 && r.monitored) fail('Invalid room monitoring scope.');
  return tables;
}
function canonical(tables) {
  return Object.fromEntries(selected.map(t => [t, [...tables[t]].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(row => Object.fromEntries(Object.keys(schema[t]).map(f => [f, row[f]])))]));
}
function checksum(tables) { return createHash('sha256').update(JSON.stringify(canonical(tables))).digest('hex'); }
function snapshot(db) {
  const tables = canonical(Object.fromEntries(selected.map(t => [t, db[t]])));
  validateTables(tables);
  return {version: 1, selection: 'directory', exportedAt: new Date().toISOString(), checksum: checksum(tables), tables};
}
function validateSnapshot(data) {
  if (data?.version !== 1 || data.selection !== 'directory') fail('Unsupported migration format.');
  validateTables(data.tables);
  if (checksum(data.tables) !== data.checksum) fail('Export checksum mismatch.');
  return data;
}
function counts(data) { return Object.fromEntries(selected.map(t => [t, data.tables[t].length])); }
async function assertEmpty(conn, database) {
  const [available] = await conn.execute('SELECT TABLE_NAME AS name FROM information_schema.tables WHERE table_schema = ?', [database]);
  const names = new Set(available.map(r => r.name));
  for (const table of [...TABLES, 'app_sessions']) {
    if (!names.has(table)) continue;
    const [rows] = await conn.query(`SELECT COUNT(*) AS count FROM \`${table}\``);
    if (Number(rows[0].count)) fail(`Target is not empty (${table}). Import refused; no data replaced.`);
  }
}
async function importSnapshot(pool, database, data, {dryRun = false} = {}) {
  validateSnapshot(data);
  // Refuse a populated destination before applying any schema DDL.
  const preflight = await pool.getConnection();
  try { await assertEmpty(preflight, database); } finally { preflight.release(); }
  if (dryRun) return counts(data);
  await migrate(pool);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('SELECT id FROM app_lock WHERE id=1 FOR UPDATE');
    await assertEmpty(conn, database);
    for (const table of selected) {
      const fields = Object.keys(schema[table]);
      for (const row of data.tables[table]) {
        const values = fields.map(f => schema[table][f] === 'JSON' ? JSON.stringify(row[f]) : row[f]);
        await conn.execute(`INSERT INTO \`${table}\` (${fields.map(f => '`' + f + '`').join(',')}) VALUES (${fields.map(() => '?').join(',')})`, values);
      }
    }
    const actual = await new MysqlStore(pool).load(conn);
    if (checksum(actual) !== data.checksum) fail('Imported records differ from the export. Transaction rolled back.');
    await conn.commit();
    return counts(data);
  } catch (error) { await conn.rollback(); throw error; }
  finally { conn.release(); }
}
module.exports = {selected, snapshot, validateSnapshot, counts, checksum, importSnapshot};

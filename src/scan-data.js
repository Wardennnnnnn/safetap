'use strict';

const {TABLES, uid} = require('./domain');

// Only load records a batch can read or change. The store holds the write lock
// before calling this, so two phones cannot create two arrivals for one student.
async function loadScanData(conn, scans, userId, decode) {
  const db = Object.fromEntries(TABLES.map(table => [table, []]));
  async function select(table, where, values) {
    const [rows] = await conn.query(`SELECT * FROM \`${table}\` WHERE ${where}`, values);
    db[table] = rows.map(row => decode(table, row));
  }
  async function byIds(table, field, ids) {
    const values = [...new Set(ids.filter(value => typeof value === 'string'))];
    if (!values.length) return;
    await select(table, `\`${field}\` IN (${values.map(() => '?').join(',')})`, values);
  }
  await byIds('users', 'id', [userId]);
  await byIds('events', 'id', scans.map(scan => scan.eventId));
  await byIds('submissions', 'id', scans.map(scan => scan.submissionId));
  const ids = scans.filter(scan => ['manual', 'ocr'].includes(scan.method)).map(scan => scan.studentId);
  const nfc = scans.filter(scan => scan.method === 'nfc').map(scan => uid(scan.credential));
  const qr = scans.filter(scan => scan.method === 'qr').map(scan => String(scan.credential || '').replace(/^safetap:/, ''));
  const clauses = [], values = [];
  for (const [field, items] of [['id', ids], ['nfcUid', nfc], ['qrToken', qr]]) {
    const unique = [...new Set(items.filter(value => typeof value === 'string'))];
    if (!unique.length) continue;
    clauses.push(`\`${field}\` IN (${unique.map(() => '?').join(',')})`);
    values.push(...unique);
  }
  if (clauses.length) await select('students', clauses.join(' OR '), values);
  await byIds('blocks', 'id', db.students.map(student => student.blockId));
  const events = db.events.map(event => event.id);
  const students = db.students.map(student => student.id);
  if (events.length && students.length) {
    const where = `eventId IN (${events.map(() => '?').join(',')}) AND studentId IN (${students.map(() => '?').join(',')})`;
    for (const table of ['participants', 'checkins']) await select(table, where, [...events, ...students]);
  }
  return db;
}

module.exports = {loadScanData};

'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {parseArgs} = require('node:util');
const {mysqlPool, MysqlStore, poolConfig} = require('../src/store');
const {snapshot, validateSnapshot, counts, checksum, importSnapshot} = require('../src/migration');

async function main() {
  const {values, positionals} = parseArgs({allowPositionals: true, options: {
    input: {type: 'string'}, output: {type: 'string'}, 'dry-run': {type: 'boolean'},
    'allow-active-preview': {type: 'boolean'}
  }});
  const [command] = positionals;
  if (positionals.length !== 1 || !['export', 'import', 'verify'].includes(command)) throw new Error('Use export --output FILE, import --input FILE, or verify --input FILE; optional --dry-run.');
  let data;
  if (command !== 'export') {
    if (!values.input) throw new Error('--input is required.');
    data = validateSnapshot(JSON.parse(await fs.readFile(values.input, 'utf8')));
  } else if (!values['dry-run'] && !values.output) throw new Error('--output is required.');
  const pool = await mysqlPool();
  try {
    if (command === 'export') {
      const db = await new MysqlStore(pool).read();
      if (db.events.some(e => e.status === 'active') && !values['allow-active-preview']) throw new Error('Finish the active event and sync all phones before the final export. Use --allow-active-preview only for rehearsal.');
      data = snapshot(db);
      if (!values['dry-run']) {
        await fs.mkdir(path.dirname(path.resolve(values.output)), {recursive: true, mode: 0o700});
        await fs.writeFile(values.output, JSON.stringify(data, null, 2) + '\n', {flag: 'wx', mode: 0o600});
      }
    } else if (command === 'import') {
      await importSnapshot(pool, poolConfig().database, data, {dryRun: values['dry-run']});
    } else {
      const db = await new MysqlStore(pool).read();
      if (checksum(db) !== data.checksum) throw new Error('Directory verification failed. Target does not match the export.');
    }
    console.log(`${command}${values['dry-run'] ? ' dry run' : ''}: ${JSON.stringify(counts(data))}`);
    console.log('Directory IDs, password hashes, NFC IDs, and QR tokens validated.');
  } finally { await pool.end(); }
}
main().catch(error => {
  // SQL/connection errors can contain provider details; do not print them.
  console.error(error.code ? 'Database operation failed. Check connection settings, TLS certificate, and permissions.' : error.message);
  process.exitCode = 1;
});

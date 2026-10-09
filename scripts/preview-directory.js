'use strict';
// Fictional data for the disposable cloud rehearsal, never the real .env/data.
const fs = require('node:fs');
const path = require('node:path');
const {snapshot} = require('../src/migration');
const {baseDb} = require('../src/domain');
const {parseArgs} = require('node:util');
try {
  const {values} = parseArgs({options: {output: {type: 'string'}}});
  if (!values.output) throw Error('--output FILE is required.');
  const db = baseDb({demo: true, password: 'SafeTapDemo123!'});
  db.students[0].nfcUid = '04AABBCC';
  fs.mkdirSync(path.dirname(path.resolve(values.output)), {recursive: true, mode: 0o700});
  fs.writeFileSync(values.output, JSON.stringify(snapshot(db), null, 2) + '\n', {flag: 'wx', mode: 0o600});
  console.log('Fictional preview export ready. Demo account passwords: SafeTapDemo123!');
} catch (error) {console.error(error.message); process.exitCode = 1;}

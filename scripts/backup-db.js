'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {parseArgs} = require('node:util');
const {poolConfig} = require('../src/store');

function main() {
  const {values} = parseArgs({options: {output: {type: 'string'}}});
  if (!values.output) throw Error('Use --output FILE.sql. Existing files are never overwritten.');
  const config = poolConfig();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'safetap-dump-'));
  let fd;
  let opened = false;
  try {
    const options = path.join(temp, 'mysql.cnf');
    const quote = value => '"' + String(value ?? '').replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n').replaceAll('\r', '\\r') + '"';
    let text = '[client]\n' + Object.entries({host: config.host, port: config.port, user: config.user, password: config.password, protocol: 'TCP'}).map(([k, v]) => `${k}=${quote(v)}`).join('\n') + '\n';
    if (config.ssl) text += 'ssl-mode=VERIFY_IDENTITY\nssl-ca=' + quote(process.env.DB_SSL_CA_FILE) + '\n';
    fs.writeFileSync(options, text, {mode: 0o600});
    fs.mkdirSync(path.dirname(path.resolve(values.output)), {recursive: true, mode: 0o700});
    fd = fs.openSync(values.output, 'wx', 0o600);
    opened = true;
    const result = spawnSync('mysqldump', [`--defaults-extra-file=${options}`, '--single-transaction', '--no-tablespaces', '--set-gtid-purged=OFF', '--skip-add-locks', '--hex-blob', config.database], {stdio: ['ignore', fd, 'pipe']});
    fs.closeSync(fd); fd = undefined;
    if (result.status !== 0) throw Error('Backup failed. Check MySQL tools, connection settings, TLS, and SELECT permissions.');
    console.log('Full database backup saved; protect this file because it contains student data and login secrets.');
  } catch (error) {
    if (fd !== undefined) fs.closeSync(fd);
    if (opened) fs.rmSync(values.output, {force: true});
    throw error;
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
}
try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }

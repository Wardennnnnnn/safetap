'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {prepareSource, ENTRIES} = require('../scripts/prepare-repo');

test('source export includes essential files and excludes local notes, credentials and generated files', t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'safetap-export-'));
  t.after(() => fs.rmSync(folder, {recursive: true, force: true}));
  const root = path.join(folder, 'source');
  const output = path.join(folder, 'export');
  const put = (name, value = name) => {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, value);
  };
  for (const entry of ENTRIES) {
    if (['src', 'public', 'scripts', 'test', 'deploy', 'migrations'].includes(entry)) put(entry + '/included.js');
    else put(entry);
  }
  const excluded = [
    '.env', '.env.production', '.runtime/records.json', '.git/config',
    'node_modules/package/index.js', 'notes/private.md', 'private/credentials.txt',
    'DESIGN.md', 'PRODUCT.md', 'UI-REVIEW.md', 'MIGRATION.md', 'DEPLOYMENT-CHECK.md',
    'docs/internal-status.md', 'public/vendor/generated.js', 'src/provider.key',
    'src/.env.local', 'deploy/provider.pem', 'public/reference.pdf'
  ];
  for (const file of excluded) put(file, 'must stay local');
  fs.symlinkSync(path.join(root, '.env'), path.join(root, 'public/linked-secret.txt'));

  assert.equal(prepareSource({sourceRoot: root, output}), output);
  assert(fs.existsSync(path.join(output, 'src/included.js')));
  assert(fs.existsSync(path.join(output, '.env.example')));
  assert(fs.existsSync(path.join(output, '.gitignore')));
  assert(fs.existsSync(path.join(output, 'docs/deployment.md')));
  for (const file of [...excluded, 'public/linked-secret.txt']) {
    assert(!fs.existsSync(path.join(output, file)), `${file} must not be exported`);
  }
  assert.throws(() => prepareSource({sourceRoot: root, output}), /already exists/);
  assert.throws(() => prepareSource({sourceRoot: root, output: root}), /outside/);
  assert.throws(() => prepareSource({sourceRoot: root, output: path.join(root, 'public/export')}), /outside/);
});

test('failed export removes only its temporary copy and preserves the source', t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'safetap-export-failure-'));
  t.after(() => fs.rmSync(folder, {recursive: true, force: true}));
  const root = path.join(folder, 'source');
  const output = path.join(folder, 'export');
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.writeFileSync(path.join(root, 'src/app.js'), 'source stays');
  assert.throws(() => prepareSource({sourceRoot: root, output}), /ENOENT/);
  assert(!fs.existsSync(output));
  assert.deepEqual(fs.readdirSync(folder), ['source']);
  assert.equal(fs.readFileSync(path.join(root, 'src/app.js'), 'utf8'), 'source stays');
});

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {parseArgs} = require('node:util');

// Explicit publication list: internal notes never become release files merely
// because someone adds a new folder beside the app.
const ENTRIES = [
  'src', 'public', 'scripts', 'test', 'deploy', 'migrations',
  'server.js', 'package.json', 'package-lock.json', 'render.yaml',
  '.gitignore', '.env.example', 'README.md',
  'docs/architecture.md', 'docs/testing.md', 'docs/deployment.md'
];
const BLOCKED_EXTENSIONS = /\.(?:pem|key|dump|backup|log|pdf|tar\.gz)$/i;

function prepareSource({sourceRoot = path.resolve(__dirname, '..'), output} = {}) {
  const root = path.resolve(sourceRoot);
  const target = path.resolve(output || path.join(root, '.runtime/source-export'));
  const relativeTarget = path.relative(root, target);
  const firstFolder = relativeTarget.split(path.sep)[0];
  if (target === root || ENTRIES.includes(firstFolder) || firstFolder === 'docs') {
    throw new Error('Choose an output folder outside the published source folders.');
  }
  if (fs.existsSync(target)) throw new Error('Source export already exists. Choose a new output folder.');

  fs.mkdirSync(path.dirname(target), {recursive: true});
  const temporary = path.join(path.dirname(target), `.safetap-export-${randomUUID()}`);
  fs.mkdirSync(temporary);
  try {
    for (const entry of ENTRIES) {
      fs.cpSync(path.join(root, entry), path.join(temporary, entry), {
        recursive: true,
        filter(source) {
          const relative = path.relative(root, source).split(path.sep).join('/');
          if (fs.lstatSync(source).isSymbolicLink()) return false;
          if (relative === 'public/vendor' || relative.startsWith('public/vendor/')) return false;
          const name = path.basename(source);
          if (relative === '.env.example' || relative === '.gitignore') return true;
          return !name.startsWith('.env') && !name.startsWith('.git') && !BLOCKED_EXTENSIONS.test(name);
        }
      });
    }
    fs.renameSync(temporary, target);
    return target;
  } catch (error) {
    fs.rmSync(temporary, {recursive: true, force: true});
    throw error;
  }
}

if (require.main === module) {
  try {
    const {values} = parseArgs({options: {output: {type: 'string'}}});
    console.log('Source export ready: ' + prepareSource({output: values.output}));
    console.log('Only application source, tests, setup docs and deployment files were copied.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {prepareSource, ENTRIES};

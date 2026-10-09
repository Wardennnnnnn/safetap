'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const target = path.join(root, '.runtime/render-source');
const entries = ['src', 'public', 'scripts', 'test', 'deploy', 'migrations', 'server.js', 'package.json', 'package-lock.json', 'render.yaml', '.gitignore', '.env.example', 'README.md', 'TESTING.md', 'DESIGN.md', 'PRODUCT.md', 'UI-REVIEW.md', 'MIGRATION.md'];
if (fs.existsSync(target)) {
  console.error('Source export already exists. Use a new checkout for subsequent updates; nothing overwritten.');
  process.exitCode = 1;
} else {
  fs.mkdirSync(target, {recursive: true});
  try {
    for (const entry of entries) {
      fs.cpSync(path.join(root, entry), path.join(target, entry), {recursive: true, filter(source) {
        const rel = path.relative(root, source);
        return !fs.lstatSync(source).isSymbolicLink() && !rel.startsWith('public/vendor') && !/\.(pem|key|dump|backup)$/.test(source);
      }});
    }
    console.log('Clean source export: ' + target);
    console.log('No .env, runtime data, node_modules, vendor files, or certificates copied.');
  } catch (error) {
    console.error('Source export incomplete. Check required files before publishing.');
    process.exitCode = 1;
  }
}

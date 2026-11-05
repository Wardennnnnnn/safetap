'use strict';

const fs = require('node:fs');
const path = require('node:path');
const dest = path.join(__dirname, '../public/vendor');
fs.mkdirSync(dest, {
  recursive: true
});
function copy(packageName, relative, target) {
  const root = path.dirname(require.resolve(`${packageName}/package.json`));
  fs.copyFileSync(path.join(root, relative), path.join(dest, target || path.basename(relative)));
}
try {
  copy('html5-qrcode', 'html5-qrcode.min.js');
  // Remove generated OCR files left behind by an earlier build.
  for (const file of fs.readdirSync(dest)) {
    if (file.startsWith('tesseract') || ['worker.min.js', 'eng.traineddata.gz'].includes(file)) {
      fs.unlinkSync(path.join(dest, file));
    }
  }
  fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(['/vendor/html5-qrcode.min.js']));
  console.log('Local QR assets prepared.');
} catch (error) {
  console.error('Install dependencies with npm install, then run npm run vendor.\n' + error.message);
  process.exitCode = 1;
}

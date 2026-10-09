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
  copy('tesseract.js', 'dist/tesseract.min.js');
  copy('tesseract.js', 'dist/worker.min.js');
  const core = path.dirname(require.resolve('tesseract.js-core/package.json'));
  for (const file of fs.readdirSync(core)) if (/\.wasm(\.js)?$/.test(file)) fs.copyFileSync(path.join(core, file), path.join(dest, file));
  copy('@tesseract.js-data/eng', '4.0.0_best_int/eng.traineddata.gz', 'eng.traineddata.gz');
  fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(fs.readdirSync(dest).filter(f => f !== 'manifest.json').map(f => '/vendor/' + f)));
  console.log('Local QR and OCR assets prepared.');
} catch (error) {
  console.error('Install dependencies with npm install, then run npm run vendor.\n' + error.message);
  process.exitCode = 1;
}

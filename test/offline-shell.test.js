'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('installed shell contains all app dependencies and reloads offline without caching API responses', async () => {
  const listeners = new Map();
  const cached = new Map();
  const vendor = new Map([
    ['/vendor/html5-qrcode.min.js', 'QR library'],
    ['/vendor/tesseract.min.js', 'OCR library'],
    ['/vendor/worker.min.js', 'OCR worker'],
    ['/vendor/tesseract-core.wasm', 'OCR core'],
    ['/vendor/eng.traineddata.gz', 'OCR language data']
  ]);
  const network = [];
  let online = true;
  const context = vm.createContext({
    URL,
    location: {origin: 'https://safetap.test'},
    self: {
      addEventListener: (name, handler) => listeners.set(name, handler),
      skipWaiting: async () => {},
      clients: {claim: async () => {}}
    },
    caches: {
      open: async name => name === 'safetap-vendor-v1' ? {
        keys: async () => [...vendor.keys()].map(path => ({url: 'https://safetap.test' + path})),
        delete: async request => vendor.delete(new URL(request.url).pathname)
      } : ({
        addAll: async files => files.forEach(file => cached.set(file, {url: file})),
        put: async (request, response) => cached.set(request.url.replace('https://safetap.test', ''), response)
      }),
      match: async key => cached.get(typeof key === 'string' ? key : key.url.replace('https://safetap.test', '')),
      keys: async () => [],
      delete: async () => {}
    },
    fetch: async request => {
      network.push(request.url);
      if (!online) throw Error('Offline');
      return {ok: true, clone() {return this;}};
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8'), context);
  let installing;
  listeners.get('install')({waitUntil(promise) {installing = promise;}});
  await installing;
  let activating;
  listeners.get('activate')({waitUntil(promise) {activating = promise;}});
  await activating;
  assert.deepEqual([...vendor.keys()], ['/vendor/html5-qrcode.min.js'], 'upgrades remove OCR downloads and keep offline QR available');
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  for (const [, source] of html.matchAll(/(?:src|href)="(\/[^"#]+)"/g)) {
    assert(cached.has(source), `offline shell missing ${source}`);
  }
  assert.equal(new Set([...cached.keys()].filter(file => file.endsWith('.js') || file.includes('.js?')).map(file => file.split('?')[0])).size,
    [...cached.keys()].filter(file => file.endsWith('.js') || file.includes('.js?')).length, 'scripts are not downloaded twice during install');
  online = false;
  const dispatch = async (pathname, mode = 'cors') => {
    let response;
    listeners.get('fetch')({request: {url: 'https://safetap.test' + pathname, method:'GET', mode}, respondWith(promise) {response = promise;}});
    return response === undefined ? undefined : await response;
  };
  assert.equal((await dispatch('/', 'navigate')).url, '/index.html');
  assert.equal((await dispatch('/js/offline-controller.js?v=26-photo')).url, '/js/offline-controller.js?v=26-photo');
  assert.equal((await dispatch('/socket.io/socket.io.min.js')).url, '/socket.io/socket.io.min.js');
  assert.equal((await dispatch('/assets/alangilan-campus-2010.jpg')).url, '/assets/alangilan-campus-2010.jpg');
  assert.equal(await dispatch('/api/offline'), undefined);
  assert.equal(await dispatch('/api/session'), undefined);
  assert.equal(await dispatch('/health'), undefined);
  assert.equal(await dispatch('/socket.io/?transport=polling'), undefined);
  const before = network.length;
  online = true;
  await dispatch('/app.js?v=26-photo');
  assert.equal(network.length, before, 'unchanged versioned code does not download on reopening');
});

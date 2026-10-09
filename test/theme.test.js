'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../public/theme.js'), 'utf8');

function device({saved = null, dark = false, blocked = false} = {}) {
  const storage = new Map(saved ? [['safetap-theme', saved]] : []);
  const root = {dataset: {}, style: {}};
  const meta = {};
  let systemChange;
  const context = {
    window: {matchMedia: () => ({matches: dark, addEventListener: (_name, fn) => {systemChange = fn;}})},
    document: {documentElement: root, querySelector: () => meta, dispatchEvent() {}},
    Event,
    localStorage: {
      getItem: key => {if (blocked) throw Error('Storage blocked'); return storage.get(key) || null;},
      setItem: (key, value) => {if (blocked) throw Error('Storage blocked'); storage.set(key, value);}
    }
  };
  vm.runInNewContext(source, context);
  return {theme: context.window.SafeTapTheme, root, meta, storage, change: matches => systemChange({matches})};
}

test('appearance follows the device until a user chooses and survives reload', () => {
  const e = device({dark: true});
  assert.equal(e.root.dataset.theme, 'dark');
  e.change(false);
  assert.equal(e.theme.current, 'light');
  e.theme.toggle();
  e.change(false);
  assert.equal(e.theme.current, 'dark');
  assert.equal(device({saved: e.storage.get('safetap-theme')}).theme.current, 'dark');
  assert.equal(e.root.style.colorScheme, 'dark');
  assert.equal(e.meta.content, '#101923');
});

test('invalid preferences and unavailable storage do not break appearance switching', () => {
  assert.equal(device({saved: 'unexpected', dark: true}).theme.current, 'dark');
  const e = device({blocked: true});
  e.theme.toggle();
  assert.equal(e.root.dataset.theme, 'dark');
});

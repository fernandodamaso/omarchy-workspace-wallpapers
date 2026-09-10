'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { fs, path, root, load } = require('./cli-fixtures.cjs');
const read = file => { assert.ok(fs.existsSync(path.join(root, file)), 'Required implementation: ' + file); return fs.readFileSync(path.join(root, file), 'utf8'); };

test('service exposes typed apply capabilities and operation-specific completion', () => {
  const service = read('WorkspaceWallpapers.qml');
  for (const name of ['capabilities', 'applyConfig', 'operationStatus']) assert.match(service, new RegExp('function\\s+' + name + '\\('));
  assert.match(service, /ConfigApplyController\s*\{/);
  assert.match(service, /use-config-cli/);
});

test('configuration controller uses the tested engine and a service-owned helper without a shell', () => {
  const controller = read('ConfigApplyController.qml');
  assert.match(controller, /Apply\.createEngine\(/);
  assert.match(controller, /runtime-helper\.cjs/);
  assert.doesNotMatch(controller, /bash|sh",\s*"-c|startDetached|config\.json|watchChanges:\s*true/);
  assert.match(controller, /engine\.finish\(/);
  assert.match(controller, /engine\.load\(/);
  load('cli/runtime-store.cjs');
});

test('runtime writer does not import live CLI commands or write desired config', () => {
  const store = read('cli/runtime-store.cjs');
  assert.doesNotMatch(store, /writeConfig\(|cli\/main|config\.json|execSync|shell:\s*true/);
  const helper = read('cli/runtime-helper.cjs');
  assert.match(helper, /applyTransaction/);
  assert.match(helper, /inspectRuntime/);
});

'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { fs, path, root, fixture, put, inventory, invoke, load } = require('./cli-fixtures.cjs');
function runtimeFixture(t, scenario = 'success') {
  const f = fixture(t);
  const binDir = path.join(f.home, 'fake-bin'); fs.mkdirSync(binDir);
  const script = '#!' + process.execPath + '\nrequire(' + JSON.stringify(path.join(root, 'tests/fake-ipc.cjs')) + ');\n';
  put(path.join(binDir, 'omarchy-shell'), script); fs.chmodSync(path.join(binDir, 'omarchy-shell'), 0o755);
  f.env.PATH = binDir + ':' + process.env.PATH;
  f.env.FAKE_SCENARIO = scenario;
  put(f.config, { version: 1, assignments: { 'id:2': f.image } });
  return f;
}

test('apply dry-run reports additions without writing files or delivering an apply request', t => {
  const f = runtimeFixture(t);
  const before = inventory(f.home);
  const result = invoke(f, ['config', 'apply', '--dry-run']);
  assert.equal(result.phase, 'planned');
  assert.deepEqual(result.data.diff.added, ['id:2']);
  assert.deepEqual(inventory(f.home), before);
});

test('apply waits for a correlated completion and sends literal arguments without a shell', t => {
  const f = runtimeFixture(t);
  const result = invoke(f, ['config', 'apply']);
  assert.equal(result.phase, 'applied');
  assert.equal(result.data.renderVerification, 'unknown');
  const request = JSON.parse(fs.readFileSync(path.join(f.home, 'fake-request.json')));
  assert.equal(request.requestId, result.requestId);
  assert.equal(request.config.assignments['id:2'], f.image);
  assert.equal(fs.existsSync(path.join(f.home, 'NEVER_EXECUTE')), false);
  assert.equal(fs.existsSync(f.env.XDG_STATE_HOME), false, 'only the service owns applied writes');
});

test('accepted but uncompleted request returns timeout instead of false success', t => {
  const f = runtimeFixture(t, 'pending');
  const result = invoke(f, ['config', 'apply', '--timeout', '300'], 5);
  assert.equal(result.phase, 'unknown');
  assert.equal(result.data.retrySafe, false);
});

for (const [scenario, exit] of [['busy', 4], ['import-failure', 6], ['restart', 5], ['expired', 5], ['wrong-id', 5], ['lost-receipt', 5]]) {
  test('CLI handles ' + scenario + ' without blind retry or false success', t => {
    const f = runtimeFixture(t, scenario);
    invoke(f, ['config', 'apply', '--timeout', '1500'], exit);
    assert.ok(fs.existsSync(path.join(f.home, 'fake-request.json')));
  });
}

test('unavailable or incompatible runtime is explicit, never a fabricated dry-run', t => {
  const f = runtimeFixture(t, 'garbage');
  const before = inventory(f.home);
  invoke(f, ['config', 'apply', '--dry-run'], 3);
  assert.deepEqual(inventory(f.home), before);
  f.env.PATH = path.join(f.home, 'no-programs');
  invoke(f, ['config', 'apply', '--dry-run'], 3);
});

test('hung IPC is bounded by the command deadline', t => {
  const f = runtimeFixture(t, 'hang');
  const start = Date.now();
  invoke(f, ['status', '--timeout', '150'], 5);
  assert.ok(Date.now() - start < 3000);
});

test('status and doctor are read-only and timeout arguments are validated', t => {
  const f = runtimeFixture(t);
  const before = inventory(f.home);
  assert.equal(invoke(f, ['status']).data.runtime.sessionId, 'fake-session');
  assert.equal(invoke(f, ['doctor']).data.readOnly, true);
  assert.deepEqual(inventory(f.home), before);
  for (const timeout of ['-1', '0', 'NaN', '1.2', '9000000']) invoke(f, ['config', 'apply', '--timeout', timeout], 2);
});

test('dry-run detects content changes at unchanged paths and removed mappings', () => {
  const { diffConfig } = load('cli/live.cjs');
  const diff = diffConfig({ assignments: { 'id:2': '/a.png', 'id:3': '/b.png' } }, { 'id:2': { hash: 'new' }, 'id:3': { hash: 'b' } }, { sources: { 'id:1': '/old.png', 'id:2': '/a.png' }, sourceHashes: { 'id:2': 'old' }, assignments: { 'id:1': '/owned.png', 'id:2': '/owned2.png' } });
  assert.deepEqual(diff, { added: ['id:3'], changed: ['id:2'], removed: ['id:1'] });
});

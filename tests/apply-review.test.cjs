'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { fs, path, root, fixture, put, inventory, load } = require('./cli-fixtures.cjs');
const Config = require('../cli/config.cjs');
const Rules = require('../ConfigModel.js');
const Images = require('../cli/images.cjs');

function prepare(t) {
  const f = fixture(t);
  const store = load('cli/runtime-store.cjs');
  const config = Rules.validateConfig({ version: 1, assignments: { 'id:2': f.image } });
  const before = store.inspectRuntime(f.env);
  const images = Images.validateImages(config);
  const request = { schemaVersion: 1, requestId: crypto.randomUUID(), sessionId: 'review-session',
    expectedRevision: before.snapshot.revision, expectedToken: before.token,
    desiredHash: Config.configHash(config), config,
    sourceHashes: Object.fromEntries(Object.entries(images).map(([key, image]) => [key, image.hash])) };
  return { f, store, before, request };
}
function runHelper(f, args, exit = 0) {
  const result = spawnSync(process.execPath, [path.join(root, 'cli/runtime-helper.cjs'), ...args], {
    env: f.env, cwd: f.home, encoding: 'utf8', timeout: 10000
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, exit, result.stdout + result.stderr);
  const response = JSON.parse(result.stdout);
  assert.equal(response.ok, exit === 0);
  return response;
}

test('uncertain post-commit engine outcomes use exit class 5 rather than ordinary failure', t => {
  const { before, request } = prepare(t);
  const publications = [];
  const engine = load('ApplyModel.js').createEngine({ sessionId: 'review-session', validateConfig: Rules.validateConfig,
    run() {}, publish(runtime) { publications.push(runtime); }, changed() {} });
  engine.load(before);
  assert.equal(engine.accept(request).phase, 'accepted');
  engine.finish(request.requestId, { ok: false, code: 'durability-unknown', message: 'Post-commit durability is uncertain.', exitCode: 6, data: { committed: true } });
  const response = engine.operationStatus(request.requestId);
  assert.equal(response.phase, 'unknown');
  assert.equal(response.data.exitCode, 5);
  assert.equal(response.data.retrySafe, false);
  assert.equal(engine.capabilities().ready, false);
  assert.equal(engine.capabilities().revision, 0);
  assert.equal(publications.length, 1, 'unconfirmed state must not be published');
});

test('live CLI normalizes an unknown receipt to exit class 5 even when its producer reports 6', t => {
  const { request } = prepare(t);
  const response = { schemaVersion: 1, ok: false, command: 'config apply', requestId: request.requestId,
    phase: 'unknown', code: 'durability-unknown', message: 'Inspect persisted state before retrying.',
    data: { sessionId: request.sessionId, exitCode: 6, committed: true, retrySafe: false } };
  assert.throws(() => load('cli/live.cjs').checkedResult(response, request), error => {
    assert.equal(error.exitCode, 5);
    assert.equal(error.phase, 'unknown');
    assert.equal(error.data.retrySafe, false);
    return true;
  });
});

test('real service helper preserves desired and legacy bytes through apply and reload', t => {
  const { f, request } = prepare(t);
  put(f.config, request.config);
  const legacy = { version: 1, assignments: { 'id:7': f.image } };
  put(f.legacy, legacy);
  const before = runHelper(f, ['inspect']).data;
  request.expectedToken = before.token;
  const desiredBytes = fs.readFileSync(f.config);
  const legacyBytes = fs.readFileSync(f.legacy);
  const committed = runHelper(f, ['apply', JSON.stringify(request)]).data;
  assert.equal(committed.runtime.mode, 'applied');
  assert.equal(committed.runtime.snapshot.revision, 1);
  assert.deepEqual(runHelper(f, ['inspect']).data, committed.runtime);
  assert.deepEqual(fs.readFileSync(f.config), desiredBytes);
  assert.deepEqual(fs.readFileSync(f.legacy), legacyBytes);
  assert.equal(fs.existsSync(path.join(f.home, 'NEVER_EXECUTE')), false);
  assert.deepEqual(Object.keys(committed.runtime.snapshot.assignments), ['id:2']);
});

test('real helper rejects duplicate request keys without filesystem mutations', t => {
  const { f, request } = prepare(t);
  const before = inventory(f.home);
  const raw = JSON.stringify(request).replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1');
  const response = runHelper(f, ['apply', raw], 2);
  assert.equal(response.code, 'duplicate-key');
  assert.deepEqual(inventory(f.home), before);
});

test('explicit empty first apply establishes desired-state authority without deleting legacy data', t => {
  const { f, store, request } = prepare(t);
  put(f.legacy, { version: 1, assignments: { 'id:7': f.image } });
  const before = store.inspectRuntime(f.env);
  request.expectedToken = before.token;
  request.config = Rules.validateConfig({ version: 1, assignments: {} });
  request.desiredHash = Config.configHash(request.config);
  request.sourceHashes = {};
  const committed = store.applyTransaction(request, f.env);
  assert.equal(committed.runtime.mode, 'applied');
  assert.equal(committed.runtime.snapshot.revision, 1);
  assert.equal(Object.keys(committed.runtime.snapshot.assignments).length, 0);
  assert.ok(fs.existsSync(f.legacy));
  assert.equal(store.inspectRuntime(f.env).mode, 'applied');
});

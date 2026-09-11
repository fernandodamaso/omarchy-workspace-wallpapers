'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const { fs, path, fixture, put, inventory, load, png } = require('./cli-fixtures.cjs');
const Config = require('../cli/config.cjs');
const Rules = require('../ConfigModel.js');
const Images = require('../cli/images.cjs');
function request(f, assignments, runtime) {
  const config = Rules.validateConfig({ version: 1, assignments });
  const images = Images.validateImages(config);
  return { schemaVersion: 1, requestId: crypto.randomUUID(), sessionId: 'test-session', expectedRevision: runtime.snapshot.revision, expectedToken: runtime.token, desiredHash: Config.configHash(config), config, sourceHashes: Object.fromEntries(Object.entries(images).map(([key, image]) => [key, image.hash])) };
}
function stored(f) { return Config.pathsFor(f.env).applied; }

test('runtime inspection reads legacy state without creating directories or changing bytes', t => {
  const f = fixture(t);
  const Store = load('cli/runtime-store.cjs');
  put(f.legacy, { version: 1, assignments: { 'id:2': f.image } });
  const before = inventory(f.home);
  const state = Store.inspectRuntime(f.env);
  assert.equal(state.mode, 'legacy');
  assert.equal(state.snapshot.revision, 0);
  assert.equal(state.snapshot.assignments['id:2'], f.image);
  assert.deepEqual(inventory(f.home), before);
});

test('whole-map apply atomically creates owned applied state and leaves desired and legacy files untouched', t => {
  const f = fixture(t);
  const Store = load('cli/runtime-store.cjs');
  put(f.config, { version: 1, assignments: { 'id:99': f.image } });
  put(f.legacy, { version: 1, assignments: { 'id:7': f.image } });
  const desired = fs.readFileSync(f.config);
  const legacy = fs.readFileSync(f.legacy);
  const req = request(f, { 'id:2': f.image, 'name: Work 日本語 ': f.image }, Store.inspectRuntime(f.env));
  const result = Store.applyTransaction(req, f.env);
  assert.equal(result.runtime.mode, 'applied');
  assert.equal(result.runtime.snapshot.revision, 1);
  assert.equal(result.runtime.snapshot.requestId, req.requestId);
  assert.equal(result.runtime.snapshot.assignments['id:7'], undefined);
  for (const target of Object.values(result.runtime.snapshot.assignments)) {
    assert.ok(target.startsWith(Config.pathsFor(f.env).images + '/'));
    assert.deepEqual(fs.readFileSync(target), fs.readFileSync(f.image));
  }
  assert.equal(fs.statSync(stored(f)).mode & 0o777, 0o600);
  assert.deepEqual(Store.inspectRuntime(f.env), result.runtime);
  assert.deepEqual(fs.readFileSync(f.config), desired);
  assert.deepEqual(fs.readFileSync(f.legacy), legacy);
});

test('unchanged source bytes are a no-op but same-path replacement produces a new revision', t => {
  const f = fixture(t);
  const Store = load('cli/runtime-store.cjs');
  const first = Store.applyTransaction(request(f, { 'id:2': f.image }, Store.inspectRuntime(f.env)), f.env);
  const before = fs.readFileSync(stored(f));
  const same = Store.applyTransaction(request(f, { 'id:2': f.image }, first.runtime), f.env);
  assert.equal(same.unchanged, true);
  assert.deepEqual(fs.readFileSync(stored(f)), before);
  const changed = Buffer.from(png); changed[45] ^= 1; fs.writeFileSync(f.image, changed);
  const second = Store.applyTransaction(request(f, { 'id:2': f.image }, same.runtime), f.env);
  assert.equal(second.unchanged, false);
  assert.equal(second.runtime.snapshot.revision, 2);
  assert.notEqual(second.runtime.snapshot.assignments['id:2'], first.runtime.snapshot.assignments['id:2']);
  assert.ok(fs.existsSync(first.runtime.snapshot.assignments['id:2']), 'old image is retained');
});

test('failure on a later source never publishes a partially applied map', t => {
  const f = fixture(t);
  const Store = load('cli/runtime-store.cjs');
  const first = Store.applyTransaction(request(f, { 'id:1': f.image }, Store.inspectRuntime(f.env)), f.env);
  const before = fs.readFileSync(stored(f));
  const req = request(f, { 'id:2': f.image }, first.runtime);
  req.config.assignments['id:3'] = path.join(f.home, 'missing.png');
  req.sourceHashes['id:3'] = 'a'.repeat(64);
  req.desiredHash = Config.configHash(req.config);
  assert.throws(() => Store.applyTransaction(req, f.env));
  assert.deepEqual(fs.readFileSync(stored(f)), before);
  assert.equal(fs.existsSync(stored(f) + '.lock'), false);
});

test('stale runtime revisions and source changes between CLI and service are rejected', t => {
  const f = fixture(t);
  const Store = load('cli/runtime-store.cjs');
  const req = request(f, { 'id:2': f.image }, Store.inspectRuntime(f.env));
  const applied = Store.applyTransaction(req, f.env);
  assert.throws(() => Store.applyTransaction({ ...req, requestId: crypto.randomUUID() }, f.env), { code: 'stale-revision' });
  const next = request(f, { 'id:3': f.image }, applied.runtime);
  const changed = Buffer.from(png); changed[45] ^= 1; fs.writeFileSync(f.image, changed);
  assert.throws(() => Store.applyTransaction(next, f.env), { code: 'source-changed' });
  assert.equal(Store.inspectRuntime(f.env).snapshot.revision, 1);
});

test('applied save failures preserve the last good snapshot and clean only owned temporary files', t => {
  const f = fixture(t);
  const Store = load('cli/runtime-store.cjs');
  const first = Store.applyTransaction(request(f, { 'id:1': f.image }, Store.inspectRuntime(f.env)), f.env);
  const before = fs.readFileSync(stored(f));
  const io = new Proxy(fs, { get(target, key) { return key === 'renameSync' ? () => { throw Object.assign(new Error('disk error'), { code: 'EIO' }); } : target[key]; } });
  assert.throws(() => Store.applyTransaction(request(f, { 'id:2': f.image }, first.runtime), f.env, io));
  assert.deepEqual(fs.readFileSync(stored(f)), before);
  assert.deepEqual(fs.readdirSync(path.dirname(stored(f))), ['applied.json']);
});

test('invalid or symlink applied state is not silently replaced by legacy data', t => {
  const f = fixture(t);
  const Store = load('cli/runtime-store.cjs');
  put(f.legacy, { version: 1, assignments: { 'id:2': f.image } });
  put(stored(f), '{"schemaVersion":99}');
  assert.throws(() => Store.inspectRuntime(f.env));
  fs.unlinkSync(stored(f)); fs.symlinkSync(f.config, stored(f));
  assert.throws(() => Store.inspectRuntime(f.env), { code: 'unsafe-config-target' });
});

test('malformed payloads and forged desired hashes cannot create runtime state', t => {
  const f = fixture(t);
  const Store = load('cli/runtime-store.cjs');
  const req = request(f, { 'id:2': f.image }, Store.inspectRuntime(f.env));
  const before = inventory(f.home);
  for (const bad of [{ ...req, schemaVersion: 2 }, { ...req, extra: true }, { ...req, desiredHash: 'f'.repeat(64) }, { ...req, requestId: '__proto__' }, { ...req, expectedRevision: -1 }, { ...req, sourceHashes: {} }]) assert.throws(() => Store.applyTransaction(bad, f.env));
  assert.deepEqual(inventory(f.home), before);
});

test('runtime lock conflicts preserve another writer lock and applied data', t => {
  const f = fixture(t);
  const Store = load('cli/runtime-store.cjs');
  const req = request(f, { 'id:2': f.image }, Store.inspectRuntime(f.env));
  put(stored(f) + '.lock', 'another writer');
  const before = inventory(f.home);
  assert.throws(() => Store.applyTransaction(req, f.env), { code: 'runtime-busy' });
  assert.deepEqual(inventory(f.home), before);
});

test('corrupted owned assets are never reused or overwritten as a successful no-op', t => {
  const f = fixture(t);
  const Store = load('cli/runtime-store.cjs');
  const first = Store.applyTransaction(request(f, { 'id:2': f.image }, Store.inspectRuntime(f.env)), f.env);
  const image = first.runtime.snapshot.assignments['id:2'];
  fs.chmodSync(image, 0o600); fs.writeFileSync(image, 'corrupt');
  const before = fs.readFileSync(stored(f));
  assert.throws(() => Store.applyTransaction(request(f, { 'id:2': f.image }, first.runtime), f.env), { code: 'asset-conflict' });
  assert.deepEqual(fs.readFileSync(stored(f)), before);
  assert.equal(fs.readFileSync(image, 'utf8'), 'corrupt');
});

function engineFixture(t) {
  const f = fixture(t);
  const Store = load('cli/runtime-store.cjs');
  const Apply = load('ApplyModel.js');
  const runs = [], publications = [];
  const engine = Apply.createEngine({ sessionId: 'test-session', validateConfig: Rules.validateConfig, run: req => runs.push(req), publish: value => publications.push(value), changed: () => {} });
  engine.load(Store.inspectRuntime(f.env));
  return { f, Store, engine, runs, publications };
}

test('accepted request is not success and unrelated/late completions cannot overwrite active work', t => {
  const { f, Store, engine, runs, publications } = engineFixture(t);
  const req = request(f, { 'id:2': f.image }, Store.inspectRuntime(f.env));
  assert.equal(engine.accept(req).phase, 'accepted');
  assert.equal(engine.operationStatus(req.requestId).phase, 'accepted');
  assert.equal(engine.capabilities().revision, 0);
  assert.equal(runs.length, 1);
  assert.equal(engine.finish('unrelated', { ok: true }), false);
  const second = { ...req, requestId: crypto.randomUUID() };
  assert.equal(engine.accept(second).code, 'runtime-busy');
  const committed = Store.applyTransaction(req, f.env);
  engine.finish(req.requestId, { ok: true, data: committed });
  assert.equal(engine.operationStatus(req.requestId).phase, 'applied');
  assert.equal(engine.operationStatus(req.requestId).data.renderVerification, 'unknown');
  assert.equal(engine.capabilities().revision, 1);
  assert.equal(publications.length, 2, 'initial state plus one committed map');
  assert.equal(engine.finish(req.requestId, { ok: false }), false);
});

test('request replay is correlated and a reused ID with different payload is a conflict', t => {
  const { f, Store, engine, runs } = engineFixture(t);
  const req = request(f, { 'id:2': f.image }, Store.inspectRuntime(f.env));
  engine.accept(req);
  assert.equal(engine.accept(req).phase, 'accepted');
  assert.equal(runs.length, 1);
  assert.equal(engine.accept({ ...req, desiredHash: 'a'.repeat(64) }).code, 'request-conflict');
  engine.finish(req.requestId, { ok: false, code: 'import-failed', message: 'failed', exitCode: 6 });
  assert.equal(engine.operationStatus(req.requestId).ok, false);
  assert.equal(engine.capabilities().revision, 0);
});

test('restart rejects old-session requests and unknown completion is never reported as success', t => {
  const { f, Store, engine } = engineFixture(t);
  const req = request(f, { 'id:2': f.image }, Store.inspectRuntime(f.env));
  assert.equal(engine.accept({ ...req, sessionId: 'old-session' }).code, 'session-changed');
  assert.equal(engine.operationStatus(req.requestId).code, 'unknown-operation');
  assert.equal(engine.operationStatus(req.requestId).ok, false);
  assert.equal(engine.operationStatus(req.requestId).data.exitCode, 5);
});

test('failed persistence and uncertain post-commit outcomes retain the last published map', t => {
  const { f, Store, engine, publications } = engineFixture(t);
  const req = request(f, { 'id:2': f.image }, Store.inspectRuntime(f.env));
  engine.accept(req);
  engine.finish(req.requestId, { ok: false, code: 'durability-unknown', exitCode: 6, message: 'Inspect state.', data: { committed: true } });
  assert.equal(engine.operationStatus(req.requestId).phase, 'unknown');
  assert.equal(engine.capabilities().ready, false);
  assert.equal(engine.capabilities().revision, 0);
  assert.equal(publications.length, 1);
});

test('completed operation retention is bounded and expired IDs return unknown', t => {
  const { f, Store, engine } = engineFixture(t);
  let first;
  for (let n = 0; n < 70; n++) {
    const req = request(f, { 'id:2': f.image }, Store.inspectRuntime(f.env));
    if (!first) first = req.requestId;
    engine.accept(req);
    engine.finish(req.requestId, { ok: false, code: 'test-failure', message: 'failure', exitCode: 6 });
  }
  assert.equal(engine.operationStatus(first).code, 'unknown-operation');
  assert.equal(engine.view().operationCount, 64);
});

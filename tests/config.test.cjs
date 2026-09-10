'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { fs, path, root, png, fixture, put, inventory, load } = require('./cli-fixtures.cjs');
const empty = () => ({ version: 1, assignments: {} });

test('strict desired configuration preserves exact keys and literal image paths', () => {
  const { parseConfig, configHash } = load('cli/config.cjs');
  const value = { version: 1, assignments: { 'name: Work 日本語 ': '/tmp/$(touch NO); a.PNG', 'id:9007199254740991': '/tmp/b.webp' } };
  assert.deepEqual(JSON.parse(JSON.stringify(parseConfig(JSON.stringify(value)))), value);
  assert.equal(configHash(value), configHash({ assignments: { 'id:9007199254740991': '/tmp/b.webp', 'name: Work 日本語 ': '/tmp/$(touch NO); a.PNG' }, version: 1 }));
});

test('strict JSON rejects duplicate decoded properties and malformed input', () => {
  const { parseConfig } = load('cli/config.cjs');
  for (const raw of ['{"version":1,"version":1,"assignments":{}}', '{"version":1,"assignments":{"id:2":"/a.png","id:\\u0032":"/b.png"}}', '{"version":1,"assignments":{},}', '{"version":01,"assignments":{}}', '{}{}', '{"version":NaN}', '{"version":1,"assignments":{/*comment*/}}']) {
    assert.throws(() => parseConfig(raw), undefined, raw);
  }
});

test('new configuration rejects invalid shapes versions unknown fields and unsafe keys', () => {
  const { parseConfig } = load('cli/config.cjs');
  for (const value of [null, [], {}, { version: '1', assignments: {} }, { version: 2, assignments: {} }, { version: 1, assignments: [] }, { version: 1, assignments: null }, { ...empty(), extra: true }]) {
    assert.throws(() => parseConfig(JSON.stringify(value)));
  }
  for (const key of ['id:0', 'id:-1', 'id:01', 'id:1.0', 'id:9007199254740992', 'id:1000000000000000000000', 'name:', 'name:special', 'name:special:term', 'name:a\n', '__proto__', 'constructor', 'prototype']) {
    assert.throws(() => parseConfig(JSON.stringify({ version: 1, assignments: { [key]: '/tmp/a.png' } })), undefined, key);
  }
  assert.equal({}.polluted, undefined);
});

test('new configuration rejects unsupported paths rather than sanitizing them', () => {
  const { parseConfig } = load('cli/config.cjs');
  for (const value of ['/a.gif', 'file:///a.png', 'https://x/a.png', '~/a.png', 'a.png', '/a\t.png', '/a\u0001.png', '/a\u007f.png', null, 3, {}]) {
    assert.throws(() => parseConfig(JSON.stringify({ version: 1, assignments: { 'id:1': value } })));
  }
});

test('published schema is generated from the same structural rules', () => {
  const model = load('ConfigModel.js');
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas/config.schema.json'), 'utf8'));
  assert.deepEqual(schema, model.schema());
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ['version', 'assignments']);
  const keyRule = new RegExp(schema.properties.assignments.propertyNames.pattern);
  for (const key of ['id:1', 'id:123', 'id:9007199254740991', 'name: 日本語 ', 'name:constructor', 'id:0', 'id:01', 'id:9007199254740992', 'name:special', 'name:a\n']) {
    assert.equal(keyRule.test(key), model.validKey(key), key);
  }
  model.validateConfig(JSON.parse(fs.readFileSync(path.join(root, 'examples/config.json'), 'utf8')));
});

test('all accepted keys and paths round-trip through the existing renderer model', () => {
  const model = load('ConfigModel.js');
  const legacy = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, 'WorkspaceModel.js'), 'utf8'), legacy);
  for (const key of ['id:1', 'id:9007199254740991', 'name: Work 日本語 ', 'name:constructor']) {
    assert.equal(model.validKey(key), true);
    assert.equal(legacy.normalizeWorkspaceKey(key), key);
  }
  assert.equal(legacy.normalizeImagePath('/a b; $(foo).PNG'), '/a b; $(foo).PNG');
});

test('image validation reads bytes checks MIME and reports missing images', t => {
  const f = fixture(t);
  const { inspectImage } = load('cli/images.cjs');
  assert.equal(inspectImage(f.image).mime, 'image/png');
  const bad = path.join(f.home, 'not-image.png');
  put(bad, 'not an image');
  assert.throws(() => inspectImage(bad), { code: 'unsupported-image' });
  assert.throws(() => inspectImage(path.join(f.home, 'missing.png')), { code: 'image-unavailable' });
  assert.throws(() => inspectImage(f.home), { code: 'unsupported-image' });
});

test('same source path with different bytes has a different content hash', t => {
  const f = fixture(t);
  const { inspectImage } = load('cli/images.cjs');
  const before = inspectImage(f.image).hash;
  const changed = Buffer.from(png);
  changed[45] ^= 1;
  fs.writeFileSync(f.image, changed);
  assert.notEqual(inspectImage(f.image).hash, before);
});

test('config writer creates restrictive files and detects stale revisions', t => {
  const f = fixture(t);
  const { readConfig, writeConfig } = load('cli/config.cjs');
  writeConfig(f.config, empty(), { expectedRevision: null, createOnly: true });
  assert.equal(fs.statSync(f.config).mode & 0o777, 0o600);
  const before = readConfig(f.config);
  const next = { version: 1, assignments: { 'id:2': f.image } };
  writeConfig(f.config, next, { expectedRevision: before.revision });
  assert.throws(() => writeConfig(f.config, empty(), { expectedRevision: before.revision }), { code: 'config-conflict' });
  assert.equal(readConfig(f.config).config.assignments['id:2'], f.image);
  assert.deepEqual(fs.readdirSync(path.dirname(f.config)), ['config.json']);
});

test('config writer never overwrites an existing file in create-only mode', t => {
  const f = fixture(t);
  const { writeConfig, readConfig } = load('cli/config.cjs');
  put(f.config, empty());
  const before = fs.readFileSync(f.config);
  assert.throws(() => writeConfig(f.config, empty(), { createOnly: true, expectedRevision: readConfig(f.config).revision }), { code: 'config-exists' });
  assert.deepEqual(fs.readFileSync(f.config), before);
});

test('config reader and writer refuse symlink targets including dangling links', t => {
  const f = fixture(t);
  const { readConfig, writeConfig } = load('cli/config.cjs');
  fs.mkdirSync(path.dirname(f.config), { recursive: true });
  fs.symlinkSync(path.join(f.home, 'missing-target'), f.config);
  assert.throws(() => readConfig(f.config, { allowMissing: true }), { code: 'unsafe-config-target' });
  assert.throws(() => writeConfig(f.config, empty(), { expectedRevision: null }), { code: 'unsafe-config-target' });
  assert.equal(fs.existsSync(path.join(f.home, 'missing-target')), false);
});

test('cooperative lock conflict preserves both config and another writers lock', t => {
  const f = fixture(t);
  const { writeConfig, readConfig } = load('cli/config.cjs');
  put(f.config, empty());
  put(f.config + '.lock', 'another writer');
  const before = inventory(f.home);
  assert.throws(() => writeConfig(f.config, empty(), { expectedRevision: readConfig(f.config).revision }), { code: 'config-busy' });
  assert.deepEqual(inventory(f.home), before);
});

test('failed rename or precommit fsync preserves old bytes and cleans owned temp files', t => {
  const f = fixture(t);
  const { writeConfig, readConfig } = load('cli/config.cjs');
  put(f.config, empty());
  const snapshot = readConfig(f.config);
  for (const method of ['renameSync', 'fsyncSync']) {
    const io = new Proxy(fs, { get(target, key) { return key === method ? () => { throw Object.assign(new Error('injected disk error'), { code: 'EIO' }); } : target[key]; } });
    assert.throws(() => writeConfig(f.config, { version: 1, assignments: { 'id:2': f.image } }, { expectedRevision: snapshot.revision }, io));
    assert.equal(readConfig(f.config).revision, snapshot.revision);
    assert.deepEqual(fs.readdirSync(path.dirname(f.config)), ['config.json']);
  }
});

test('permission failures do not create a successful result or alter existing config', t => {
  const f = fixture(t);
  const { writeConfig, readConfig } = load('cli/config.cjs');
  put(f.config, empty());
  const snapshot = readConfig(f.config);
  const io = new Proxy(fs, { get(target, key) { return key === 'openSync' ? (file, flags, mode) => { if (file === f.config + '.lock') throw Object.assign(new Error('denied'), { code: 'EACCES' }); return fs.openSync(file, flags, mode); } : target[key]; } });
  assert.throws(() => writeConfig(f.config, empty(), { expectedRevision: snapshot.revision }, io));
  assert.equal(readConfig(f.config).revision, snapshot.revision);
});

test('external edits during staging are detected before replacement', t => {
  const f = fixture(t);
  const { writeConfig, readConfig } = load('cli/config.cjs');
  put(f.config, empty());
  const before = readConfig(f.config);
  let edited = false;
  const external = { version: 1, assignments: { 'name: External': f.image } };
  const io = new Proxy(fs, { get(target, key) { return key === 'fsyncSync' ? fd => { fs.fsyncSync(fd); if (!edited) { edited = true; put(f.config, external); } } : target[key]; } });
  assert.throws(() => writeConfig(f.config, empty(), { expectedRevision: before.revision }, io), { code: 'config-conflict' });
  assert.deepEqual(JSON.parse(fs.readFileSync(f.config, 'utf8')), external);
});

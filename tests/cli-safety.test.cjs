'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { fs, path, png, fixture, put, inventory, invoke, load } = require('./cli-fixtures.cjs');

// These checks exercise the published offline boundary independently of the
// transaction service. A runtime apply must never be needed for safe editing.
test('migration refuses an existing malformed config without modifying any files', t => {
  const f = fixture(t);
  put(f.legacy, { version: 1, assignments: { 'id:2': f.image } });
  put(f.config, '{not valid JSON');
  const before = inventory(f.home);
  assert.equal(invoke(f, ['config', 'migrate', '--dry-run'], 4).code, 'config-exists');
  assert.equal(invoke(f, ['config', 'migrate'], 4).code, 'config-exists');
  assert.deepEqual(inventory(f.home), before);
});

test('atomic initial publication preserves a competing file created after validation', t => {
  const f = fixture(t);
  const { writeConfig, readConfig } = load('cli/config.cjs');
  const winner = { version: 1, assignments: { 'name: Concurrent 日本語': f.image } };
  const io = new Proxy(fs, { get(target, key) {
    if (key === 'linkSync') return (from, to) => {
      // A noncooperating editor wins in the last window before publication.
      put(to, winner);
      return fs.linkSync(from, to);
    };
    return target[key];
  } });
  assert.throws(() => writeConfig(f.config, { version: 1, assignments: {} },
    { expectedRevision: null, createOnly: true }, io), error => error.exitCode === 4);
  assert.deepEqual(JSON.parse(JSON.stringify(readConfig(f.config).config)), winner);
  assert.deepEqual(fs.readdirSync(path.dirname(f.config)), ['config.json']);
});

test('post-replacement fsync failure reports committed state instead of claiming rollback', t => {
  const f = fixture(t);
  const { writeConfig, readConfig } = load('cli/config.cjs');
  put(f.config, { version: 1, assignments: {} });
  const before = readConfig(f.config);
  const next = { version: 1, assignments: { 'id:2': f.image } };
  let replaced = false;
  const io = new Proxy(fs, { get(target, key) {
    if (key === 'renameSync') return (from, to) => { fs.renameSync(from, to); replaced = true; };
    if (key === 'fsyncSync') return fd => {
      if (replaced) throw Object.assign(new Error('injected directory durability failure'), { code: 'EIO' });
      return fs.fsyncSync(fd);
    };
    return target[key];
  } });
  assert.throws(() => writeConfig(f.config, next, { expectedRevision: before.revision }, io), error => {
    assert.equal(error.exitCode, 6);
    assert.equal(error.data.committed, true);
    return true;
  });
  assert.deepEqual(JSON.parse(JSON.stringify(readConfig(f.config).config)), next);
  assert.deepEqual(fs.readdirSync(path.dirname(f.config)), ['config.json']);
});

test('writer cleanup does not unlink a replacement lock owned by another process', t => {
  const f = fixture(t);
  const { writeConfig, readConfig } = load('cli/config.cjs');
  put(f.config, { version: 1, assignments: {} });
  const before = readConfig(f.config);
  const lock = f.config + '.lock';
  let replaced = false;
  const io = new Proxy(fs, { get(target, key) {
    if (key === 'fsyncSync') return fd => {
      fs.fsyncSync(fd);
      if (!replaced) {
        replaced = true;
        fs.unlinkSync(lock);
        fs.writeFileSync(lock, 'replacement writer', { mode: 0o600 });
      }
    };
    return target[key];
  } });
  writeConfig(f.config, { version: 1, assignments: { 'id:2': f.image } }, { expectedRevision: before.revision }, io);
  assert.equal(fs.readFileSync(lock, 'utf8'), 'replacement writer');
});

test('validation rejects invalid UTF-8 and oversized configuration without changing it', t => {
  const f = fixture(t);
  for (const bytes of [Buffer.from([0xff, 0xfe, 0x7b]), Buffer.alloc(1048577, 0x20)]) {
    put(f.config, bytes);
    const before = inventory(f.home);
    invoke(f, ['config', 'validate'], 2);
    assert.deepEqual(inventory(f.home), before);
  }
});

test('MIME mismatch and animated PNG cannot be assigned to desired configuration', t => {
  const f = fixture(t);
  const wrongExtension = path.join(f.home, 'wrong.jpg');
  put(wrongExtension, png);
  invoke(f, ['assign', 'id:2', wrongExtension], 2);
  assert.equal(fs.existsSync(f.config), false);
  // Insert an APNG animation control chunk after IHDR. The static-container
  // boundary rejects acTL before any decoder or import process is involved.
  const animation = Buffer.alloc(20);
  animation.writeUInt32BE(8, 0);
  animation.write('acTL', 4, 'ascii');
  animation.writeUInt32BE(2, 8);
  const animated = path.join(f.home, 'animated.png');
  put(animated, Buffer.concat([png.subarray(0, 33), animation, png.subarray(33)]));
  const before = inventory(f.home);
  assert.equal(invoke(f, ['assign', 'id:2', animated], 2).code, 'unsupported-image');
  assert.deepEqual(inventory(f.home), before);
});

'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { fs, path, root, fixture, put, inventory, invoke } = require('./cli-fixtures.cjs');

test('CLI help and version are machine-readable without creating configuration', t => {
  const f = fixture(t);
  const before = inventory(f.home);
  assert.match(invoke(f, ['--help']).data.help, /config validate/);
  assert.equal(invoke(f, ['--version']).data.version, '0.1.0');
  assert.deepEqual(inventory(f.home), before);
  assert.ok(fs.statSync(path.join(root, 'bin/workspace-wallpapers')).mode & 0o111);
});

test('assign and clear edit desired config only, preserving names and shell metacharacters', t => {
  const f = fixture(t);
  put(f.legacy, { version: 1, assignments: { 'id:7': f.image } });
  const legacy = fs.readFileSync(f.legacy);
  assert.equal(invoke(f, ['assign', 'name: Work 日本語 ', f.image]).data.applyRequired, true);
  assert.equal(JSON.parse(fs.readFileSync(f.config, 'utf8')).assignments['name: Work 日本語 '], f.image);
  assert.equal(invoke(f, ['clear', 'name: Work 日本語 ']).data.applyRequired, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.config, 'utf8')).assignments, {});
  assert.deepEqual(fs.readFileSync(f.legacy), legacy);
  assert.equal(fs.existsSync(f.env.XDG_STATE_HOME), false);
  assert.equal(fs.existsSync(f.env.XDG_DATA_HOME), false);
  assert.equal(fs.existsSync(path.join(f.home, 'NEVER_EXECUTE')), false);
});

test('validation is read-only and reports malformed JSON and missing images', t => {
  const f = fixture(t);
  put(f.config, { version: 1, assignments: { 'id:2': f.image } });
  const before = inventory(f.home);
  assert.equal(invoke(f, ['config', 'validate']).phase, 'validated');
  assert.deepEqual(inventory(f.home), before);
  put(f.config, '{"version":1,"version":1,"assignments":{}}');
  invoke(f, ['config', 'validate'], 2);
  put(f.config, { version: 1, assignments: { 'id:2': path.join(f.home, 'missing.png') } });
  assert.equal(invoke(f, ['config', 'validate'], 2).code, 'image-unavailable');
});

test('migration dry-run creates nothing and migration preserves every legacy byte', t => {
  const f = fixture(t);
  put(f.legacy, { version: 1, assignments: { 'id:2': f.image } });
  put(path.join(path.dirname(f.legacy), 'preferences.json'), '{"thumbnailSize":"large"}\n');
  put(path.join(path.dirname(f.legacy), 'history.json'), '{"recent":[]}\n');
  const before = inventory(f.home);
  assert.equal(invoke(f, ['config', 'migrate', '--dry-run']).data.applyRequired, true);
  assert.deepEqual(inventory(f.home), before);
  invoke(f, ['config', 'migrate']);
  assert.deepEqual(inventory(path.dirname(f.legacy)), before.find(e => e[0] === '.config')[1].find(e => e[0] === 'omarchy')[1].find(e => e[0] === 'workspace-wallpapers')[1]);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.config, 'utf8')), { version: 1, assignments: { 'id:2': f.image } });
  const after = inventory(f.home);
  assert.equal(invoke(f, ['config', 'migrate'], 4).code, 'config-exists');
  assert.deepEqual(inventory(f.home), after);
});

test('invalid legacy state cannot silently migrate to an empty desired map', t => {
  const f = fixture(t);
  put(f.legacy, { version: 1, assignments: { 'id:01': f.image } });
  const before = inventory(f.home);
  invoke(f, ['config', 'migrate'], 2);
  assert.deepEqual(inventory(f.home), before);
});

test('default HOME and explicit config paths use one desired store', t => {
  const f = fixture(t);
  delete f.env.XDG_CONFIG_HOME;
  const defaultPath = path.join(f.home, '.config/omarchy/workspace-wallpapers/config.json');
  invoke(f, ['assign', 'id:2', f.image]);
  assert.ok(fs.existsSync(defaultPath));
  const custom = path.join(f.home, 'custom', 'desired.json');
  invoke(f, ['assign', 'id:3', f.image, '--config', custom]);
  invoke(f, ['config', 'validate', '--config', custom]);
  assert.equal(JSON.parse(fs.readFileSync(defaultPath)).assignments['id:3'], undefined);
  assert.equal(JSON.parse(fs.readFileSync(custom)).assignments['id:3'], f.image);
});

test('CLI rejects bad arguments reserved state targets and symlink config paths', t => {
  const f = fixture(t);
  for (const args of [['assign', 'id:01', f.image], ['clear'], ['config', 'validate', '--unknown'], ['assign', 'id:2', f.image, '--dry-run'], ['assign', 'id:2', f.image, '--config', f.legacy], ['config', 'validate', '--config', 'relative.json']]) invoke(f, args, 2);
  fs.mkdirSync(path.dirname(f.config), { recursive: true });
  fs.symlinkSync(path.join(f.home, 'absent'), f.config);
  assert.equal(invoke(f, ['assign', 'id:2', f.image], 2).code, 'unsafe-config-target');
});

test('spawned CLI respects a live cooperating writer lock without deleting it', async t => {
  const f = fixture(t);
  put(f.config, { version: 1, assignments: {} });
  const lock = f.config + '.lock';
  const child = spawn(process.execPath, ['-e', 'const fs=require("node:fs"); const p=process.argv[1]; const fd=fs.openSync(p,"wx",0o600); process.stdout.write("ready"); process.stdin.once("data",()=>{fs.closeSync(fd);fs.unlinkSync(p);});', lock], { stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  await once(child.stdout, 'data');
  assert.equal(invoke(f, ['assign', 'id:2', f.image], 4).code, 'config-busy');
  assert.ok(fs.existsSync(lock));
  const exited = once(child, 'exit');
  child.stdin.end('release');
  await exited;
  invoke(f, ['assign', 'id:2', f.image]);
  assert.equal(fs.existsSync(lock), false);
});

 test('offline commands never invoke the live Omarchy IPC executable', t => {
  const f = fixture(t);
  const trap = path.join(f.home, 'trap');
  fs.mkdirSync(trap);
  const marker = path.join(f.home, 'IPC_CALLED');
  put(path.join(trap, 'omarchy-shell'), '#!/bin/sh\nprintf called > "$HOME/IPC_CALLED"\nexit 1\n');
  fs.chmodSync(path.join(trap, 'omarchy-shell'), 0o755);
  f.env.PATH = trap + ':' + process.env.PATH;
  invoke(f, ['assign', 'id:2', f.image]);
  invoke(f, ['config', 'validate']);
  invoke(f, ['clear', 'id:2']);
  assert.equal(fs.existsSync(marker), false);
});

'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wallpapers-cli-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, 'config'), XDG_STATE_HOME: path.join(home, 'state'), XDG_DATA_HOME: path.join(home, 'data') };
  const config = path.join(env.XDG_CONFIG_HOME, 'omarchy/workspace-wallpapers/config.json');
  const legacy = path.join(home, '.config/omarchy/workspace-wallpapers/assignments.json');
  const image = path.join(home, 'Work 日本語 $(touch NEVER_EXECUTE); image.png');
  fs.writeFileSync(image, png);
  return { home, env, config, legacy, image };
}
function put(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value));
}
function inventory(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).map(e => {
    const file = path.join(dir, e.name);
    return e.isDirectory() ? [e.name, inventory(file)] : [e.name, fs.lstatSync(file).isSymbolicLink() ? fs.readlinkSync(file) : fs.readFileSync(file).toString('hex')];
  });
}
function load(file) {
  assert.ok(fs.existsSync(path.join(root, file)), `Implementation required: ${file}`);
  return require(path.join(root, file));
}
function invoke(f, args, exit = 0) {
  const bin = path.join(root, 'bin/workspace-wallpapers');
  assert.ok(fs.existsSync(bin), 'Agent CLI executable must exist');
  const result = spawnSync(process.execPath, [bin, ...args, '--json'], { env: f.env, encoding: 'utf8', timeout: 10000, cwd: f.home });
  assert.equal(result.error, undefined);
  assert.equal(result.status, exit, result.stderr + result.stdout);
  const value = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(value).sort(), ['schemaVersion', 'ok', 'command', 'requestId', 'phase', 'code', 'message', 'data'].sort());
  assert.equal(value.schemaVersion, 1);
  assert.equal(value.ok, exit === 0);
  if (exit !== 0) assert.ok(result.stderr.trim(), 'Failures have stderr diagnostics');
  return value;
}
module.exports = { fs, path, root, png, fixture, put, inventory, load, invoke };

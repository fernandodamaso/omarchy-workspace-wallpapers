'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Model = require('../ConfigModel.js');
const { failure } = require('./result.cjs');
const MAX_CONFIG_BYTES = 1048576;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const parseConfig = raw => Model.validateConfig(Model.parseJson(raw));
const canonicalConfig = config => JSON.stringify(Model.validateConfig(config));
const configHash = config => hash(canonicalConfig(config));

function absolute(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || /[\u0000-\u001f\u007f]/.test(value))
    throw failure('invalid-path', label + ' must be an absolute path without control characters.', 2);
  return path.resolve(value);
}
function pathsFor(env = process.env, override) {
  const home = absolute(env.HOME, 'HOME');
  const configHome = absolute(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'XDG_CONFIG_HOME');
  const stateHome = absolute(env.XDG_STATE_HOME || path.join(home, '.local/state'), 'XDG_STATE_HOME');
  const dataHome = absolute(env.XDG_DATA_HOME || path.join(home, '.local/share'), 'XDG_DATA_HOME');
  const suffix = 'omarchy/workspace-wallpapers';
  const config = absolute(override === undefined ? path.join(configHome, suffix, 'config.json') : override, '--config');
  if (['assignments.json', 'preferences.json', 'history.json', 'applied.json'].includes(path.basename(config)))
    throw failure('reserved-config-path', 'Desired config must not use an applied or legacy state filename.', 2);
  return { config, legacy: path.join(home, '.config', suffix, 'assignments.json'), applied: path.join(stateHome, suffix, 'applied.json'), images: path.join(dataHome, suffix, 'images') };
}

function readRaw(file, allowMissing = false, io = fs) {
  let fd;
  try {
    const entry = io.lstatSync(file);
    if (!entry.isFile() || entry.isSymbolicLink()) throw failure('unsafe-config-target', 'Configuration target must be a regular non-symlink file.', 2);
    fd = io.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const info = io.fstatSync(fd);
    if (!info.isFile() || info.size > MAX_CONFIG_BYTES) throw failure('invalid-config', 'Configuration must be a regular file no larger than 1 MiB.', 2);
    const bytes = Buffer.alloc(MAX_CONFIG_BYTES + 1);
    let size = 0;
    while (size < bytes.length) {
      const n = io.readSync(fd, bytes, size, bytes.length - size, null);
      if (!n) break;
      size += n;
    }
    if (size > MAX_CONFIG_BYTES) throw failure('invalid-config', 'Configuration exceeds 1 MiB.', 2);
    const content = bytes.subarray(0, size);
    let raw;
    try { raw = new TextDecoder('utf-8', { fatal: true }).decode(content); }
    catch { throw failure('invalid-json', 'Configuration must contain valid UTF-8 JSON.', 2); }
    return { raw, revision: hash(content) };
  } catch (error) {
    if (error.code === 'ENOENT' && allowMissing && fd === undefined) return { raw: null, revision: null };
    if (error.code === 'ELOOP') throw failure('unsafe-config-target', 'Symlink configuration targets are refused.', 2);
    if (error.code === 'ENOENT') throw failure('config-missing', 'No configuration exists at ' + file + '. Use assign or config migrate.', 2);
    throw error;
  } finally {
    if (fd !== undefined) io.closeSync(fd);
  }
}
function readConfig(file, options = {}, io = fs) {
  const snapshot = readRaw(file, options.allowMissing === true, io);
  return { ...snapshot, config: snapshot.raw === null ? { version: 1, assignments: Object.create(null) } : parseConfig(snapshot.raw) };
}

// Same-directory lock serializes cooperating CLI writers. Hash checks detect
// external edits, but rename is not a CAS against noncooperating editors.
function writeConfig(file, value, options, io = fs) {
  file = absolute(file, 'Configuration');
  const config = Model.validateConfig(value);
  const bytes = Buffer.from(JSON.stringify(config, null, 2) + '\n');
  if (bytes.length > MAX_CONFIG_BYTES) throw failure('invalid-config', 'Configuration exceeds 1 MiB.', 2);
  if (!options || !Object.hasOwn(options, 'expectedRevision')) throw failure('missing-revision', 'A previous config revision is required for safe writing.', 2);
  const dir = path.dirname(file);
  const lockPath = file + '.lock';
  const temp = path.join(dir, '.' + path.basename(file) + '.' + crypto.randomUUID() + '.tmp');
  let lockFd, tempFd, dirFd, lockInfo;
  let ownsTemp = false;
  let committed = false;
  try {
    io.mkdirSync(dir, { recursive: true, mode: 0o700 });
    try { lockFd = io.openSync(lockPath, 'wx', 0o600); }
    catch (error) { if (error.code === 'EEXIST') throw failure('config-busy', 'Another writer holds ' + lockPath + '; do not remove a live lock.', 4); throw error; }
    lockInfo = io.fstatSync(lockFd);
    io.writeFileSync(lockFd, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }) + '\n');
    const current = readRaw(file, true, io);
    if (options.createOnly && current.revision !== null) throw failure('config-exists', 'Existing desired configuration is never overwritten by migration.', 4);
    if (current.revision !== options.expectedRevision) throw failure('config-conflict', 'Configuration changed; reread it before editing.', 4);
    dirFd = io.openSync(dir, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
    tempFd = io.openSync(temp, 'wx', 0o600);
    ownsTemp = true;
    io.writeFileSync(tempFd, bytes);
    io.fchmodSync(tempFd, 0o600);
    io.fsyncSync(tempFd);
    io.fsyncSync(dirFd);
    if (readRaw(file, true, io).revision !== current.revision) throw failure('config-conflict', 'An external editor changed configuration during this operation.', 4);
    if (current.revision === null || options.createOnly) {
      // Atomic no-replace creation, including a file appearing after the check.
      try { io.linkSync(temp, file); }
      catch (error) { if (error.code === 'EEXIST') throw failure('config-conflict', 'Configuration appeared during creation; nothing was overwritten.', 4); throw error; }
    } else io.renameSync(temp, file);
    committed = true;
    io.fsyncSync(dirFd);
    return { config, revision: hash(bytes), applyRequired: true };
  } catch (error) {
    if (committed) throw failure('durability-unknown', 'Configuration was replaced, but durability confirmation failed. Inspect it before retrying.', 6, { committed: true, path: file });
    throw error;
  } finally {
    if (tempFd !== undefined) io.closeSync(tempFd);
    if (ownsTemp) { try { io.unlinkSync(temp); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
    if (dirFd !== undefined) io.closeSync(dirFd);
    if (lockFd !== undefined) {
      io.closeSync(lockFd);
      try {
        const current = io.lstatSync(lockPath);
        if (lockInfo && current.ino === lockInfo.ino && current.dev === lockInfo.dev) io.unlinkSync(lockPath);
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
}
module.exports = { MAX_CONFIG_BYTES, absolute, pathsFor, parseConfig, canonicalConfig, configHash, readRaw, readConfig, writeConfig };

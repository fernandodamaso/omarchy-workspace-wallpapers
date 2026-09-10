'use strict';
// Private service worker: the live CLI never imports this writer.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Rules = require('../ConfigModel.js');
const Apply = require('../ApplyModel.js');
const Config = require('./config.cjs');
const Images = require('./images.cjs');
const { failure } = require('./result.cjs');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function inspectRuntime(env = process.env, io = fs) {
  const paths = Config.pathsFor(env);
  const applied = Config.readRaw(paths.applied, true, io);
  if (applied.raw !== null) {
    const snapshot = Apply.validateSnapshot(Rules.parseJson(applied.raw), Rules.validateConfig, paths.images);
    if (Config.configHash({ version: 1, assignments: snapshot.sources }) !== snapshot.desiredHash)
      throw failure('invalid-applied-state', 'Persisted desired hash does not match its source map.', 6);
    return { mode: 'applied', token: applied.revision, snapshot, statePath: paths.applied, imageDirectory: paths.images };
  }
  const legacy = Config.readConfig(paths.legacy, { allowMissing: true }, io);
  return { mode: 'legacy', token: legacy.revision || 'missing', statePath: paths.legacy, imageDirectory: paths.images,
    snapshot: { revision: 0, desiredHash: '', assignments: legacy.config.assignments, sources: legacy.config.assignments, sourceHashes: {}, requestId: '', sessionId: '' } };
}
function sameBaseline(a, b) { return a.mode === b.mode && a.token === b.token && a.snapshot.revision === b.snapshot.revision; }
function privateDirectory(dir, io) {
  io.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const info = io.lstatSync(dir);
  if (!info.isDirectory() || info.isSymbolicLink()) throw failure('unsafe-storage', 'Storage directory must not be a symlink: ' + dir, 6);
}
function existingAsset(file, expectedHash, io) {
  try {
    const entry = io.lstatSync(file);
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('Not a regular owned file');
    if (Images.inspectImage(file, io).hash !== expectedHash) throw new Error('Content hash mismatch');
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw failure('asset-conflict', 'Owned image is corrupt, changed or unsafe; it was not overwritten: ' + file, 6);
  }
}
function importAsset(image, directory, io, warnings) {
  const destination = path.join(directory, image.hash + '.' + image.extension);
  if (existingAsset(destination, image.hash, io)) return destination;
  const temporary = path.join(directory, '.image-' + crypto.randomUUID() + '.tmp');
  let fd, dirFd, owns = false;
  try {
    fd = io.openSync(temporary, 'wx', 0o600); owns = true;
    io.writeFileSync(fd, image.bytes);
    io.fchmodSync(fd, 0o400);
    io.fsyncSync(fd);
    dirFd = io.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
    try { io.linkSync(temporary, destination); }
    catch (error) { if (error.code !== 'EEXIST' || !existingAsset(destination, image.hash, io)) throw error; }
    io.fsyncSync(dirFd);
    return destination;
  } finally {
    for (const close of [() => { if (fd !== undefined) io.closeSync(fd); }, () => { if (dirFd !== undefined) io.closeSync(dirFd); }, () => { if (owns) io.unlinkSync(temporary); }]) {
      try { close(); } catch (error) { if (error.code !== 'ENOENT') warnings.push('Asset temporary-file cleanup needs inspection: ' + temporary); }
    }
  }
}

function applyTransaction(value, env = process.env, io = fs) {
  const request = Apply.validateRequest(value, Rules.validateConfig);
  if (Buffer.byteLength(JSON.stringify(request)) > 65536) throw failure('request-too-large', 'Apply request exceeds the 64 KiB IPC limit.', 2);
  if (Config.configHash(request.config) !== request.desiredHash) throw failure('invalid-request', 'Desired hash does not match the validated configuration.', 2);
  const paths = Config.pathsFor(env);
  const directory = path.dirname(paths.applied);
  const lockPath = paths.applied + '.lock';
  const temporary = path.join(directory, '.applied-' + crypto.randomUUID() + '.tmp');
  const warnings = [];
  let lockFd, lockInfo, tempFd, dirFd, ownsTemp = false, committed = false;
  let result, problem;
  try {
    privateDirectory(directory, io);
    try { lockFd = io.openSync(lockPath, 'wx', 0o600); }
    catch (error) { if (error.code === 'EEXIST') throw failure('runtime-busy', 'A runtime writer holds ' + lockPath + '. Do not remove an active lock.', 4); throw error; }
    lockInfo = io.fstatSync(lockFd);
    io.writeFileSync(lockFd, JSON.stringify({ pid: process.pid, requestId: request.requestId, createdAt: new Date().toISOString() }) + '\n');
    const before = inspectRuntime(env, io);
    if (before.snapshot.revision !== request.expectedRevision || before.token !== request.expectedToken)
      throw failure('stale-revision', 'Runtime state changed since the request was prepared.', 4);
    const metadata = Images.validateImages(request.config, io);
    for (const key of Object.keys(metadata)) if (metadata[key].hash !== request.sourceHashes[key])
      throw failure('source-changed', 'Source bytes changed since CLI validation: ' + metadata[key].path, 4);
    const assignments = Object.create(null);
    const imported = new Map();
    if (Object.keys(metadata).length) privateDirectory(paths.images, io);
    for (const key of Object.keys(metadata)) {
      const meta = metadata[key];
      if (!imported.has(meta.path)) {
        const image = Images.inspectImage(meta.path, io);
        if (image.hash !== meta.hash) throw failure('source-changed', 'Source changed while staging imports: ' + meta.path, 4);
        imported.set(meta.path, importAsset(image, paths.images, io, warnings));
      }
      assignments[key] = imported.get(meta.path);
    }
    if (!sameBaseline(before, inspectRuntime(env, io))) throw failure('stale-revision', 'An external writer changed runtime state during staging.', 4);
    if (before.mode === 'applied' && before.snapshot.desiredHash === request.desiredHash
        && Apply.sameMap(before.snapshot.sourceHashes, request.sourceHashes) && Apply.sameMap(before.snapshot.assignments, assignments)) {
      result = { runtime: before, unchanged: true, warnings };
    } else {
      if (before.snapshot.revision >= Number.MAX_SAFE_INTEGER) throw failure('revision-exhausted', 'Applied revision is exhausted; no state was replaced.', 6);
      const snapshot = Apply.validateSnapshot({ schemaVersion: 1, revision: before.snapshot.revision + 1, desiredHash: request.desiredHash,
        assignments, sources: request.config.assignments, sourceHashes: request.sourceHashes, requestId: request.requestId, sessionId: request.sessionId }, Rules.validateConfig, paths.images);
      const bytes = Buffer.from(JSON.stringify(snapshot, null, 2) + '\n');
      if (bytes.length > Config.MAX_CONFIG_BYTES) throw failure('snapshot-too-large', 'Applied snapshot exceeds the storage limit.', 2);
      dirFd = io.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
      tempFd = io.openSync(temporary, 'wx', 0o600); ownsTemp = true;
      io.writeFileSync(tempFd, bytes);
      io.fchmodSync(tempFd, 0o600);
      io.fsyncSync(tempFd);
      io.fsyncSync(dirFd);
      if (!sameBaseline(before, inspectRuntime(env, io))) throw failure('stale-revision', 'Runtime state changed before commit; nothing was replaced.', 4);
      if (before.mode === 'applied') io.renameSync(temporary, paths.applied);
      else {
        try { io.linkSync(temporary, paths.applied); }
        catch (error) { if (error.code === 'EEXIST') throw failure('stale-revision', 'Applied state appeared during first apply.', 4); throw error; }
      }
      committed = true;
      io.fsyncSync(dirFd);
      result = { runtime: { mode: 'applied', token: digest(bytes), snapshot, statePath: paths.applied, imageDirectory: paths.images }, unchanged: false, warnings };
    }
  } catch (error) {
    problem = committed ? failure('durability-unknown', 'Complete snapshot was published but durability is uncertain. Inspect persisted status before retrying.', 6, { committed: true }) : error;
  } finally {
    const cleanup = [
      () => { if (tempFd !== undefined) io.closeSync(tempFd); },
      () => { if (ownsTemp) io.unlinkSync(temporary); },
      () => { if (dirFd !== undefined) io.closeSync(dirFd); },
      () => { if (lockFd !== undefined) io.closeSync(lockFd); },
      () => { if (lockInfo) { const entry = io.lstatSync(lockPath); if (entry.ino === lockInfo.ino && entry.dev === lockInfo.dev) io.unlinkSync(lockPath); } }
    ];
    for (const operation of cleanup) {
      try { operation(); } catch (error) { if (error.code !== 'ENOENT') warnings.push('Inspect private runtime lock/temp cleanup at ' + directory + ' (' + error.code + ').'); }
    }
  }
  if (problem) {
    if (warnings.length) problem.data = { ...problem.data, warnings };
    throw problem;
  }
  return result;
}
module.exports = { inspectRuntime, applyTransaction };

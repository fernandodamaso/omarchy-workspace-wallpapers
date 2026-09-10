'use strict';
const fs = require('node:fs');
const { setTimeout: sleep } = require('node:timers/promises');
const Config = require('./config.cjs');
const Rules = require('../ConfigModel.js');
const { validateImages } = require('./images.cjs');
const { createClient } = require('./ipc.cjs');
const { failure, envelope } = require('./result.cjs');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function capabilities(value) {
  if (!object(value) || value.schemaVersion !== 1 || value.protocolVersion !== 1
      || typeof value.sessionId !== 'string' || !value.sessionId || value.sessionId.length > 128 || /[^A-Za-z0-9-]/.test(value.sessionId)
      || typeof value.ready !== 'boolean' || typeof value.busy !== 'boolean'
      || !['legacy', 'applied', 'unavailable'].includes(value.mode)
      || !Number.isSafeInteger(value.revision) || value.revision < 0
      || !(value.token === 'missing' || typeof value.token === 'string' && /^[a-f0-9]{64}$/.test(value.token))
      || !Array.isArray(value.features) || !['applyConfig', 'operationStatus'].every(name => value.features.includes(name))
      || !object(value.limits) || !Number.isInteger(value.limits.maxRequestBytes) || value.limits.maxRequestBytes < 1 || value.limits.maxRequestBytes > 65536
      || !object(value.assignments) || !object(value.sources) || !object(value.sourceHashes))
    throw failure('runtime-incompatible', 'Runtime lacks the supported v1 apply protocol. Install the complete candidate; do not fall back to legacy mutations.', 3);
  try {
    Rules.validateConfig({ version: 1, assignments: value.assignments });
    Rules.validateConfig({ version: 1, assignments: value.sources });
  } catch { throw failure('runtime-protocol', 'Runtime returned invalid assignment maps.', 3); }
  return value;
}
function diffConfig(config, images, runtime) {
  const added = [], changed = [], removed = [];
  for (const key of Object.keys(config.assignments).sort()) {
    if (!Object.hasOwn(runtime.assignments, key)) added.push(key);
    else if (runtime.sources[key] !== config.assignments[key] || runtime.sourceHashes[key] !== images[key].hash) changed.push(key);
  }
  for (const key of Object.keys(runtime.assignments).sort()) if (!Object.hasOwn(config.assignments, key)) removed.push(key);
  return { added, changed, removed };
}
function unknown(code, message, data = {}) { return failure(code, message, 5, { ...data, retrySafe: false }); }
function checkedResult(value, request) {
  if (!object(value) || value.schemaVersion !== 1 || value.command !== 'config apply'
      || value.requestId !== request.requestId || !object(value.data) || value.data.sessionId !== request.sessionId
      || typeof value.ok !== 'boolean' || typeof value.code !== 'string' || typeof value.message !== 'string')
    throw unknown('completion-unknown', 'The response belongs to another request/session or is malformed. Inspect status before retrying.');
  if (!value.ok) {
    const code = [2, 3, 4, 5, 6].includes(value.data.exitCode) ? value.data.exitCode : 6;
    if (value.phase === 'unknown') throw Object.assign(failure(value.code, value.message, 5, { ...value.data, exitCode: 5, retrySafe: false }), { phase: 'unknown' });
    throw failure(value.code, value.message, code, value.data);
  }
  if (value.phase === 'accepted') return value;
  if (!['applied', 'unchanged'].includes(value.phase) || value.data.desiredHash !== request.desiredHash
      || !Number.isSafeInteger(value.data.revision)
      || value.data.revision !== request.expectedRevision + (value.phase === 'applied' ? 1 : 0))
    throw unknown('completion-unknown', 'Runtime did not confirm this complete configuration at the expected revision.');
  return { ...value, data: { ...value.data, renderVerification: 'unknown' } };
}
function lockDiagnostic(file) {
  try {
    const entry = fs.lstatSync(file);
    return { path: file, present: true, regular: entry.isFile() && !entry.isSymbolicLink(), action: 'Establish writer liveness before removing an abandoned lock; never auto-remove.' };
  } catch (error) {
    if (error.code === 'ENOENT') return { path: file, present: false };
    return { path: file, present: null, error: error.code };
  }
}
async function executeLive(parsed, requestId, env = process.env, clientFactory = createClient) {
  const { command, options } = parsed;
  const client = clientFactory(env, options.timeout || 10000);
  const success = (phase, message, data) => envelope(command, requestId, phase, 'ok', message, data);
  if (command === 'status') {
    const runtime = capabilities(await client.call('capabilities'));
    return success('read', 'Runtime status; rendered pixels are not verified by this command.', { runtime, renderVerification: 'unknown' });
  }
  const paths = Config.pathsFor(env, options.config);
  if (command === 'doctor') {
    const diagnostics = { readOnly: true, node: process.versions.node, configPath: paths.config,
      locks: [lockDiagnostic(paths.config + '.lock'), lockDiagnostic(paths.applied + '.lock')], renderVerification: 'unknown' };
    let problem;
    try {
      const desired = Config.readConfig(paths.config, { allowMissing: true });
      diagnostics.desired = { exists: desired.revision !== null, revision: desired.revision,
        images: desired.revision === null ? {} : validateImages(desired.config) };
      if (desired.revision === null) diagnostics.guidance = 'No desired config exists. Inspect config migrate --dry-run or create desired assignments.';
    } catch (error) { diagnostics.configError = { code: error.code, message: error.message }; problem = error; }
    try {
      diagnostics.runtime = capabilities(await client.call('capabilities'));
      if (!diagnostics.runtime.ready) throw failure('runtime-unavailable', 'Runtime is not ready. Inspect lastError and restore valid applied state before reload.', 3);
    } catch (error) { diagnostics.runtimeError = { code: error.code, message: error.message }; problem = problem || error; }
    if (!problem && diagnostics.locks.some(lock => lock.present !== false)) problem = failure('writer-lock', 'A writer lock exists or cannot be inspected. Check its owner; no changes were made.', 4);
    if (problem) throw failure(problem.code || 'doctor-failed', problem.message, problem.exitCode || 6, diagnostics);
    return success('read', 'Read-only diagnostics completed; no host changes were made.', diagnostics);
  }
  const desired = Config.readConfig(paths.config);
  const images = validateImages(desired.config);
  const runtime = capabilities(await client.call('capabilities'));
  if (!runtime.ready) throw failure('runtime-unavailable', 'Runtime is not ready. Inspect doctor/status and recover the applied snapshot before applying.', 3);
  if (runtime.busy) throw failure('runtime-busy', 'Another runtime transaction is active.', 4);
  const request = {
    schemaVersion: 1, requestId, sessionId: runtime.sessionId, expectedRevision: runtime.revision, expectedToken: runtime.token,
    desiredHash: Config.configHash(desired.config), config: desired.config,
    sourceHashes: Object.fromEntries(Object.entries(images).map(([key, image]) => [key, image.hash]))
  };
  const serialized = JSON.stringify(request);
  if (Buffer.byteLength(serialized) > runtime.limits.maxRequestBytes) throw failure('request-too-large', 'Serialized apply request exceeds the runtime 64 KiB IPC limit. Reduce the map or path lengths.', 2);
  if (Config.readRaw(paths.config).revision !== desired.revision) throw failure('config-conflict', 'Desired configuration changed during validation. Reread it before applying.', 4);
  if (options['dry-run']) return success('planned', 'Apply preview only; no imports, locks or state writes.', {
    configPath: paths.config, desiredHash: request.desiredHash, expectedRevision: runtime.revision, sessionId: runtime.sessionId,
    diff: diffConfig(desired.config, images, runtime), applyRequired: true, renderVerification: 'unknown'
  });
  let receipt;
  try { receipt = await client.call('applyConfig', [serialized]); }
  catch (error) { throw unknown('completion-unknown', 'Apply delivery/completion could not be confirmed. Inspect status; do not blindly retry.', { cause: error.code, sessionId: runtime.sessionId, desiredHash: request.desiredHash }); }
  let result = checkedResult(receipt, request);
  while (result.phase === 'accepted') {
    if (!client.remaining()) throw unknown('timeout', 'Apply completion deadline expired. The service may still commit; inspect status before any retry.', { sessionId: runtime.sessionId, desiredHash: request.desiredHash });
    await sleep(Math.min(40, client.remaining()));
    let value;
    try { value = await client.call('operationStatus', [requestId]); }
    catch (error) { throw unknown(error.exitCode === 5 ? 'timeout' : 'completion-unknown', 'Cannot confirm the accepted request. Inspect status before retrying.', { cause: error.code, sessionId: runtime.sessionId, desiredHash: request.desiredHash }); }
    result = checkedResult(value, request);
  }
  return result;
}
module.exports = { capabilities, diffConfig, checkedResult, executeLive };

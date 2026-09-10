'use strict';
function failure(code, message, exitCode = 6, data = null) {
  return Object.assign(new Error(message), { code, exitCode, data });
}
function envelope(command, requestId, phase, code, message, data = null, ok = true) {
  return { schemaVersion: 1, ok, command, requestId, phase, code, message, data };
}
function errorEnvelope(command, requestId, error) {
  return envelope(command, requestId, error.data?.committed ? 'unknown' : 'failed', error.code || 'io-failure', error.message || String(error), error.data || null, false);
}
module.exports = { failure, envelope, errorEnvelope };

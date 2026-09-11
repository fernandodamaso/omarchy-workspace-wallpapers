'use strict';
// Test executable only. Production code has no FAKE_* settings.
const fs = require('node:fs');
const path = require('node:path');
const scenario = process.env.FAKE_SCENARIO || 'success';
const args = process.argv.slice(2);
const saved = path.join(process.env.HOME, 'fake-request.json');
const emit = value => process.stdout.write(JSON.stringify(value));
const caps = { schemaVersion: 1, protocolVersion: 1, sessionId: 'fake-session', ready: true, busy: false, mode: 'legacy', revision: 0, token: 'missing', desiredHash: '', assignments: {}, sources: {}, sourceHashes: {}, features: ['applyConfig', 'operationStatus'], limits: { maxRequestBytes: 65536 }, lastError: null };
const response = (req, phase, ok = true, code = 'ok', data = {}) => ({ schemaVersion: 1, ok, command: 'config apply', requestId: req.requestId, phase, code, message: code, data: { sessionId: 'fake-session', renderVerification: 'unknown', ...data } });
if (args[0] !== 'workspace-wallpapers') process.exit(9);
if (scenario === 'hang') { setInterval(() => {}, 1000); }
else if (scenario === 'garbage') process.stdout.write('not-json');
else if (args[1] === 'capabilities') emit(caps);
else if (args[1] === 'status') emit({ configuration: caps, assignments: {} });
else if (args[1] === 'applyConfig') {
  const req = JSON.parse(args[2]);
  fs.writeFileSync(saved, JSON.stringify(req));
  if (scenario === 'busy') emit(response(req, 'failed', false, 'runtime-busy', { exitCode: 4 }));
  else if (scenario === 'lost-receipt') process.exit(1);
  else emit(response(req, 'accepted'));
} else if (args[1] === 'operationStatus') {
  const req = JSON.parse(fs.readFileSync(saved));
  if (scenario === 'pending') emit(response(req, 'accepted'));
  else if (scenario === 'restart') emit(response(req, 'unknown', false, 'unknown-operation', { sessionId: 'restarted', exitCode: 5 }));
  else if (scenario === 'wrong-id') emit(response({ requestId: 'another-request' }, 'applied', true, 'ok', { revision: 1, desiredHash: req.desiredHash }));
  else if (scenario === 'import-failure') emit(response(req, 'failed', false, 'image-unavailable', { exitCode: 6 }));
  else if (scenario === 'expired') emit(response(req, 'unknown', false, 'unknown-operation', { exitCode: 5 }));
  else emit(response(req, 'applied', true, 'ok', { revision: 1, desiredHash: req.desiredHash, assignments: req.config.assignments }));
} else process.exit(8);

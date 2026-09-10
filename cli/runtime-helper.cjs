'use strict';
// Private child process of ConfigApplyController.qml, never an agent command.
const Rules = require('../ConfigModel.js');
const { inspectRuntime, applyTransaction } = require('./runtime-store.cjs');
function run(argv, env = process.env) {
  if (Number(process.versions.node.split('.')[0]) < 22) throw Object.assign(new Error('Runtime worker requires Node 22 or newer.'), { code: 'dependency-unavailable', exitCode: 3 });
  if (argv[0] === 'inspect' && argv.length === 1) return inspectRuntime(env);
  if (argv[0] === 'apply' && argv.length === 2) {
    if (Buffer.byteLength(argv[1]) > 65536) throw Object.assign(new Error('Apply request exceeds 64 KiB.'), { code: 'request-too-large', exitCode: 2 });
    return applyTransaction(Rules.parseJson(argv[1]), env);
  }
  throw Object.assign(new Error('Private worker expects inspect or apply.'), { code: 'worker-usage', exitCode: 2 });
}
if (require.main === module) {
  try { process.stdout.write(JSON.stringify({ ok: true, data: run(process.argv.slice(2)) }) + '\n'); }
  catch (error) {
    const exitCode = error.exitCode || 6;
    const response = { ok: false, code: error.code || 'runtime-io', message: error.message || String(error), exitCode, data: error.data || null };
    process.stdout.write(JSON.stringify(response) + '\n');
    process.stderr.write(response.code + ': ' + response.message + '\n');
    process.exitCode = exitCode;
  }
}
module.exports = { run };

'use strict';
const { spawn } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { parseJson } = require('../ConfigModel.js');
const { failure } = require('./result.cjs');

function createClient(env = process.env, timeout = 10000, spawnProcess = spawn) {
  const deadline = performance.now() + timeout;
  const remaining = () => Math.max(0, Math.floor(deadline - performance.now()));
  async function call(method, args = []) {
    if (!['capabilities', 'status', 'applyConfig', 'operationStatus'].includes(method) || !args.every(value => typeof value === 'string'))
      throw failure('ipc-usage', 'Unsupported IPC invocation.', 2);
    const budget = remaining();
    if (!budget) throw failure('timeout', 'IPC deadline expired; completion is unknown.', 5, { retrySafe: false });
    return new Promise((resolve, reject) => {
      let child, timer, settled = false, stdout = [], stderr = [], outSize = 0, errSize = 0;
      function killGroup() {
        if (!child || !child.pid) return;
        try { process.kill(-child.pid, 'SIGKILL'); }
        catch { try { child.kill('SIGKILL'); } catch {} }
      }
      function done(error, value, kill = false) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (kill) { killGroup(); child?.stdout?.destroy(); child?.stderr?.destroy(); }
        if (error) reject(error); else resolve(value);
      }
      try {
        // A separate process group lets the deadline stop wrapper descendants,
        // without signalling the calling terminal or the long-lived service.
        child = spawnProcess('omarchy-shell', ['workspace-wallpapers', method, ...args], {
          env, shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe']
        });
      } catch (error) { done(failure('runtime-unavailable', 'Cannot launch omarchy-shell: ' + error.message, 3)); return; }
      timer = setTimeout(() => done(failure('timeout', 'IPC deadline expired. Inspect status before retrying.', 5, { retrySafe: false }), undefined, true), budget);
      child.on('error', error => done(failure('runtime-unavailable', 'Cannot launch omarchy-shell (' + (error.code || error.message) + ').', 3), undefined, true));
      child.stdout.on('data', chunk => {
        outSize += chunk.length;
        if (outSize > 1048576) done(failure('runtime-protocol', 'IPC response exceeds 1 MiB.', 3), undefined, true);
        else stdout.push(chunk);
      });
      child.stderr.on('data', chunk => {
        errSize += chunk.length;
        if (errSize > 65536) done(failure('runtime-protocol', 'IPC diagnostics exceed 64 KiB.', 3), undefined, true);
        else stderr.push(chunk);
      });
      child.on('close', code => {
        if (settled) return;
        if (code !== 0) {
          const detail = Buffer.concat(stderr).toString('utf8').trim();
          done(failure('runtime-unavailable', 'omarchy-shell failed' + (detail ? ': ' + detail : ' (exit ' + code + ').'), 3));
          return;
        }
        try {
          const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(stdout));
          done(null, parseJson(text));
        } catch { done(failure('runtime-protocol', 'Runtime returned invalid JSON; verify the installed service version.', 3)); }
      });
    });
  }
  return { call, remaining };
}
module.exports = { createClient };

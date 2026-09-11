'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const { path, root, fixture, put } = require('./cli-fixtures.cjs');

test('public CLI reports a post-commit desired-write uncertainty as exit 5 without suggesting retry', t => {
  const f = fixture(t);
  const launcher = path.join(f.home, 'inject-uncertain-write.cjs');
  // Inject only the storage boundary. Execute the real argument parser,
  // command, result envelope, stdout/stderr handling and exit-code logic.
  put(launcher, `
const Config = require(${JSON.stringify(path.join(root, 'cli/config.cjs'))});
Config.writeConfig = () => { throw Object.assign(new Error('Post-commit confirmation failed.'), {
  code: 'durability-unknown', exitCode: 6, data: { committed: true }
}); };
require(${JSON.stringify(path.join(root, 'cli/main.cjs'))}).main(process.argv.slice(2))
  .then(code => { process.exitCode = code; });
`);
  const result = spawnSync(process.execPath, [launcher, 'assign', 'id:2', f.image, '--json'], {
    env: f.env, cwd: f.home, encoding: 'utf8', timeout: 10000
  });
  assert.equal(result.error, undefined);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, false);
  assert.equal(output.phase, 'unknown');
  assert.equal(output.code, 'durability-unknown');
  assert.equal(output.data.committed, true);
  assert.equal(result.status, 5);
  assert.equal(output.data.retrySafe, false);
  assert.match(result.stderr, /durability-unknown/);
});

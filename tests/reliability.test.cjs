'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const Model = require('../WorkspaceModel.js');

test('latest render request wins over stale asynchronous completions', () => {
  const fallback = '/tmp/fallback.png';
  const a = Model.requestRender(Model.emptyRenderState(), '/tmp/a.png', fallback);
  const b = Model.requestRender(a, '/tmp/b.png', fallback);
  const c = Model.requestRender(b, '/tmp/c.png', fallback);

  const staleA = Model.completeRender(c, a.generation, '/tmp/a.png', true);
  const staleB = Model.completeRender(staleA.state, b.generation, '/tmp/b.png', true);
  const currentC = Model.completeRender(staleB.state, c.generation, '/tmp/c.png', true);

  assert.equal(staleA.action, 'stale');
  assert.deepEqual(staleA.state, c);
  assert.equal(staleB.action, 'stale');
  assert.deepEqual(staleB.state, c);
  assert.equal(currentC.action, 'display');
  assert.equal(currentC.state.displayed, '/tmp/c.png');
  assert.equal(currentC.state.displayedGeneration, c.generation);
});

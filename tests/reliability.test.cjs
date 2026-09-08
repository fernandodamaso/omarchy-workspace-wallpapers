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

test('failed assigned image falls back once without mutating the assignment model', () => {
  const assigned = '/tmp/assigned.png';
  const fallback = '/tmp/fallback.webp';
  const request = Model.requestRender(Model.emptyRenderState(), assigned, fallback);
  const failedAssigned = Model.completeRender(request, request.generation, assigned, false);

  assert.equal(failedAssigned.action, 'fallback');
  assert.equal(failedAssigned.state.generation, request.generation + 1);
  assert.equal(failedAssigned.state.requested, fallback);
  assert.equal(failedAssigned.state.fallback, '');

  const failedFallback = Model.completeRender(
    failedAssigned.state,
    failedAssigned.state.generation,
    fallback,
    false
  );

  assert.equal(failedFallback.action, 'clear');
  assert.equal(failedFallback.state.requested, '');
  assert.equal(failedFallback.state.fallback, '');
  assert.equal(failedFallback.state.displayed, '');
});

test('retiring a screen invalidates its pending render completion', () => {
  const request = Model.requestRender(
    Model.emptyRenderState(),
    '/tmp/screen.png',
    '/tmp/fallback.png'
  );
  const retired = Model.cancelRender(request);
  const stale = Model.completeRender(
    retired,
    request.generation,
    '/tmp/screen.png',
    true
  );

  assert.equal(retired.generation, request.generation + 1);
  assert.equal(retired.requested, '');
  assert.equal(retired.fallback, '');
  assert.equal(stale.action, 'stale');
  assert.deepEqual(stale.state, retired);
});

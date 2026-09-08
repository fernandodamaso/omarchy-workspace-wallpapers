'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const Model = require('../WorkspaceModel.js');

test('workspace id keys are canonical positive integers', () => {
  assert.equal(Model.normalizeWorkspaceKey('id:1'), 'id:1');
  assert.equal(Model.normalizeWorkspaceKey('id:0007'), 'id:7');
  assert.equal(Model.normalizeWorkspaceKey('id:0'), '');
  assert.equal(Model.normalizeWorkspaceKey('id:-1'), '');
  assert.equal(Model.normalizeWorkspaceKey('id:nope'), '');
});

test('workspace name keys preserve spaces and Unicode exactly', () => {
  const key = 'name:Dev Ω 東京 Workspace';
  assert.equal(Model.normalizeWorkspaceKey(key), key);
  assert.equal(Model.normalizeWorkspaceKey('name: leading and trailing '), 'name: leading and trailing ');
});

test('special workspaces are excluded from keys and candidates', () => {
  assert.equal(Model.normalizeWorkspaceKey('name:special'), '');
  assert.equal(Model.normalizeWorkspaceKey('name:special:scratch'), '');
  assert.deepEqual(Model.workspaceKeyCandidates({ id: -98, name: 'special:scratch' }), []);
  assert.deepEqual(Model.workspaceKeyCandidates({ id: 4, name: 'special' }), []);
});

test('normal workspace candidates prefer id and retain exact name fallback', () => {
  assert.deepEqual(
    Model.workspaceKeyCandidates({ id: 3, name: 'Dev Ω Space' }),
    ['id:3', 'name:Dev Ω Space']
  );
  assert.equal(Model.preferredWorkspaceKey({ id: 3, name: 'Dev Ω Space' }), 'id:3');
});

test('only absolute PNG JPEG and WebP paths are accepted', () => {
  assert.equal(Model.normalizeImagePath('/home/a/My Wall.webp'), '/home/a/My Wall.webp');
  assert.equal(Model.normalizeImagePath('/tmp/test.JPEG'), '/tmp/test.JPEG');
  assert.equal(Model.normalizeImagePath('/tmp/test.jpg'), '/tmp/test.jpg');
  assert.equal(Model.normalizeImagePath('/tmp/test.png'), '/tmp/test.png');
  assert.equal(Model.normalizeImagePath('relative/test.png'), '');
  assert.equal(Model.normalizeImagePath('/tmp/test.mp4'), '');
  assert.equal(Model.normalizeImagePath('https://example.com/test.png'), '');
});

test('state parsing keeps only valid workspace/image assignments', () => {
  const parsed = Model.parseState(JSON.stringify({
    version: 1,
    assignments: {
      'id:2': '/tmp/two.png',
      'name:Design 🎨': '/tmp/design.webp',
      'name:special:scratch': '/tmp/no.png',
      'id:0': '/tmp/nope.jpg',
      'id:8': '/tmp/movie.mp4'
    }
  }));

  assert.deepEqual(parsed, {
    version: 1,
    assignments: {
      'id:2': '/tmp/two.png',
      'name:Design 🎨': '/tmp/design.webp'
    }
  });
});

test('assignment lookup prefers id over name and mutations do not corrupt state', () => {
  const state = {
    version: 1,
    assignments: {
      'id:5': '/tmp/id.png',
      'name:Five': '/tmp/name.png'
    }
  };

  assert.equal(Model.assignmentForWorkspace(state, { id: 5, name: 'Five' }), '/tmp/id.png');

  const assigned = Model.withAssignment(state, 'name:Design Ω', '/tmp/design.jpeg');
  assert.equal(assigned.assignments['name:Design Ω'], '/tmp/design.jpeg');
  assert.equal(state.assignments['name:Design Ω'], undefined);

  const cleared = Model.withoutAssignment(assigned, 'name:Design Ω');
  assert.equal(cleared.assignments['name:Design Ω'], undefined);
});

test('status payload is stable JSON-friendly data', () => {
  assert.deepEqual(
    Model.statusPayload({ version: 1, assignments: { 'id:1': '/tmp/a.png' } }, '/tmp/fallback.webp', '/tmp/state.json'),
    {
      version: 1,
      assignments: { 'id:1': '/tmp/a.png' },
      fallback: '/tmp/fallback.webp',
      statePath: '/tmp/state.json',
      staticFormats: ['png', 'jpg', 'jpeg', 'webp']
    }
  );
});

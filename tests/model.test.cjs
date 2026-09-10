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

test('history parsing tolerates malformed input and filters entries', () => {
  const empty = { version: 1, recent: [], undo: null };
  assert.deepEqual(Model.emptyHistoryState(), empty);
  assert.deepEqual(Model.parseHistoryState('{not json'), empty);
  assert.deepEqual(Model.parseHistoryState(JSON.stringify({ version: 2 })), empty);

  assert.deepEqual(
    Model.parseHistoryState({
      version: 1,
      recent: [
        { path: '/wallpapers/one.png', name: 'One', usedAt: 10 },
        { path: '/wallpapers/one.png', name: 'Older One', usedAt: 9 },
        { path: 'relative/two.jpg', name: 'Two', usedAt: 9 },
        { path: '/wallpapers/three.gif', name: 'Three', usedAt: 8 },
        { path: '/wallpapers/missing-name.webp', usedAt: 7 },
        null,
        { path: '/wallpapers/four.jpeg', name: 'Four', usedAt: 'bad' }
      ],
      undo: { key: 'id:4', previousPath: '', revision: 3 }
    }),
    {
      version: 1,
      recent: [{ path: '/wallpapers/one.png', name: 'One', usedAt: 10 }],
      undo: { key: 'id:4', previousPath: '', revision: 3 }
    }
  );
});

test('recent history is newest first, deduplicated, and bounded', () => {
  const original = {
    version: 1,
    recent: [
      { path: '/wallpapers/old.png', name: 'Old', usedAt: 1 },
      { path: '/wallpapers/keep.jpg', name: 'Keep', usedAt: 2 },
      { path: '/wallpapers/duplicate.webp', name: 'Duplicate', usedAt: 3 }
    ],
    undo: null
  };

  const updated = Model.recordRecent(
    original,
    '/wallpapers/keep.jpg',
    'Keep again',
    4,
    2
  );

  assert.deepEqual(updated.recent, [
    { path: '/wallpapers/keep.jpg', name: 'Keep again', usedAt: 4 },
    { path: '/wallpapers/old.png', name: 'Old', usedAt: 1 }
  ]);
  assert.deepEqual(original.recent, [
    { path: '/wallpapers/old.png', name: 'Old', usedAt: 1 },
    { path: '/wallpapers/keep.jpg', name: 'Keep', usedAt: 2 },
    { path: '/wallpapers/duplicate.webp', name: 'Duplicate', usedAt: 3 }
  ]);
});

test('undo history supports global fallback and rejects stale candidates', () => {
  const original = Model.emptyHistoryState();
  const recorded = Model.recordUndo(original, 'id:7', '', 12);

  assert.deepEqual(recorded.undo, { key: 'id:7', previousPath: '', revision: 12 });
  assert.deepEqual(Model.undoCandidate(recorded, 'id:7', 12), {
    action: 'available',
    path: ''
  });
  assert.deepEqual(Model.undoCandidate(recorded, 'id:8', 12), { action: 'stale' });
  assert.deepEqual(Model.undoCandidate(recorded, 'id:7', 13), { action: 'stale' });
  assert.deepEqual(original, Model.emptyHistoryState());
});

test('history mutations are immutable and clear only undo', () => {
  const original = {
    version: 1,
    recent: [{ path: '/wallpapers/one.png', name: 'One', usedAt: 1 }],
    undo: { key: 'name:Main', previousPath: '/wallpapers/old.jpg', revision: 2 }
  };
  const cleared = Model.clearUndo(original);

  assert.deepEqual(cleared, {
    version: 1,
    recent: [{ path: '/wallpapers/one.png', name: 'One', usedAt: 1 }],
    undo: null
  });
  assert.deepEqual(original.undo, {
    key: 'name:Main',
    previousPath: '/wallpapers/old.jpg',
    revision: 2
  });

  const recent = Model.recordRecent(original, '/wallpapers/new.webp', 'New', 3);
  recent.recent[0].name = 'Changed';
  assert.equal(original.recent[0].name, 'One');
  assert.equal(original.undo.previousPath, '/wallpapers/old.jpg');
});

test('source preferences tolerate malformed and version-mismatched input', () => {
  const empty = {
    version: 1,
    folders: [],
    lastSource: 'theme',
    sort: 'name',
    thumbnailSize: 'medium'
  };

  assert.deepEqual(Model.emptySourcePreferences(), empty);
  assert.deepEqual(Model.parseSourcePreferences('{not json'), empty);
  assert.deepEqual(Model.parseSourcePreferences(JSON.stringify({ version: 2 })), empty);
  assert.deepEqual(Model.parseSourcePreferences(JSON.stringify(null)), empty);
});

test('source preferences preserve valid unavailable folders and deduplicate in input order', () => {
  const folders = [
    '/unavailable/Shared Folder',
    '/unavailable/東京 wallpapers',
    '/unavailable/Shared Folder',
    'relative/folder',
    '/unavailable/東京 wallpapers',
    '/unavailable/with\t tab'
  ];

  assert.deepEqual(
    Model.parseSourcePreferences(JSON.stringify({ version: 1, folders: folders })),
    {
      version: 1,
      folders: ['/unavailable/Shared Folder', '/unavailable/東京 wallpapers'],
      lastSource: 'theme',
      sort: 'name',
      thumbnailSize: 'medium'
    }
  );
});

test('source preference options ignore invalid values', () => {
  const parsed = Model.parseSourcePreferences(JSON.stringify({
    version: 1,
    lastSource: 'elsewhere',
    sort: 'recent',
    thumbnailSize: 'huge'
  }));

  assert.equal(parsed.lastSource, 'theme');
  assert.equal(parsed.sort, 'name');
  assert.equal(parsed.thumbnailSize, 'medium');

  const updated = Model.updateSourcePreferences(parsed, {
    lastSource: 'recent',
    sort: 'mtime',
    thumbnailSize: 'large'
  });
  assert.equal(updated.lastSource, 'recent');
  assert.equal(updated.sort, 'mtime');
  assert.equal(updated.thumbnailSize, 'large');
});

test('source folder mutations are pure and validate absolute paths', () => {
  const original = Model.emptySourcePreferences();
  const added = Model.addSourceFolder(original, '/unavailable/Folder Ω');
  const duplicate = Model.addSourceFolder(added, '/unavailable/Folder Ω');
  const invalid = Model.addSourceFolder(duplicate, 'relative/folder');
  const removed = Model.removeSourceFolder(invalid, '/unavailable/Folder Ω');

  assert.deepEqual(original.folders, []);
  assert.deepEqual(added.folders, ['/unavailable/Folder Ω']);
  assert.deepEqual(duplicate.folders, ['/unavailable/Folder Ω']);
  assert.deepEqual(invalid.folders, ['/unavailable/Folder Ω']);
  assert.deepEqual(removed.folders, []);
});

test('source directories preserve theme-then-folder ordering and remove duplicates', () => {
  const preferences = {
    version: 1,
    folders: ['/unavailable/Folder Ω', '/theme/one', '/unavailable/Folder Ω'],
    lastSource: 'folders',
    sort: 'name',
    thumbnailSize: 'medium'
  };
  const themes = ['/theme/one', '/theme/東京', 'relative/theme', '/theme/東京'];

  assert.deepEqual(Model.sourceDirectories(preferences, 'theme', themes), [
    '/theme/one',
    '/theme/東京'
  ]);
  assert.deepEqual(Model.sourceDirectories(preferences, 'folders', themes), [
    '/unavailable/Folder Ω',
    '/theme/one'
  ]);
  assert.deepEqual(Model.sourceDirectories(preferences, 'all', themes), [
    '/theme/one',
    '/theme/東京',
    '/unavailable/Folder Ω'
  ]);
  assert.deepEqual(Model.sourceDirectories(preferences, 'unknown', themes), []);
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

test('workspace input accepts positive ids and exact named keys', () => {
  assert.equal(Model.workspaceKeyFromInput('007'), 'id:7');
  assert.equal(Model.workspaceKeyFromInput('name:Design Ω'), 'name:Design Ω');
  assert.equal(Model.workspaceKeyFromInput('Design Ω'), 'name:Design Ω');
  assert.equal(Model.workspaceKeyFromInput('special:terminal'), '');
  assert.equal(Model.workspaceKeyFromInput('0'), '');
});

test('workspace rows combine live workspaces with saved absent assignments', () => {
  assert.deepEqual(
    Model.composeWorkspaceRows(
      [{ id: 1, name: 'Main' }, { id: -4, name: 'Design Ω' }, { id: -99, name: 'special:term' }],
      { 'id:1': '/tmp/main.png', 'name:Old': '/tmp/old.webp', 'name:Design Ω': '/tmp/design.jpg' },
      ['name:Added']
    ),
    [
      { key: 'id:1', label: 'Main', path: '/tmp/main.png', present: true },
      { key: 'name:Design Ω', label: 'Design Ω', path: '/tmp/design.jpg', present: true },
      { key: 'name:Old', label: 'Old', path: '/tmp/old.webp', present: false },
      { key: 'name:Added', label: 'Added', path: '', present: false }
    ]
  );
});

test('picker state ignores stale results and makes cancellation side-effect free', () => {
  const first = Model.beginPicker(Model.emptyPickerState(), 'id:1');
  const second = Model.beginPicker(first.state, 'id:2');
  assert.equal(Model.completePicker(second.state, first.serial, '/tmp/old.png').action, 'stale');
  assert.equal(Model.completePicker(second.state, second.serial, '').action, 'cancelled');
  const selected = Model.completePicker(second.state, second.serial, '/tmp/new.png');
  assert.deepEqual(selected, {
    action: 'selected',
    key: 'id:2',
    path: '/tmp/new.png',
    state: { serial: second.serial, active: false, targetKey: '' }
  });
  assert.equal(Model.completePicker(second.state, second.serial, '/tmp/new.mp4').action, 'invalid');
});

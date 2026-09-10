'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const read = file => {
  const filename = path.join(__dirname, '..', file);
  assert.ok(fs.existsSync(filename), `${file} must exist`);
  return fs.readFileSync(filename, 'utf8');
};
const has = (source, pattern, message) => assert.ok(pattern.test(source), message);

// Source checks establish ownership/wiring, not QML rendering or input behavior.
test('folder UI emits typed intent and owns no service or disk writes', () => {
  const ui = read('components/WallpaperSources.qml');
  for (const name of ['sourceChangeRequested', 'addFolderRequested',
    'openFolderRequested', 'removeFolderRequested']) {
    has(ui, new RegExp('signal\\s+' + name + '\\s*\\('), `${name} is public`);
  }
  for (const name of ['folders', 'sourceOptions', 'sourceSelection', 'pending', 'message', 'error', 'home']) {
    has(ui, new RegExp('property\\s+\\w+\\s+' + name + '\\s*:'), `${name} is an input`);
  }
  has(ui, /signal sourceChangeRequested\(value: string\)/, 'source is typed');
  has(ui, /signal openFolderRequested\(path: string\)/, 'open path is typed');
  has(ui, /signal removeFolderRequested\(path: string\)/, 'remove path is typed');
  assert.doesNotMatch(ui, /shell\.serviceFor|FileView\s*\{|Process\s*\{|assignments\.json|preferences\.json|requestAssignment|clearAssignment/);
});

test('folder controls emit intent instead of invoking controller methods', () => {
  const ui = read('components/WallpaperSources.qml');
  has(ui, /onChanged:\s*root\.sourceChangeRequested\(value\)/, 'source change intent');
  has(ui, /onClicked:\s*root\.addFolderRequested\(\)/, 'add folder intent');
  has(ui, /onClicked:\s*root\.openFolderRequested\(modelData\)/, 'open folder intent');
  has(ui, /onClicked:\s*root\.removeFolderRequested\(modelData\)/, 'remove folder intent');
  has(ui, /function setDisplayedSource\(value\)/, 'rollback uses a public method');
  has(ui, /enabled:\s*!root\.pending/, 'mutations respect pending saves');
});

test('Settings wires the inline source component and never reaches into its private dropdown', () => {
  const settings = read('Settings.qml');
  has(settings, /WallpaperSources\s*\{/, 'inline source component is mounted');
  has(settings, /onSourceChangeRequested:\s*root\.setSourceSelection\(value\)/, 'source intent reaches controller');
  has(settings, /onAddFolderRequested:\s*root\.startFolderDialog\(\)/, 'add intent reaches controller');
  has(settings, /onOpenFolderRequested:\s*root\.openSourceFolder\(path\)/, 'open intent reaches controller');
  has(settings, /onRemoveFolderRequested:\s*root\.removeSourceFolder\(path\)/, 'remove intent reaches controller');
  assert.doesNotMatch(settings, /\bsourceDropdown\b/);
  assert.equal((settings.match(/sourceControls\.setDisplayedSource\(/g) || []).length, 3,
    'snapshot synchronization and both rejected source-change paths use the public rollback API');
});

test('shared preview preserves asynchronous cropped image and global placeholder', () => {
  const preview = read('components/WallpaperPreview.qml');
  has(preview, /property string imagePath:/, 'preview has one image input');
  has(preview, /implicitHeight:\s*width \* 9 \/ 16/, 'preview retains 16:9 default');
  has(preview, /source:\s*root\.imagePath \? Util\.fileUrl\(root\.imagePath\) : ""/, 'image URL comes from input');
  for (const pattern of [/Image\.PreserveAspectCrop/, /asynchronous:\s*true/,
    /cache:\s*false/, /smooth:\s*true/, /Using global background/, /Drop an image or click to choose/]) {
    has(preview, pattern, `preview retains ${pattern}`);
  }
  assert.doesNotMatch(preview, /shell\.serviceFor|FileView\s*\{|Process\s*\{|wallpaperService|requestAssignment|clearAssignment/);
  const row = read('components/WorkspaceRow.qml');
  has(row, /WallpaperPreview\s*\{/, 'workspace row reuses shared preview');
  assert.doesNotMatch(row, /\bImage\s*\{/);
  has(row, /Accessible\.name:/, 'row preserves accessible action label');
  has(row, /Accessible\.description:/, 'row preserves accessible state');
});

test('source modes remain exactly the existing shared preference options', () => {
  const settings = read('Settings.qml');
  const literal = settings.match(/readonly property var sourceOptions:\s*(\[[\s\S]*?\n  \])/);
  assert.ok(literal, 'source options remain owned by Settings');
  const options = JSON.parse(JSON.stringify(vm.runInNewContext(literal[1])));
  assert.deepEqual(options, [
    { label: 'Current theme', value: 'theme' },
    { label: 'My folders', value: 'folders' },
    { label: 'Recently used', value: 'recent' },
    { label: 'All sources', value: 'all' }
  ]);
  has(settings, /requestUpdateSourcePreferences\(\{ lastSource: source \}\)/, 'source uses existing shared lastSource preference');
});

test('workspace surfaces keep single-image drops and existing action intents', () => {
  const row = read('components/WorkspaceRow.qml');
  const detail = read('components/WorkspaceDetail.qml');
  for (const name of ['chooseRequested', 'resetRequested', 'undoRequested', 'pathSubmitted',
    'pathEntryRequested', 'imageDropped', 'dropRejected']) {
    has(row, new RegExp('signal\\s+' + name + '\\s*\\('), `${name} remains public`);
  }
  for (const surface of [row, detail]) {
    has(surface, /urls\.length !== 1/, 'exactly one dropped URL');
    has(surface, /decodeURIComponent\(path\.substring\(7\)\)/, 'file URLs are decoded');
    has(surface, /png\|jpe\?g\|webp/, 'only supported image extensions');
    has(surface, /root\.imageDropped\(path\)/, 'validated drops emit intent');
    has(surface, /catch \(error\)/, 'malformed URLs are rejected without throwing');
  }
  has(detail, /visible:\s*root\.undoAvailable/, 'Undo remains conditional in its new owner');
  const settings = read('Settings.qml');
  for (const action of ['choose', 'reset', 'undo', 'assignPath']) {
    has(settings, new RegExp('root\\.' + action + '\\(workspaceKey'), `${action} remains wired to explicit target`);
  }
  has(settings, /Model\.normalizeImagePath\(String\(path \|\| ""\)\)/, 'controller validates again before service mutation');
});

test('Settings Undo is scoped to exact workspace key and assignment revision', () => {
  const settings = read('Settings.qml');
  const match = settings.match(/function undoAvailable\(key\) \{([\s\S]*?)\n  \}/);
  assert.ok(match, 'Undo eligibility remains owned by Settings');
  const root = { history: { undo: { key: 'name: Café ', revision: 7 } }, assignmentRevision: 7 };
  const eligible = vm.runInNewContext('(function(key) {' + match[1] + '\n})', { root });
  assert.equal(eligible('name: Café '), true);
  assert.equal(eligible('name:Café'), false);
  assert.equal(eligible('id:2'), false);
  root.assignmentRevision = 8;
  assert.equal(eligible('name: Café '), false);
  root.history = { undo: null };
  assert.equal(eligible('name: Café '), false);
});

test('all assignment and source mutations stay in the scoped service controller', () => {
  const settings = read('Settings.qml');
  has(settings, /shell\.serviceFor\(manifest\.id\)/, 'scoped service injection remains');
  for (const method of ['requestAssignment', 'clearAssignment', 'requestUndo',
    'requestUpdateSourcePreferences', 'requestAddSourceFolder', 'requestRemoveSourceFolder']) {
    has(settings, new RegExp('wallpaperService\\.' + method + '\\('), `${method} stays in Settings`);
  }
  assert.doesNotMatch(settings, /assignments\.json|preferences\.json|history\.json/);
  const service = read('WorkspaceWallpapers.qml');
  has(service, /onSaved:\s*root\.commitPendingSave\(\)/, 'service confirms committed assignments');
  has(service, /atomicWrites:\s*true/, 'service retains atomic writes');
});

test('compact row selects without assigning and both thumbnail and Change emit choose', () => {
  const row = read('components/WorkspaceRow.qml');
  has(row, /property bool selected:/, 'selection differs from present/current');
  has(row, /signal selectionRequested\(\)/, 'body selection is a separate intent');
  assert.equal((row.match(/onClicked:\s*root\.chooseRequested\(\)/g) || []).length, 2);
  has(row, /elide:\s*Text\.ElideRight/, 'long labels and filenames elide');
  has(row, /tooltipText:/, 'full label/key/path remains available');
  assert.doesNotMatch(row, /Hyprland|requestAssignment|clearAssignment|shell\.serviceFor/);
});

test('saving eligibility uses the pending operation key rather than selected workspace', () => {
  const settings = read('Settings.qml');
  const match = settings.match(/function busyFor\(key\) \{([\s\S]*?)\n  \}/);
  assert.ok(match);
  const wallpaperService = { pendingAssignmentKey: 'id:2', pendingOperationKey: '' };
  const root = { isBusy: () => true, selectedWorkspaceKey: 'id:7' };
  const busy = vm.runInNewContext('(function(key) {' + match[1] + '\n})', { root, wallpaperService });
  assert.equal(busy('id:2'), true);
  assert.equal(busy('id:7'), false);
  wallpaperService.pendingAssignmentKey = '';
  wallpaperService.pendingOperationKey = 'name: Café ';
  assert.equal(busy('name: Café '), true);
  assert.equal(busy('name:Café'), false);
  root.isBusy = () => false;
  assert.equal(busy('name: Café '), false);
});

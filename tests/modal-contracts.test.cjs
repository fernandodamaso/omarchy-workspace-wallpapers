'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const read = file => {
  const full = path.join(__dirname, '..', file);
  assert.ok(fs.existsSync(full), `${file} must exist`);
  return fs.readFileSync(full, 'utf8');
};
function method(file, name, scope) {
  const found = read(file).match(new RegExp('  function ' + name + '\\(([^)]*)\\) \\{([\\s\\S]*?)\\n  \\}'));
  assert.ok(found, `${file} must define ${name}`);
  return vm.runInNewContext('(function(' + found[1] + ') {' + found[2] + '\n})', scope);
}
function state() {
  const scope = vm.createContext({});
  vm.runInContext(read('PanelState.js'), scope);
  return scope;
}
function picker(exitCode, options = {}) {
  const calls = { restored: [], added: [], errors: [] };
  const root = {
    panelSession: 4, opened: true,
    folderDialogContext: { session: 4, restoreRequested: true, foldersOpen: true,
      browserOpen: true, browserTargetKey: 'name: Trabalho 日本語 ', selectedWorkspaceKey: 'id:2' },
    folderDialogExited: true, folderDialogOutputReady: true, folderDialogStarted: true,
    folderDialogExitCode: exitCode, folderDialogOutput: '/home/test/Wallpapers\n',
    sourceMessage: '', sourceError: false,
    restorePanelAfterDialog: context => calls.restored.push(context),
    addSourceFolder: folder => calls.added.push(folder),
    showSourceError: message => calls.errors.push(message),
    ...options
  };
  const finish = method('Settings.qml', 'finishFolderDialog', { root, PanelState: state() });
  return { root, calls, finish };
}

test('folder modal is inside the single settings window, not an inline expansion', () => {
  const settings = read('Settings.qml');
  assert.equal((settings.match(/\bPanelWindow\s*\{/g) || []).length, 1);
  assert.match(settings, /WallpaperFoldersDialog\s*\{/);
  assert.match(settings, /property bool foldersOpen:/);
  assert.doesNotMatch(settings, /sourceSectionOpen|sourceSectionPanel/);
  const modal = read('components/WallpaperFoldersDialog.qml');
  assert.match(modal, /FocusScope\s*\{/);
  assert.match(modal, /WallpaperSources\s*\{/);
  assert.match(modal, /Style\.space\(680\)/);
  assert.match(modal, /Math\.min\(/);
  assert.doesNotMatch(modal, /PanelWindow\s*\{|FileView\s*\{|Process\s*\{|shell\.serviceFor|requestAssignment/);
});

test('modal forwards explicit intent and public rollback/focus APIs', () => {
  const modal = read('components/WallpaperFoldersDialog.qml');
  for (const name of ['sourceChangeRequested', 'addFolderRequested', 'openFolderRequested',
    'removeFolderRequested', 'closeRequested']) {
    assert.ok(new RegExp('signal\\s+' + name + '\\(').test(modal), name);
  }
  for (const name of ['focusInitialControl', 'setDisplayedSource', 'closeChildPopup', 'cycleFocus']) {
    assert.ok(new RegExp('function ' + name + '\\(').test(modal), name);
  }
  assert.match(modal, /Accessible\.name:\s*"Close wallpaper folders"/);
  assert.match(modal, /Qt\.Key_Tab|sequence:\s*"Tab"/);
  assert.match(modal, /Qt\.Key_Backtab|sequence:\s*"Shift\+Tab"/);
});

test('modal blocks pointer, wheel and drops; both underlying surfaces are disabled', () => {
  const modal = read('components/WallpaperFoldersDialog.qml');
  const settings = read('Settings.qml');
  assert.match(modal, /acceptedButtons:\s*Qt\.AllButtons/);
  assert.match(modal, /onWheel:\s*function\(wheel\)\s*\{\s*wheel\.accepted = true/);
  assert.match(modal, /DropArea\s*\{/);
  assert.match(modal, /onDropped:\s*function\(drop\)\s*\{\s*drop\.accepted = true/);
  assert.match(modal, /onClicked:\s*root\.closeRequested\(\)/);
  assert.ok((settings.match(/enabled:\s*!root\.foldersOpen/g) || []).length >= 2,
    'both panel and browser reject input beneath modal');
});

test('Escape controller consumes one layer and checks child popups first', () => {
  const calls = [];
  const root = { foldersOpen: true, browserOpen: true,
    closeFolders: () => calls.push('folders'), closeBrowser: () => calls.push('browser'),
    dismiss: () => calls.push('panel') };
  let popup = true;
  const sourceControls = { closeChildPopup: () => { const value = popup; popup = false; return value; } };
  const wallpaperBrowser = { closeChildPopup: () => false };
  const dismiss = method('Settings.qml', 'dismissTopSurface', { root, PanelState: state(), sourceControls, wallpaperBrowser });
  dismiss();
  assert.deepEqual(calls, []);
  dismiss();
  assert.deepEqual(calls, ['folders']);
  root.foldersOpen = false;
  dismiss();
  root.browserOpen = false;
  dismiss();
  assert.deepEqual(calls, ['folders', 'browser', 'panel']);
  assert.doesNotMatch(read('Settings.qml'), /Keys\.onEscapePressed:\s*root\.dismiss\(\)/);
});

test('opening folders retains the captured browser target and selected workspace', () => {
  const root = { opened: true, foldersOpen: false, browserOpen: true,
    nativePickerPending: false, panelSession: 3,
    browserTargetKey: 'name: Trabalho 日本語 ', selectedWorkspaceKey: 'id:7' };
  const opener = {};
  const queued = [];
  const open = method('Settings.qml', 'openFolders', { root,
    wallpaperBrowser: { closeChildPopup: () => false },
    keyCatcher: { Window: { activeFocusItem: opener } },
    Qt: { callLater: fn => queued.push(fn) }, sourceControls: { focusInitialControl() {} } });
  open(opener);
  assert.equal(root.foldersOpen, true);
  assert.equal(root.browserOpen, true);
  assert.equal(root.browserTargetKey, 'name: Trabalho 日本語 ');
  assert.equal(root.selectedWorkspaceKey, 'id:7');
  assert.equal(root.foldersOpener, opener);
});

test('native picker completion waits for both output and exit, then adds exactly once', () => {
  const h = picker(0, { folderDialogExited: false });
  h.finish();
  assert.equal(h.calls.added.length, 0);
  h.root.folderDialogExited = true;
  h.finish();
  h.finish();
  assert.deepEqual(h.calls.added, ['/home/test/Wallpapers']);
  assert.equal(h.calls.restored[0].browserTargetKey, 'name: Trabalho 日本語 ');
  assert.equal(h.calls.errors.length, 0);
  assert.equal(h.root.folderDialogContext, null);
});

test('native cancellation restores the modal without a write or error', () => {
  const h = picker(1);
  h.finish();
  assert.equal(h.calls.restored.length, 1);
  assert.deepEqual(h.calls.added, []);
  assert.deepEqual(h.calls.errors, []);
});

test('failed or missing native picker restores an actionable error without a write', () => {
  for (const exitCode of [-1, 2, 127]) {
    const h = picker(exitCode);
    h.finish();
    assert.equal(h.calls.restored.length, 1);
    assert.equal(h.calls.added.length, 0);
    assert.equal(h.calls.errors.length, 1);
  }
  const settings = read('Settings.qml');
  assert.match(settings, /onRunningChanged:/);
  assert.match(settings, /!root\.folderDialogStarted/);
  assert.match(settings, /command:\s*\["zenity", "--file-selection", "--directory"\]/);
  assert.match(settings, /visible:\s*root\.opened && !root\.nativePickerPending/);
});

test('closed or superseded sessions ignore late native callbacks entirely', () => {
  for (const options of [{ panelSession: 5 }, { opened: false }]) {
    const h = picker(0, options);
    h.finish();
    assert.deepEqual(h.calls, { restored: [], added: [], errors: [] });
  }
  const settings = read('Settings.qml');
  assert.match(settings, /PanelState\.pickerMayRestore\(/);
  for (const name of ['open', 'close']) {
    const found = settings.match(new RegExp('  function ' + name + '\\([^)]*\\) \\{([\\s\\S]*?)\\n  \\}'));
    assert.ok(found && /root\.panelSession \+= 1/.test(found[1]), `${name} invalidates session`);
  }
});

test('browser rescans retain a still-present selection without auto-assigning', () => {
  const root = { loading: true, selectedPath: '/keep.png', displayedImages: [],
    selected: () => assert.fail('rescan must never assign') };
  const ensure = method('WallpaperBrowser.qml', 'ensureSelection', { root });
  ensure();
  assert.equal(root.selectedPath, '/keep.png', 'loading placeholder must not erase selection');
  root.loading = false;
  root.displayedImages = [{ path: '/other.png' }, { path: '/keep.png' }];
  ensure();
  assert.equal(root.selectedPath, '/keep.png');
  root.displayedImages = [{ path: '/other.png' }];
  ensure();
  assert.equal(root.selectedPath, '/other.png');
  root.displayedImages = [];
  ensure();
  assert.equal(root.selectedPath, '');
  const request = read('WallpaperBrowser.qml').match(/  function requestScan\(\) \{([\s\S]*?)\n  \}/);
  assert.ok(request);
  assert.doesNotMatch(request[1], /selectedPath\s*=\s*""/);
});

test('folder view lists only saved folders, explains removal and shortens home paths safely', () => {
  const sources = read('components/WallpaperSources.qml');
  assert.match(sources, /Removing a folder only removes it from this list\. Your files and assigned wallpapers stay unchanged\./);
  assert.match(sources, /model:\s*root\.folders/);
  assert.match(sources, /tooltipText:\s*String\(modelData\)/);
  assert.match(sources, /elide:\s*Text\.ElideMiddle/);
  assert.match(sources, /Layout\.minimumHeight:\s*0/);
  const shorten = method('components/WallpaperSources.qml', 'displayPath', { root: { home: '/home/test' } });
  assert.equal(shorten('/home/test/日本語 wallpapers'), '~/日本語 wallpapers');
  assert.equal(shorten('/home/test-other/images'), '/home/test-other/images');
  assert.equal(shorten('/unavailable/folder'), '/unavailable/folder');
});

test('source-save success is reported only by the service completion handler', () => {
  const root = { sourceSaveMessage: 'Folder added', sourcePreferencesPending: true,
    sourceMessage: '', sourceError: false, sourcePreferences: { folders: ['/optimistic'] },
    wallpaperService: { statusData: () => ({ sourcePreferences: { folders: ['/committed'] } }) },
    syncSourcePreferences: data => { root.sourcePreferences = data.sourcePreferences; } };
  const finish = method('Settings.qml', 'finishSourcePreferencesSave', { root });
  finish(true);
  assert.equal(root.sourcePreferencesPending, false);
  assert.equal(root.sourceMessage, 'Folder added');
  assert.equal(root.sourceError, false);
  assert.deepEqual(root.sourcePreferences.folders, ['/committed']);
  root.sourcePreferences = { folders: ['/failed-optimistic'] };
  root.sourceSaveMessage = 'Folder removed';
  root.sourcePreferencesPending = true;
  finish(false);
  assert.equal(root.sourcePreferencesPending, false);
  assert.equal(root.sourceError, true);
  assert.match(root.sourceMessage, /could not be saved/i);
  assert.deepEqual(root.sourcePreferences.folders, ['/committed']);
  assert.match(read('Settings.qml'), /onSourcePreferencesSaveFinished\(success\)\s*\{\s*root\.finishSourcePreferencesSave\(success\)/);
});

test('local qualification handoff names the runtime-only gates and reversible install', () => {
  const doc = read('docs/ui-redesign-local-gate.md');
  for (const phrase of ['FDM-908', 'candidate', 'Tab', 'Zenity', 'Escape', 'stock', 'restore',
    'saved-but-absent', 'read-only', 'exact', 'unmerged']) {
    assert.ok(doc.includes(phrase), phrase);
  }
  assert.match(read('README.md'), /ui-redesign-local-gate\.md/);
});

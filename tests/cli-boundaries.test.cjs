'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('plugin registers only the native wallpaper service', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.deepEqual(manifest.kinds, ['service']);
  assert.deepEqual(manifest.entryPoints, { service: 'WorkspaceWallpapers.qml' });
  assert.equal(manifest.id, 'io.github.fernandodamaso.workspace-wallpapers');
  assert.equal(manifest.omarchy.clonedFrom, 'omarchy.background');
});

test('graphical configuration files and their optional menu entry are removed', () => {
  const retired = ['Settings.qml', 'WallpaperBrowser.qml', 'components/PickerController.qml', 'components/WorkspaceRow.qml', 'examples/omarchy-menu.jsonc'];
  assert.deepEqual(retired.filter(file => fs.existsSync(path.join(root, file))), []);
});

test('background renderer retains rendering but exposes no configuration gestures', () => {
  const renderer = read('WorkspaceWallpaperPanel.qml');
  assert.match(renderer, /WlrLayershell\.layer:\s*WlrLayer\.Background/);
  assert.match(renderer, /WlrLayershell\.keyboardFocus:\s*WlrKeyboardFocus\.None/);
  assert.match(renderer, /Model\.requestRender\(/);
  assert.match(renderer, /Model\.completeRender\(/);
  assert.match(renderer, /Model\.cancelRender\(/);
  assert.doesNotMatch(renderer, /TapHandler|MouseArea|onDoubleTapped|pickForWorkspace|openThemeSwitcher/);
});

test('service contains no graphical picker or theme-switcher process', () => {
  const service = read('WorkspaceWallpapers.qml');
  assert.doesNotMatch(service, /pendingPickerKey|pickForWorkspace|imagePicker|pickerStdout|openThemeSwitcher|themeSwitcher/);
  assert.doesNotMatch(service, /zenity|xdg-open|omarchy-menu-images|omarchy-theme-bg-switcher|omarchy-theme-switcher/);
  assert.doesNotMatch(service, /"bash",\s*"-lc"/);
});

test('CLI cutover retains legacy data and native IPC without a competing legacy writer', () => {
  const service = read('WorkspaceWallpapers.qml');
  for (const file of ['assignments.json', 'preferences.json', 'history.json']) assert.ok(service.includes(file), file);
  for (const name of ['assign', 'clear', 'undo', 'reload', 'status']) assert.match(service, new RegExp(`function\\s+${name}\\(`));
  assert.match(service, /NativeBackgroundBridge\s*\{/);
  assert.match(service, /WorkspaceWallpaperPanel\s*\{/);
  assert.match(service, /ConfigApplyController\s*\{/);
  assert.match(service, /use-config-cli/);
  assert.doesNotMatch(service, /setText\(|"mkdir"|"rm"|unlink\(|removeRecursively|watchChanges:\s*true/);
  assert.match(read('cli/runtime-store.cjs'), /io\.fsyncSync\(tempFd\)/);
  assert.match(read('cli/runtime-store.cjs'), /io\.renameSync\(temporary, paths\.applied\)/);
});

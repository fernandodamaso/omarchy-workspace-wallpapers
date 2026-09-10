'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('manifest clones the stock Omarchy background service', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.id, 'io.github.fernandodamaso.workspace-wallpapers');
  assert.equal(manifest.version, '0.1.0');
  assert.deepEqual(manifest.kinds, ['service']);
  assert.equal(manifest.entryPoints.service, 'WorkspaceWallpapers.qml');
  assert.equal(manifest.entryPoints.panel, undefined);
  assert.equal(manifest.omarchy.clonedFrom, 'omarchy.background');
});

test('native background bridge keeps the current stock IPC method signatures', () => {
  const bridge = read('NativeBackgroundBridge.qml');
  assert.match(bridge, /target:\s*"background"/);
  assert.match(bridge, /function\s+refresh\(\):\s*void/);
  assert.match(bridge, /function\s+set\(path:\s*string\):\s*void/);
  assert.match(bridge, /function\s+setInstant\(path:\s*string\):\s*void/);
  assert.match(bridge, /function\s+transition\(fromPath:\s*string,\s*path:\s*string\):\s*void/);
  assert.match(bridge, /function\s+themeTransition\(fromPath:\s*string,\s*path:\s*string,\s*finalPath:\s*string,\s*colorsB64:\s*string,\s*shellB64:\s*string\):\s*void/);
});

test('workspace IPC retains transitional operations and completion notifications', () => {
  const service = read('WorkspaceWallpapers.qml');
  assert.match(service, /target:\s*"workspace-wallpapers"/);
  for (const name of ['assign', 'clear', 'undo', 'reload', 'status']) {
    assert.match(service, new RegExp(`function\\s+${name}\\(`));
  }
  assert.match(service, /signal\s+operationFinished\(result:\s*string\)/);
  assert.doesNotMatch(service, /function\s+(playlist|schedule|randomize|video)\s*\(/i);
});

test('non-visual IPC routes mutations to the existing service methods', () => {
  const service = read('WorkspaceWallpapers.qml');
  assert.match(service, /function assign\(workspaceKey: string, path: string\): void\s*\{\s*root\.requestAssignment\(workspaceKey, path\)/);
  assert.match(service, /function clear\(workspaceKey: string\): void\s*\{\s*root\.clearAssignment\(workspaceKey\)/);
  assert.match(service, /function undo\(workspaceKey: string\): void\s*\{\s*root\.requestUndo\(workspaceKey\)/);
  assert.match(service, /importProc\.command\s*=\s*\[importScriptPath, source\]/);
  assert.doesNotMatch(service, /Settings\s*\{|WallpaperBrowser\s*\{|PickerController\s*\{/);
});

test('legacy preferences history and revision-scoped undo remain service-owned', () => {
  const service = read('WorkspaceWallpapers.qml');
  assert.match(service, /preferences\.json/);
  assert.match(service, /history\.json/);
  assert.match(service, /stateReady/);
  assert.match(service, /preferencesReady/);
  assert.match(service, /historyReady/);
  assert.match(service, /payload\.sourcePreferences = sourcePreferencesData\(\)/);
  assert.match(service, /payload\.history = historyData\(\)/);
  assert.match(service, /Model\.undoCandidate\(historyData\(\), key, assignmentRevision\)/);
  assert.match(service, /onSaved:\s*root\.commitPendingHistorySave\(\)/);
  assert.match(service, /onSaved:\s*root\.commitPendingSourcePreferencesSave\(\)/);
});

test('current documentation does not advertise a graphical settings entry', () => {
  assert.equal(fs.existsSync(path.join(root, 'examples/omarchy-menu.jsonc')), false);
  assert.doesNotMatch(read('README.md'), /shell summon io\.github\.fernandodamaso\.workspace-wallpapers/);
});

test('assignment state changes only after FileView save confirmation', () => {
  const service = read('WorkspaceWallpapers.qml');
  assert.match(service, /atomicWrites:\s*true/);
  assert.match(service, /pendingState/);
  assert.match(service, /onSaved:\s*root\.commitPendingSave\(\)/);
  assert.match(service, /onSaveFailed:/);
  assert.match(service, /pendingSave\s*=/);
});

test('failed saves reset FileView before the next mutation', () => {
  const service = read('WorkspaceWallpapers.qml');
  assert.match(service, /function failPendingSave\([\s\S]*?stateFile\.reload\(\)/);
});

test('service retains root and IPC operationFinished signals for existing consumers', () => {
  const service = read('WorkspaceWallpapers.qml');
  assert.match(service, /signal\s+operationFinished\(result:\s*string\)/);
  assert.match(service, /root\.operationFinished\(payload\)/);
  assert.match(service, /workspaceIpc\.operationFinished\(payload\)/);
});

test('per-screen panel resolves wallpaper from each monitor active workspace', () => {
  const panel = read('WorkspaceWallpaperPanel.qml');
  assert.match(panel, /Hyprland\.monitorFor\(modelData\)/);
  assert.match(panel, /activeWorkspace/);
  assert.match(panel, /assignmentForWorkspace/);
  assert.match(panel, /Image\.PreserveAspectCrop/);
});

test('panel imports Quickshell root and native refresh can invalidate the global fallback image', () => {
  const panel = read('WorkspaceWallpaperPanel.qml');
  const service = read('WorkspaceWallpapers.qml');
  assert.match(panel, /^import Quickshell$/m);
  assert.match(service, /property int backgroundVersion:/);
  assert.match(panel, /controller\.backgroundVersion/);
});

test('v0.1 renderer and import helper stay static-image only', () => {
  const panel = read('WorkspaceWallpaperPanel.qml');
  const importer = read('bin/import-image');
  assert.doesNotMatch(panel, /Video|MediaPlayer|BackgroundMedia/);
  assert.match(importer, /image\/png/);
  assert.match(importer, /image\/jpeg/);
  assert.match(importer, /image\/webp/);
  assert.doesNotMatch(importer, /video\//);
});

test('WP-03 panel uses generation-safe per-screen loads and scratchpad retention', () => {
  const panel = read('WorkspaceWallpaperPanel.qml');
  assert.match(panel, /property var renderState:\s*Model\.emptyRenderState\(\)/);
  assert.match(panel, /Model\.wallpaperWorkspace\(/);
  assert.match(panel, /Model\.requestRender\(/);
  assert.match(panel, /Model\.completeRender\(/);
  assert.match(panel, /Model\.cancelRender\(/);
  assert.match(panel, /property int loadGeneration:/);
  assert.match(panel, /property string loadPath:/);
  assert.match(panel, /Component\.onDestruction/);
  assert.match(panel, /cache:\s*false/);
});

test('WP-03 same-path reloads are revision-driven without polling or idle writes', () => {
  const service = read('WorkspaceWallpapers.qml');
  const panel = read('WorkspaceWallpaperPanel.qml');
  assert.match(service, /property int renderRevision:/);
  assert.match(service, /renderRevision\s*\+=\s*1/);
  assert.match(panel, /controller\.renderRevision/);
  assert.doesNotMatch(service, /\bTimer\s*\{/);
  assert.doesNotMatch(service, /\bhyprctl\b/);
});

test('theme transition keeps payload application independent of image decoding', () => {
  const service = read('WorkspaceWallpapers.qml');
  assert.match(
    service,
    /function\s+themeTransitionNative\([\s\S]*?setNativeBackground\([\s\S]*?applyThemePayload\(colorsB64,\s*shellB64\)/
  );
});

test('local pivot handoff explicitly gates compositor-only behavior', () => {
  const smoke = read('docs/cli-pivot-local-gate.md');
  const required = [
    'Quickshell/Hyprland rendering',
    'workspace switching',
    'monitor behavior',
    'explicit apply',
    'lock/unlock',
    'stock renderer restoration'
  ];
  for (const phrase of required) assert.match(smoke, new RegExp(phrase.replace('/', '\\/'), 'i'));
  assert.match(smoke, /LOCAL GATE/i);
});

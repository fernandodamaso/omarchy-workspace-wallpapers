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
  assert.deepEqual(manifest.kinds, ['service', 'panel']);
  assert.equal(manifest.entryPoints.service, 'WorkspaceWallpapers.qml');
  assert.equal(manifest.entryPoints.panel, 'Settings.qml');
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

test('workspace IPC exposes only WP-01 operations and an operationFinished signal', () => {
  const service = read('WorkspaceWallpapers.qml');
  assert.match(service, /target:\s*"workspace-wallpapers"/);
  for (const name of ['assign', 'clear', 'reload', 'status']) {
    assert.match(service, new RegExp(`function\\s+${name}\\(`));
  }
  assert.match(service, /signal\s+operationFinished\(result:\s*string\)/);
  assert.doesNotMatch(service, /function\s+(playlist|schedule|randomize|video)\s*\(/i);
});

test('WP-02 panel uses the scoped service and native picker contracts', () => {
  const settings = read('Settings.qml');
  const picker = read('components/PickerController.qml');
  const row = read('components/WorkspaceRow.qml');
  assert.match(settings, /shell\.serviceFor\(manifest\.id\)/);
  // The panel must call the service root's own methods; assign/clear exist
  // only on the inner IpcHandler, not on the object serviceFor() returns.
  assert.match(settings, /wallpaperService\.requestAssignment\(/);
  assert.match(settings, /wallpaperService\.clearAssignment\(/);
  // Picker directories mirror omarchy-theme-bg-switcher: current theme
  // backgrounds plus the per-theme user folder; no invented env overrides.
  assert.match(settings, /current\/theme\.name/);
  assert.match(settings, /current\/theme\/backgrounds/);
  assert.doesNotMatch(settings, /OMARCHY_IMAGE_SELECTOR/);
  assert.match(settings, /composeWorkspaceRows/);
  assert.match(settings, /onChooseRequested/);
  assert.match(settings, /onResetRequested/);
  assert.match(settings, /Keys\.onEscapePressed/);
  assert.match(settings, /Color\.|Style\./);
  assert.doesNotMatch(settings, /assignments\.json/);
  assert.match(picker, /command\s*=\s*\[/);
  assert.match(picker, /omarchy-menu-images/);
  assert.match(picker, /targetKey/);
  assert.match(picker, /expectedStop/);
  assert.match(row, /signal\s+chooseRequested/);
  assert.match(row, /signal\s+resetRequested/);
});

test('workspace wallpaper panel exposes visual source browsing and stable target wiring', () => {
  const settings = read('Settings.qml');
  const browser = read('WallpaperBrowser.qml');
  const row = read('components/WorkspaceRow.qml');
  const sources = read('components/WallpaperSources.qml');
  const preview = read('components/WallpaperPreview.qml');
  const service = read('WorkspaceWallpapers.qml');

  assert.match(settings, /WallpaperBrowser\s*\{/);
  assert.match(settings, /browserTargetKey/);
  assert.match(settings, /onThumbnailSizeChangedByUser/);
  assert.match(settings, /zenity.*file-selection/);
  assert.match(settings, /xdg-open/);
  assert.match(settings, /Recently used/);
  assert.match(browser, /signal\s+selected\(path:\s*string\)/);
  assert.match(browser, /signal\s+sortChanged\(value:\s*string\)/);
  assert.match(browser, /Use this wallpaper/);
  assert.match(browser, /processSerial/);
  assert.match(browser, /onStreamFinished/);
  assert.match(row, /DropArea\s*\{/);
  assert.match(row, /signal\s+undoRequested/);
  // Presentation contracts follow the component that now owns the source.
  assert.match(sources, /Dropdown\s*\{/);
  assert.match(sources, /model:\s*root\.folders/);
  assert.match(sources, /signal\s+removeFolderRequested\(path:\s*string\)/);
  assert.match(preview, /Image\.PreserveAspectCrop/);
  assert.match(preview, /asynchronous:\s*true/);
  assert.match(preview, /Using global background/);
  assert.match(service, /preferences\.json/);
  assert.match(service, /history\.json/);
  assert.match(service, /stateReady/);
});

test('WP-02 optional menu example is an inert documented entry', () => {
  const example = read('examples/omarchy-menu.jsonc');
  assert.match(example, /Workspace Wallpapers/);
  assert.match(example, /shell summon io\.github\.fernandodamaso\.workspace-wallpapers/);
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

test('service emits operationFinished on the root item for in-process panels', () => {
  const service = read('WorkspaceWallpapers.qml');
  // The IPC handler signal alone is unreachable through serviceFor(); the
  // panel's Connections target is the service root item.
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

test('local smoke handoff explicitly gates compositor-only behavior', () => {
  const smoke = read('docs/local-smoke.md');
  const required = [
    'Quickshell/Hyprland rendering',
    'workspace switching',
    'monitor behavior',
    'picker focus',
    'lock/unlock',
    'stock renderer restoration'
  ];
  for (const phrase of required) assert.match(smoke, new RegExp(phrase.replace('/', '\\/'), 'i'));
  assert.match(smoke, /LOCAL GATE/i);
});

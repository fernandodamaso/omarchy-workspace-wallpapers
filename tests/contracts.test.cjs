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

test('per-screen panel resolves wallpaper from each monitor active workspace', () => {
  const panel = read('WorkspaceWallpaperPanel.qml');
  assert.match(panel, /Hyprland\.monitorFor\(modelData\)/);
  assert.match(panel, /activeWorkspace/);
  assert.match(panel, /assignmentForWorkspace/);
  assert.match(panel, /Image\.PreserveAspectCrop/);
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

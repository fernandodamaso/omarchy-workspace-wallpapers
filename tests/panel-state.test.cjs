'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function panelState() {
  const state = vm.createContext({});
  const file = path.join(__dirname, '..', 'PanelState.js');
  assert.ok(fs.existsSync(file), 'PanelState.js selection helper must exist');
  vm.runInContext(fs.readFileSync(file, 'utf8'), state);
  return state;
}
const rows = [{ key: 'id:2', present: true },
  { key: 'name: Trabalho 日本語 ', present: false }, { key: 'id:7', present: true }];

test('selection retains exact names, including saved-but-absent workspaces', () => {
  const state = panelState();
  assert.equal(state.resolveSelection(rows, 'name: Trabalho 日本語 ', 'id:2'), 'name: Trabalho 日本語 ');
  assert.equal(state.resolveSelection(rows, 'name:Trabalho 日本語', 'id:7'), 'id:7');
});

test('reordering never changes selection identity or mutates the rows', () => {
  const state = panelState();
  const reordered = Object.freeze([Object.freeze(rows[2]), Object.freeze(rows[0]), Object.freeze(rows[1])]);
  assert.equal(state.resolveSelection(reordered, 'id:2', 'id:7'), 'id:2');
  assert.equal(reordered[0].key, 'id:7');
});

test('missing selection falls back to listed focused key then first then empty', () => {
  const state = panelState();
  assert.equal(state.resolveSelection(rows, 'id:9', 'id:7'), 'id:7');
  assert.equal(state.resolveSelection(rows, '', 'id:9'), 'id:2');
  assert.equal(state.resolveSelection([], 'id:2', 'id:2'), '');
  assert.equal(state.resolveSelection(null, 'id:2', 'id:2'), '');
});

test('focused-workspace updates do not steal explicit selection', () => {
  const state = panelState();
  let selected = 'name: Trabalho 日本語 ';
  for (const focused of ['id:7', 'id:2', 'special:scratchpad', '']) {
    selected = state.resolveSelection(rows, selected, focused);
    assert.equal(selected, 'name: Trabalho 日本語 ');
  }
});

test('row disappearance resolves deterministically without normalizing exact keys', () => {
  const state = panelState();
  const remaining = rows.filter(row => row.key !== 'id:7');
  assert.equal(state.resolveSelection(remaining, 'id:7', 'name: Trabalho 日本語 '), 'name: Trabalho 日本語 ');
  assert.equal(state.resolveSelection(remaining, 'id:7', 'id:7'), 'id:2');
});

test('Settings separates UI selection from desktop focus and captured browser target', () => {
  const settings = read('Settings.qml');
  assert.ok(/property string selectedWorkspaceKey:/.test(settings), 'Settings owns selection');
  assert.ok(/PanelState\.resolveSelection\(/.test(settings), 'the tested helper drives actual UI');
  assert.ok(/onSelectionRequested:\s*root\.selectWorkspace\(workspaceKey\)/.test(settings), 'row body selects only');
  assert.ok(/root\.browserTargetKey = key/.test(settings), 'browser target captured at choose');
  assert.ok(/var targetKey = root\.browserTargetKey/.test(settings), 'completion uses captured key');
  assert.doesNotMatch(settings, /Hyprland\.dispatch|hyprctl.*dispatch|dispatch.*workspace/);
});

test('split view is bounded and responsive and detail mutations emit intent only', () => {
  const settings = read('Settings.qml');
  assert.ok(/Style\.space\(1280\)/.test(settings), 'bounded desktop panel');
  assert.ok(/Style\.space\(980\)/.test(settings), 'stacking breakpoint');
  assert.ok(/WorkspaceDetail\s*\{/.test(settings), 'selected detail is mounted');
  assert.ok(/busyFor\(modelData\.key\)/.test(settings), 'saving status uses operation target');
  const file = path.join(__dirname, '..', 'components/WorkspaceDetail.qml');
  assert.ok(fs.existsSync(file), 'WorkspaceDetail exists');
  const detail = fs.readFileSync(file, 'utf8');
  for (const name of ['chooseRequested', 'resetRequested', 'undoRequested', 'imageDropped', 'dropRejected']) {
    assert.ok(new RegExp('signal\\s+' + name + '\\s*\\(').test(detail), name + ' is public');
  }
  assert.ok(/WallpaperPreview\s*\{/.test(detail));
  assert.ok(/visible:\s*root\.undoAvailable/.test(detail), 'conditional Undo is owned by detail');
  assert.ok(/root\.imagePath !== ""/.test(detail), 'global reset requires a custom image');
  assert.doesNotMatch(detail, /shell\.serviceFor|FileView\s*\{|Process\s*\{|requestAssignment|clearAssignment|requestUndo/);
});

test('Escape closes exactly one surface at a time', () => {
  const state = panelState();
  assert.equal(typeof state.dismissTarget, 'function');
  assert.equal(state.dismissTarget(true, true), 'folders');
  assert.equal(state.dismissTarget(true, false), 'folders');
  assert.equal(state.dismissTarget(false, true), 'browser');
  assert.equal(state.dismissTarget(false, false), 'panel');
});

test('native picker cannot revive a closed or replaced session', () => {
  const state = panelState();
  assert.equal(typeof state.pickerMayRestore, 'function');
  assert.equal(state.pickerMayRestore(4, 4, true), true);
  assert.equal(state.pickerMayRestore(5, 4, true), false);
  assert.equal(state.pickerMayRestore(4, 4, false), false);
  assert.equal(state.pickerMayRestore(4, '4', true), false);
});

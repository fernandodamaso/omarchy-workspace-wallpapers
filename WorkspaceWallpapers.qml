import Quickshell
import Quickshell.Io
import QtQuick
import qs.Commons
import qs.Ui
import "WorkspaceModel.js" as Model

Item {
  id: root

  readonly property string home: Quickshell.env("HOME")
  readonly property string stateDirectory: home + "/.config/omarchy/workspace-wallpapers"
  readonly property string statePath: stateDirectory + "/assignments.json"
  readonly property string preferencesPath: stateDirectory + "/preferences.json"
  readonly property string historyPath: stateDirectory + "/history.json"
  readonly property string currentBackgroundLink: home + "/.local/state/omarchy/current/background"
  readonly property string importScriptPath: localFilePath(Qt.resolvedUrl("bin/import-image"))

  property var configState: Model.emptyState()
  property var sourcePreferencesState: Model.emptySourcePreferences()
  property var historyState: Model.emptyHistoryState()
  property string currentBackground: ""
  property string displayedBackground: ""
  property int backgroundVersion: 0
  property int renderRevision: 0
  property string pendingAssignmentKey: ""
  property string pendingAssignmentSource: ""
  property string pendingPickerKey: ""
  property bool pendingReload: false
  property bool pendingSave: false
  property var pendingState: null
  property bool pendingPreferenceSave: false
  property var pendingSourcePreferencesState: null
  property bool pendingHistorySave: false
  property var pendingHistoryState: null
  property string pendingHistoryPreviousPath: ""
  property string pendingHistoryName: ""
  property bool pendingHistoryRecordUndo: false
  property string pendingOperation: ""
  property string pendingOperationKey: ""
  property string pendingOperationPath: ""
  property string pendingOperationReason: ""
  property int assignmentRevision: 0
  property bool stateReady: false
  property bool preferencesReady: false
  property bool historyReady: false
  readonly property bool mutationBusy: !stateReady || !preferencesReady || !historyReady
    || pendingSave || pendingAssignmentKey !== "" || importProc.running
    || pendingPreferenceSave || pendingHistorySave

  // In-process completion signal for the plugin's own panel. The identical
  // payload is also emitted on the workspaceIpc IPC handler below; IPC
  // signals live on the handler object, so serviceFor() consumers need this
  // root-level signal to observe completions.
  signal operationFinished(result: string)
  signal sourcePreferencesSaveFinished(success: bool)

  function localFilePath(url) {
    var value = String(url || "")
    if (value.indexOf("file://") === 0) value = value.substring(7)
    return decodeURIComponent(value)
  }

  function assignmentForWorkspace(workspace) {
    return Model.assignmentForWorkspace(configState, workspace)
  }

  function preferredWorkspaceKey(workspace) {
    return Model.preferredWorkspaceKey(workspace)
  }

  function invalidateRenders() {
    renderRevision += 1
  }

  function saveState(next, operation, key, path, reason) {
    if (pendingSave) {
      finishOperation(operation, false, key, path, "save-busy")
      return false
    }
    pendingState = Model.parseState(JSON.stringify(next))
    pendingOperation = String(operation || "")
    pendingOperationKey = String(key || "")
    pendingOperationPath = String(path || "")
    pendingOperationReason = String(reason || "saved")
    pendingSave = true
    stateFile.setText(JSON.stringify(pendingState, null, 2) + "\n")
    return true
  }

  function historyData() {
    return Model.parseHistoryState(JSON.stringify(historyState))
  }

  function clearPendingMutation() {
    pendingOperation = ""
    pendingOperationKey = ""
    pendingOperationPath = ""
    pendingOperationReason = ""
    pendingHistoryPreviousPath = ""
    pendingHistoryName = ""
    pendingHistoryRecordUndo = false
  }

  function finishPendingOperation(ok, reason) {
    var operation = pendingOperation
    var key = pendingOperationKey
    var path = pendingOperationPath
    var finalReason = reason === undefined ? pendingOperationReason : reason
    clearPendingMutation()
    finishOperation(operation, ok, key, path, finalReason)
  }

  function saveMutationHistory() {
    if (pendingHistorySave) return false

    var next = historyData()
    if (pendingOperation === "assign") {
      next = Model.recordRecent(next, pendingOperationPath, pendingHistoryName, Date.now())
      next = Model.recordUndo(next, pendingOperationKey,
        pendingHistoryPreviousPath, assignmentRevision)
    } else if (pendingOperation === "clear" && pendingHistoryRecordUndo) {
      next = Model.recordUndo(next, pendingOperationKey,
        pendingHistoryPreviousPath, assignmentRevision)
    } else if (pendingOperation === "undo") {
      next = Model.clearUndo(next)
    } else {
      return false
    }

    pendingHistoryState = Model.parseHistoryState(JSON.stringify(next))
    pendingHistorySave = true
    historyFile.setText(JSON.stringify(pendingHistoryState, null, 2) + "\n")
    return true
  }

  function commitPendingSave() {
    if (!pendingSave) return
    var operation = pendingOperation
    configState = pendingState || Model.emptyState()
    pendingState = null
    pendingSave = false
    assignmentRevision += 1
    invalidateRenders()
    var needsHistory = operation === "assign" || operation === "undo"
      || (operation === "clear" && pendingHistoryRecordUndo)
    if (needsHistory) {
      if (saveMutationHistory()) return
      finishPendingOperation(true, pendingOperationReason + "-history-unavailable:save-busy")
      return
    }
    finishPendingOperation(true)
  }

  function failPendingSave(error) {
    if (!pendingSave) return
    var operation = pendingOperation
    var key = pendingOperationKey
    var path = pendingOperationPath
    pendingState = null
    pendingSave = false
    clearPendingMutation()
    finishOperation(operation, false, key, path, "save-failed:" + String(error))
    stateFile.reload()
  }

  function commitPendingHistorySave() {
    if (!pendingHistorySave) return
    historyState = pendingHistoryState || Model.emptyHistoryState()
    pendingHistoryState = null
    pendingHistorySave = false
    finishPendingOperation(true)
  }

  function failPendingHistorySave(error) {
    if (!pendingHistorySave) return
    var operation = pendingOperation
    var key = pendingOperationKey
    var path = pendingOperationPath
    var reason = pendingOperationReason
    pendingHistoryState = null
    pendingHistorySave = false
    clearPendingMutation()
    historyFile.reload()
    finishOperation(operation, true, key, path,
      reason + "-history-unavailable:" + String(error || "save-failed"))
  }

  function sourcePreferencesData() {
    return Model.parseSourcePreferences(JSON.stringify(sourcePreferencesState))
  }

  function saveSourcePreferences(next) {
    if (pendingPreferenceSave || mutationBusy) return false
    pendingSourcePreferencesState = Model.parseSourcePreferences(JSON.stringify(next))
    pendingPreferenceSave = true
    preferencesFile.setText(JSON.stringify(pendingSourcePreferencesState, null, 2) + "\n")
    return true
  }

  function commitPendingSourcePreferencesSave() {
    if (!pendingPreferenceSave) return
    sourcePreferencesState = pendingSourcePreferencesState || Model.emptySourcePreferences()
    pendingSourcePreferencesState = null
    pendingPreferenceSave = false
    sourcePreferencesSaveFinished(true)
  }

  function failPendingSourcePreferencesSave() {
    if (!pendingPreferenceSave) return
    pendingSourcePreferencesState = null
    pendingPreferenceSave = false
    sourcePreferencesSaveFinished(false)
    preferencesFile.reload()
  }

  function requestAddSourceFolder(path) {
    return saveSourcePreferences(Model.addSourceFolder(sourcePreferencesData(), path))
  }

  function requestRemoveSourceFolder(path) {
    return saveSourcePreferences(Model.removeSourceFolder(sourcePreferencesData(), path))
  }

  function requestUpdateSourcePreferences(updates) {
    return saveSourcePreferences(Model.updateSourcePreferences(sourcePreferencesData(), updates))
  }

  function finishOperation(operation, ok, key, path, reason, data) {
    var result = {
      operation: String(operation || ""),
      ok: ok === true,
      key: String(key || ""),
      path: String(path || ""),
      reason: String(reason || "")
    }
    if (data !== undefined && data !== null) result.data = data
    var payload = JSON.stringify(result)
    workspaceIpc.operationFinished(payload)
    root.operationFinished(payload)
    return payload
  }

  function persistAssignment(workspaceKey, imagePath, previousPath, sourceName) {
    var key = Model.normalizeWorkspaceKey(workspaceKey)
    var path = Model.normalizeImagePath(imagePath)
    if (!key || !path) {
      pendingHistoryPreviousPath = ""
      pendingHistoryName = ""
      pendingHistoryRecordUndo = false
      finishOperation("assign", false, key, path, "invalid-assignment")
      return
    }
    pendingHistoryPreviousPath = Model.normalizeImagePath(previousPath)
    pendingHistoryName = String(sourceName || "")
    saveState(Model.withAssignment(configState, key, path), "assign", key, path, "assigned")
  }

  function requestAssignment(workspaceKey, sourcePath) {
    var key = Model.normalizeWorkspaceKey(workspaceKey)
    var source = Model.normalizeImagePath(sourcePath)
    if (!key) {
      finishOperation("assign", false, "", source, "invalid-workspace-key")
      return
    }
    if (!source) {
      finishOperation("assign", false, key, "", "unsupported-image-path")
      return
    }
    if (mutationBusy) {
      finishOperation("assign", false, key, source, "mutation-busy")
      return
    }

    pendingAssignmentKey = key
    pendingAssignmentSource = source
    pendingHistoryPreviousPath = Model.normalizeImagePath(configState.assignments[key] || "")
    pendingHistoryName = source.substring(source.lastIndexOf("/") + 1)
    pendingHistoryRecordUndo = false
    importProc.command = [importScriptPath, source]
    importProc.running = true
  }

  function clearAssignment(workspaceKey) {
    var key = Model.normalizeWorkspaceKey(workspaceKey)
    if (!key) {
      finishOperation("clear", false, "", "", "invalid-workspace-key")
      return
    }
    if (mutationBusy) {
      finishOperation("clear", false, key, "", "mutation-busy")
      return
    }
    var existed = !!configState.assignments[key]
    pendingHistoryPreviousPath = Model.normalizeImagePath(configState.assignments[key] || "")
    pendingHistoryName = ""
    pendingHistoryRecordUndo = existed
    saveState(
      Model.withoutAssignment(configState, key),
      "clear",
      key,
      "",
      existed ? "cleared" : "already-clear"
    )
  }

  function requestUndo(workspaceKey) {
    var key = Model.normalizeWorkspaceKey(workspaceKey)
    if (!key) {
      finishOperation("undo", false, "", "", "invalid-workspace-key")
      return
    }
    if (mutationBusy) {
      finishOperation("undo", false, key, "", "mutation-busy")
      return
    }

    var candidate = Model.undoCandidate(historyData(), key, assignmentRevision)
    if (candidate.action !== "available") {
      finishOperation("undo", false, key, "", "undo-stale")
      return
    }

    pendingHistoryPreviousPath = ""
    pendingHistoryName = ""
    var next = candidate.path
      ? Model.withAssignment(configState, key, candidate.path)
      : Model.withoutAssignment(configState, key)
    saveState(next, "undo", key, candidate.path, "undone")
  }

  function requestReload() {
    if (pendingReload || mutationBusy) {
      finishOperation("reload", false, "", "", "reload-busy")
      return
    }
    pendingReload = true
    stateFile.reload()
  }

  function statusData() {
    var payload = Model.statusPayload(configState, displayedBackground, statePath)
    payload.sourcePreferences = sourcePreferencesData()
    payload.history = historyData()
    payload.assignmentRevision = assignmentRevision
    return payload
  }

  function statusJson() {
    return JSON.stringify(statusData())
  }

  function refreshBackground() {
    if (!backgroundReader.running) backgroundReader.running = true
  }

  function setNativeBackground(path, instant) {
    var normalized = Model.normalizeImagePath(String(path || "").trim())
    currentBackground = normalized
    displayedBackground = normalized
    backgroundVersion += 1
    invalidateRenders()
  }

  function transitionNativeBackground(fromPath, path) {
    setNativeBackground(path, false)
  }

  function applyThemePayload(colorsB64, shellB64) {
    if (colorsB64) Color.loadColors(Util.decodeBase64(colorsB64))
    if (shellB64) Color.loadShell(Util.decodeBase64(shellB64))
    Style.scheduleRefresh()
  }

  function themeTransitionNative(fromPath, path, finalPath, colorsB64, shellB64) {
    setNativeBackground(finalPath || path, false)
    applyThemePayload(colorsB64, shellB64)
  }

  function pickForWorkspace(workspaceKey) {
    var key = Model.normalizeWorkspaceKey(workspaceKey)
    if (!key || imagePicker.running || pendingPickerKey) return
    pendingPickerKey = key
    imagePicker.running = true
  }

  function openThemeSwitcher() {
    if (!themeSwitcher.running) themeSwitcher.running = true
  }

  Process {
    id: prepareStateDirectory
    command: ["mkdir", "-p", root.stateDirectory]
    Component.onCompleted: running = true
    onExited: function(exitCode) {
      if (exitCode === 0) {
        stateFile.reload()
        preferencesFile.reload()
        historyFile.reload()
      }
    }
  }

  FileView {
    id: stateFile
    path: root.statePath
    watchChanges: true
    atomicWrites: true
    printErrors: false
    onLoaded: {
      root.stateReady = true
      if (root.pendingSave) return
      root.configState = Model.parseState(text())
      root.invalidateRenders()
      if (root.pendingReload) {
        root.pendingReload = false
        root.finishOperation("reload", true, "", "", "reloaded")
      }
    }
    onLoadFailed: {
      root.stateReady = true
      if (root.pendingSave) return
      root.configState = Model.emptyState()
      root.invalidateRenders()
      if (root.pendingReload) {
        root.pendingReload = false
        root.finishOperation("reload", true, "", "", "missing-state-uses-empty")
      }
    }
    onSaved: root.commitPendingSave()
    onSaveFailed: function(error) { root.failPendingSave(error) }
    onFileChanged: {
      if (!root.pendingSave) reload()
    }
  }

  FileView {
    id: preferencesFile
    path: root.preferencesPath
    watchChanges: true
    atomicWrites: true
    printErrors: false
    onLoaded: {
      root.preferencesReady = true
      if (root.pendingPreferenceSave) return
      root.sourcePreferencesState = Model.parseSourcePreferences(text())
    }
    onLoadFailed: {
      root.preferencesReady = true
      if (root.pendingPreferenceSave) return
      root.sourcePreferencesState = Model.emptySourcePreferences()
    }
    onSaved: root.commitPendingSourcePreferencesSave()
    onSaveFailed: root.failPendingSourcePreferencesSave()
    onFileChanged: {
      if (!root.pendingPreferenceSave) reload()
    }
  }

  FileView {
    id: historyFile
    path: root.historyPath
    watchChanges: true
    atomicWrites: true
    printErrors: false
    onLoaded: {
      root.historyReady = true
      if (root.pendingHistorySave) return
      var next = Model.parseHistoryState(text())
      root.historyState = next
      if (next.undo && next.undo.revision > root.assignmentRevision)
        root.assignmentRevision = next.undo.revision
    }
    onLoadFailed: {
      root.historyReady = true
      if (root.pendingHistorySave) return
      root.historyState = Model.emptyHistoryState()
    }
    onSaved: root.commitPendingHistorySave()
    onSaveFailed: function(error) { root.failPendingHistorySave(error) }
    onFileChanged: {
      if (!root.pendingHistorySave) reload()
    }
  }

  Process {
    id: importProc
    command: []
    stdout: StdioCollector {
      id: importStdout
      waitForEnd: true
    }
    stderr: StdioCollector {
      id: importStderr
      waitForEnd: true
    }
    onExited: function(exitCode) {
      var key = root.pendingAssignmentKey
      var source = root.pendingAssignmentSource
      var previousPath = root.pendingHistoryPreviousPath
      var sourceName = root.pendingHistoryName
      var imported = String(importStdout.text || "").trim()
      var errorText = String(importStderr.text || "").trim()
      root.pendingAssignmentKey = ""
      root.pendingAssignmentSource = ""
      root.pendingHistoryPreviousPath = ""
      root.pendingHistoryName = ""

      if (exitCode === 0 && Model.normalizeImagePath(imported)) {
        root.persistAssignment(key, imported, previousPath, sourceName)
      } else {
        root.finishOperation("assign", false, key, source, errorText || "import-failed")
      }
    }
  }

  Process {
    id: imagePicker
    command: ["omarchy-theme-bg-switcher"]
    stdout: StdioCollector {
      id: pickerStdout
      waitForEnd: true
    }
    onExited: function(exitCode) {
      var key = root.pendingPickerKey
      var source = String(pickerStdout.text || "").trim()
      root.pendingPickerKey = ""
      if (exitCode === 0 && source) root.requestAssignment(key, source)
    }
  }

  Process {
    id: themeSwitcher
    command: ["bash", "-lc", "theme=$(omarchy-theme-switcher); [[ -n $theme ]] && omarchy-theme-set \"$theme\" >/dev/null 2>&1 &"]
    onExited: root.refreshBackground()
  }

  Process {
    id: backgroundReader
    command: ["readlink", "-f", root.currentBackgroundLink]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.setNativeBackground(String(text || "").trim(), true)
    }
  }

  NativeBackgroundBridge {
    controller: root
  }

  IpcHandler {
    id: workspaceIpc
    target: "workspace-wallpapers"

    function assign(workspaceKey: string, path: string): void {
      root.requestAssignment(workspaceKey, path)
    }

    function clear(workspaceKey: string): void {
      root.clearAssignment(workspaceKey)
    }

    function undo(workspaceKey: string): void {
      root.requestUndo(workspaceKey)
    }

    function reload(): void {
      root.requestReload()
    }

    function status(): string {
      var data = root.statusData()
      root.finishOperation("status", true, "", "", "ok", data)
      return JSON.stringify(data)
    }

    signal operationFinished(result: string)
  }

  Variants {
    model: Quickshell.screens

    WorkspaceWallpaperPanel {
      controller: root
    }
  }

  Component.onCompleted: refreshBackground()
}

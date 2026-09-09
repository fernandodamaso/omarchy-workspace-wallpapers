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
  readonly property string currentBackgroundLink: home + "/.local/state/omarchy/current/background"
  readonly property string importScriptPath: localFilePath(Qt.resolvedUrl("bin/import-image"))

  property var configState: Model.emptyState()
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
  property string pendingOperation: ""
  property string pendingOperationKey: ""
  property string pendingOperationPath: ""
  property string pendingOperationReason: ""
  property int assignmentRevision: 0
  readonly property bool mutationBusy: pendingSave || pendingAssignmentKey !== "" || importProc.running

  // In-process completion signal for the plugin's own panel. The identical
  // payload is also emitted on the workspaceIpc IPC handler below; IPC
  // signals live on the handler object, so serviceFor() consumers need this
  // root-level signal to observe completions.
  signal operationFinished(result: string)

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

  function commitPendingSave() {
    if (!pendingSave) return
    var operation = pendingOperation
    var key = pendingOperationKey
    var path = pendingOperationPath
    var reason = pendingOperationReason
    configState = pendingState || Model.emptyState()
    pendingState = null
    pendingOperation = ""
    pendingOperationKey = ""
    pendingOperationPath = ""
    pendingOperationReason = ""
    pendingSave = false
    assignmentRevision += 1
    invalidateRenders()
    finishOperation(operation, true, key, path, reason)
  }

  function failPendingSave(error) {
    if (!pendingSave) return
    var operation = pendingOperation
    var key = pendingOperationKey
    var path = pendingOperationPath
    pendingState = null
    pendingOperation = ""
    pendingOperationKey = ""
    pendingOperationPath = ""
    pendingOperationReason = ""
    pendingSave = false
    finishOperation(operation, false, key, path, "save-failed:" + String(error))
    stateFile.reload()
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

  function persistAssignment(workspaceKey, imagePath) {
    var key = Model.normalizeWorkspaceKey(workspaceKey)
    var path = Model.normalizeImagePath(imagePath)
    if (!key || !path) {
      finishOperation("assign", false, key, path, "invalid-assignment")
      return
    }
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
    saveState(
      Model.withoutAssignment(configState, key),
      "clear",
      key,
      "",
      existed ? "cleared" : "already-clear"
    )
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
    return Model.statusPayload(configState, displayedBackground, statePath)
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
      if (exitCode === 0) stateFile.reload()
    }
  }

  FileView {
    id: stateFile
    path: root.statePath
    watchChanges: true
    atomicWrites: true
    printErrors: false
    onLoaded: {
      if (root.pendingSave) return
      root.configState = Model.parseState(text())
      root.invalidateRenders()
      if (root.pendingReload) {
        root.pendingReload = false
        root.finishOperation("reload", true, "", "", "reloaded")
      }
    }
    onLoadFailed: {
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
      var imported = String(importStdout.text || "").trim()
      var errorText = String(importStderr.text || "").trim()
      root.pendingAssignmentKey = ""
      root.pendingAssignmentSource = ""

      if (exitCode === 0 && Model.normalizeImagePath(imported)) {
        root.persistAssignment(key, imported)
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

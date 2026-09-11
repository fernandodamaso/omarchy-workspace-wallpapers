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
  readonly property string legacyStatePath: stateDirectory + "/assignments.json"
  readonly property string preferencesPath: stateDirectory + "/preferences.json"
  readonly property string historyPath: stateDirectory + "/history.json"
  readonly property string statePath: applyController.capabilityState.statePath || legacyStatePath
  readonly property string currentBackgroundLink: home + "/.local/state/omarchy/current/background"

  property var configState: Model.emptyState()
  property var sourcePreferencesState: Model.emptySourcePreferences()
  property var historyState: Model.emptyHistoryState()
  property string currentBackground: ""
  property string displayedBackground: ""
  property int backgroundVersion: 0
  property int renderRevision: 0
  property int assignmentRevision: 0
  property bool preferencesReady: false
  property bool historyReady: false
  readonly property bool stateReady: applyController.ready
  readonly property bool mutationBusy: !stateReady || applyController.busy

  signal operationFinished(result: string)

  function assignmentForWorkspace(workspace) {
    return Model.assignmentForWorkspace(configState, workspace)
  }
  function preferredWorkspaceKey(workspace) {
    return Model.preferredWorkspaceKey(workspace)
  }
  function invalidateRenders() {
    renderRevision += 1
  }
  function historyData() {
    return Model.parseHistoryState(JSON.stringify(historyState))
  }
  function sourcePreferencesData() {
    return Model.parseSourcePreferences(JSON.stringify(sourcePreferencesState))
  }
  function finishOperation(operation, ok, key, path, reason, data) {
    var result = { operation: String(operation || ""), ok: ok === true, key: String(key || ""), path: String(path || ""), reason: String(reason || "") }
    if (data !== undefined && data !== null) result.data = data
    var payload = JSON.stringify(result)
    workspaceIpc.operationFinished(payload)
    root.operationFinished(payload)
    return payload
  }
  function rejectLegacyMutation(operation, key, path) {
    return finishOperation(operation, false, key, path, "use-config-cli", {
      code: "use-config-cli", message: "Edit desired configuration with workspace-wallpapers assign/clear, then validate and explicitly config apply.",
      renderVerification: "unknown"
    })
  }
  function requestAssignment(workspaceKey, sourcePath) { return rejectLegacyMutation("assign", workspaceKey, sourcePath) }
  function clearAssignment(workspaceKey) { return rejectLegacyMutation("clear", workspaceKey, "") }
  function requestUndo(workspaceKey) { return rejectLegacyMutation("undo", workspaceKey, "") }
  function requestReload() {
    if (!applyController.reload(true)) {
      finishOperation("reload", false, "", "", "reload-busy")
      return
    }
    preferencesFile.reload()
    historyFile.reload()
  }
  function statusData() {
    var payload = Model.statusPayload(configState, displayedBackground, statePath)
    payload.sourcePreferences = sourcePreferencesData()
    payload.history = historyData()
    payload.assignmentRevision = assignmentRevision
    payload.configuration = applyController.capabilityState
    payload.renderVerification = "unknown"
    return payload
  }
  function statusJson() { return JSON.stringify(statusData()) }

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

  ConfigApplyController {
    id: applyController
    onSnapshotPublished: function(runtime) {
      root.configState = { version: 1, assignments: runtime.snapshot.assignments }
      root.assignmentRevision = runtime.snapshot.revision
      root.invalidateRenders()
    }
    onOperationFinished: function(result) {
      workspaceIpc.operationFinished(result)
      root.operationFinished(result)
    }
    onReloadFinished: function(success, message) {
      root.finishOperation("reload", success, "", "", success ? "reloaded" : "reload-failed", { message: message })
    }
  }

  // Historical UI metadata is readable but never rewritten by this runtime.
  FileView {
    id: preferencesFile
    path: root.preferencesPath
    printErrors: false
    onLoaded: { root.sourcePreferencesState = Model.parseSourcePreferences(text()); root.preferencesReady = true }
    onLoadFailed: root.preferencesReady = true
  }
  FileView {
    id: historyFile
    path: root.historyPath
    printErrors: false
    onLoaded: { root.historyState = Model.parseHistoryState(text()); root.historyReady = true }
    onLoadFailed: root.historyReady = true
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
    function assign(workspaceKey: string, path: string): void { root.requestAssignment(workspaceKey, path) }
    function clear(workspaceKey: string): void { root.clearAssignment(workspaceKey) }
    function undo(workspaceKey: string): void { root.requestUndo(workspaceKey) }
    function reload(): void { root.requestReload() }
    function status(): string {
      var data = root.statusData()
      root.finishOperation("status", true, "", "", "ok", data)
      return JSON.stringify(data)
    }
    function capabilities(): string { return applyController.capabilities() }
    function applyConfig(requestJson: string): string { return applyController.applyJson(requestJson) }
    function operationStatus(requestId: string): string { return applyController.operationStatus(requestId) }
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

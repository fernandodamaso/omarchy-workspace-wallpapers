import Quickshell
import Quickshell.Hyprland
import Quickshell.Io
import Quickshell.Wayland
import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Ui
import "WorkspaceModel.js" as Model
import "components"

Item {
  id: root

  property var shell: null
  property var manifest: null
  property var service: null
  property bool opened: false
  property bool browserOpen: false
  property string browserTargetKey: ""
  property var rows: []
  property var extraWorkspaceKeys: []
  property var sourcePreferences: Model.emptySourcePreferences()
  property var history: Model.emptyHistoryState()
  property int assignmentRevision: 0
  property string sourceSelection: "theme"
  property string sortSelection: "name"
  property string thumbnailSizeSelection: "medium"
  property bool sourcePreferencesPending: false
  property bool sourceSectionOpen: false
  property string sourceTargetKey: ""
  property var sourceTargetOptions: []
  property string legacyFolderDirectory: ""
  property string pendingFolderDialogTargetKey: ""
  property bool pendingFolderDialogReopen: false
  property bool folderDialogExited: false
  property int folderDialogExitCode: 0
  property bool folderDialogOutputReady: false
  property string statusMessage: ""
  property bool statusError: false
  property string rowErrorKey: ""
  property string rowMessageKey: ""
  property string rowMessage: ""
  property string addWorkspaceError: ""

  readonly property string home: Quickshell.env("HOME")
  readonly property string stateHome: home + "/.local/state"
  // Same directories omarchy-theme-bg-switcher hands to omarchy-menu-images:
  // the current theme's backgrounds plus the user's per-theme folder.
  property string themeName: ""
  readonly property var themeDirectories: {
    var directories = [root.stateHome + "/omarchy/current/theme/backgrounds"]
    if (root.themeName)
      directories.push(root.home + "/.config/omarchy/backgrounds/" + root.themeName)
    return directories
  }
  readonly property var pickerDirectories: {
    var directories = Model.sourceDirectories(
      root.sourcePreferences, root.sourceSelection, root.themeDirectories)
    var legacy = String(root.legacyFolderDirectory || "").trim()
    if (legacy.charAt(0) === "/" && !/[\0\r\n\t]/.test(legacy)
        && directories.indexOf(legacy) === -1)
      directories.push(legacy)
    return directories
  }
  readonly property var sourceOptions: [
    { label: "Current theme", value: "theme" },
    { label: "My folders", value: "folders" },
    { label: "Recently used", value: "recent" },
    { label: "All sources", value: "all" }
  ]
  readonly property var wallpaperService: shell && manifest && manifest.id
    ? shell.serviceFor(manifest.id) : service
  readonly property var liveWorkspaces: Hyprland.workspaces.values

  function open(payloadJson) {
    var payload = {}
    try { payload = JSON.parse(payloadJson || "{}") || {} } catch (error) {}
    if (payload.folder !== undefined) root.legacyFolderDirectory = String(payload.folder || "")
    root.statusMessage = ""
    root.statusError = false
    root.browserOpen = false
    root.browserTargetKey = ""
    root.opened = true
    root.refreshRows()
    Qt.callLater(function() {
      if (root.opened) keyCatcher.forceActiveFocus()
    })
  }

  function close() {
    pickerController.cancel(false)
    root.browserOpen = false
    root.browserTargetKey = ""
    root.pendingFolderDialogReopen = false
    root.opened = false
  }

  function dismiss() {
    root.browserOpen = false
    root.browserTargetKey = ""
    root.pendingFolderDialogReopen = false
    if (shell && manifest && typeof shell.hide === "function") shell.hide(manifest.id)
    else root.close()
  }

  function snapshot() {
    if (!wallpaperService || typeof wallpaperService.statusData !== "function")
      return { assignments: {} }
    var data = wallpaperService.statusData() || { assignments: {} }
    root.syncSourcePreferences(data, false)
    if (data.history !== undefined)
      root.history = Model.parseHistoryState(JSON.stringify(data.history))
    if (data.assignmentRevision !== undefined)
      root.assignmentRevision = Number(data.assignmentRevision) || 0
    return data
  }

  function syncSourcePreferences(data, force) {
    if (!data || data.sourcePreferences === undefined) return
    var next = Model.parseSourcePreferences(JSON.stringify(data.sourcePreferences))
    if (!force && root.sourcePreferencesPending
        && JSON.stringify(next) !== JSON.stringify(root.sourcePreferences)) return
    root.sourcePreferencesPending = false
    root.sourcePreferences = next
    root.sourceSelection = next.lastSource
    root.sortSelection = next.sort
    root.thumbnailSizeSelection = next.thumbnailSize
    if (sourceDropdown) sourceDropdown.value = next.lastSource
  }

  function refreshRows() {
    var data = snapshot()
    root.rows = Model.composeWorkspaceRows(
      root.liveWorkspaces,
      data.assignments || {},
      root.extraWorkspaceKeys
    )
    root.sourceTargetOptions = root.rows.map(function(row) {
      return { label: row.label, value: row.key }
    })
    var targetExists = root.rows.some(function(row) { return row.key === root.sourceTargetKey })
    if (!targetExists && !root.browserOpen)
      root.sourceTargetKey = root.rows.length ? root.rows[0].key : ""
  }

  function isBusy() {
    return !!(wallpaperService && wallpaperService.mutationBusy)
  }

  function errorFor(key) {
    return root.statusError && root.rowErrorKey === key ? root.statusMessage : ""
  }

  function rowMessageFor(key) {
    return root.rowMessageKey === key ? root.rowMessage : ""
  }

  function labelForKey(key) {
    for (var i = 0; i < root.rows.length; i++) {
      if (root.rows[i].key === key) return String(root.rows[i].label || key)
    }
    return String(key || "")
  }

  function isCurrentWorkspace(key) {
    var current = Hyprland.focusedWorkspace
    return Model.workspaceKeyCandidates(current).indexOf(key) !== -1
  }

  function choose(key) {
    if (root.isBusy()) {
      root.showError(key, "Another wallpaper operation is still saving")
      return
    }
    // Keep the target stable while the in-panel browser is open.
    root.sourceTargetKey = key
    root.browserTargetKey = key
    root.browserOpen = true
  }

  function setSourceSelection(value) {
    var source = String(value || "")
    if (source !== "theme" && source !== "folders" && source !== "recent" && source !== "all") return
    if (source === root.sourceSelection) return
    if (!wallpaperService || typeof wallpaperService.requestUpdateSourcePreferences !== "function") {
      sourceDropdown.value = root.sourceSelection
      root.showError("", "Workspace wallpaper service is unavailable")
      return
    }
    var accepted = wallpaperService.requestUpdateSourcePreferences({ lastSource: source })
    if (accepted !== true) {
      sourceDropdown.value = root.sourceSelection
      root.showError("", "Image source settings are still saving")
      return
    }
    root.sourcePreferences = Model.updateSourcePreferences(root.sourcePreferences, {
      lastSource: source
    })
    root.sourceSelection = source
    root.sourcePreferencesPending = true
    root.clearMessage()
  }

  function setSortSelection(value) {
    var sort = String(value || "")
    if (sort !== "name" && sort !== "mtime") return
    if (sort === root.sortSelection) return
    if (!wallpaperService || typeof wallpaperService.requestUpdateSourcePreferences !== "function") {
      root.showError("", "Workspace wallpaper service is unavailable")
      return
    }
    var accepted = wallpaperService.requestUpdateSourcePreferences({ sort: sort })
    if (accepted !== true) {
      root.showError("", "Image source settings are still saving")
      return
    }
    root.sortSelection = sort
    root.sourcePreferences = Model.updateSourcePreferences(root.sourcePreferences, { sort: sort })
    root.sourcePreferencesPending = true
    root.clearMessage()
  }

  function setThumbnailSizeSelection(value) {
    var size = String(value || "")
    if (size !== "small" && size !== "medium" && size !== "large") return
    if (size === root.thumbnailSizeSelection) return
    if (!wallpaperService || typeof wallpaperService.requestUpdateSourcePreferences !== "function") {
      root.showError("", "Workspace wallpaper service is unavailable")
      return
    }
    var accepted = wallpaperService.requestUpdateSourcePreferences({ thumbnailSize: size })
    if (accepted !== true) {
      root.showError("", "Image source settings are still saving")
      return
    }
    root.thumbnailSizeSelection = size
    root.sourcePreferences = Model.updateSourcePreferences(root.sourcePreferences, {
      thumbnailSize: size
    })
    root.sourcePreferencesPending = true
    root.clearMessage()
  }

  function addSourceFolder(path) {
    var folder = String(path || "").trim()
    if (!folder) return
    if (!wallpaperService || typeof wallpaperService.requestAddSourceFolder !== "function") {
      root.showError("", "Workspace wallpaper service is unavailable")
      return
    }
    var next = Model.addSourceFolder(root.sourcePreferences, folder)
    var accepted = wallpaperService.requestAddSourceFolder(folder)
    if (accepted !== true) {
      root.showError("", "Image source settings are still saving")
      return
    }
    root.sourcePreferences = next
    root.sourcePreferencesPending = true
    root.clearMessage()
  }

  function removeSourceFolder(path) {
    if (!wallpaperService || typeof wallpaperService.requestRemoveSourceFolder !== "function") {
      root.showError("", "Workspace wallpaper service is unavailable")
      return
    }
    var next = Model.removeSourceFolder(root.sourcePreferences, path)
    var accepted = wallpaperService.requestRemoveSourceFolder(path)
    if (accepted !== true) {
      root.showError("", "Image source settings are still saving")
      return
    }
    root.sourcePreferences = next
    root.sourcePreferencesPending = true
    root.clearMessage()
  }

  function openSourceFolder(path) {
    var folder = String(path || "").trim()
    if (!folder || folder.charAt(0) !== "/" || /[\0\r\n]/.test(folder)
        || sourceFolderOpenProcess.running) return
    sourceFolderOpenProcess.command = ["xdg-open", folder]
    sourceFolderOpenProcess.running = true
  }

  function basename(path) {
    var value = String(path || "").replace(/\/+$/, "")
    var slash = value.lastIndexOf("/")
    return slash >= 0 ? (value.substring(slash + 1) || "/") : value
  }

  function startFolderDialog() {
    if (folderDialog.running) return
    root.folderDialogExited = false
    root.folderDialogOutputReady = false
    root.pendingFolderDialogTargetKey = root.sourceTargetKey
    root.pendingFolderDialogReopen = root.opened
    root.clearMessage()
    root.opened = false
    folderDialog.running = true
  }

  function finishFolderDialog() {
    if (!root.folderDialogExited || !root.folderDialogOutputReady) return
    var targetKey = root.pendingFolderDialogTargetKey
    var reopen = root.pendingFolderDialogReopen
    var folder = String(folderDialogStdout.text || "").trim()
    var exitCode = root.folderDialogExitCode
    root.folderDialogExited = false
    root.folderDialogOutputReady = false
    root.pendingFolderDialogTargetKey = ""
    root.pendingFolderDialogReopen = false
    root.restorePanelAfterDialog(reopen)
    if (exitCode === 0 && folder) root.addSourceFolder(folder)
  }

  function restorePanelAfterDialog(reopen) {
    if (!reopen) return
    root.opened = true
    Qt.callLater(function() {
      if (root.opened) keyCatcher.forceActiveFocus()
    })
  }

  function assignPath(key, path) {
    var normalized = Model.normalizeImagePath(String(path || ""))
    if (!normalized) {
      root.showError(key, "Unsupported image path; use PNG, JPEG, or WebP")
      return
    }
    if (!wallpaperService || typeof wallpaperService.requestAssignment !== "function") {
      root.showError(key, "Workspace wallpaper service is unavailable")
      return
    }
    root.clearMessage()
    wallpaperService.requestAssignment(key, normalized)
  }

  function reset(key) {
    if (!wallpaperService || typeof wallpaperService.clearAssignment !== "function") {
      root.showError(key, "Workspace wallpaper service is unavailable")
      return
    }
    if (root.isBusy()) {
      root.showError(key, "Another wallpaper operation is still saving")
      return
    }
    root.clearMessage()
    wallpaperService.clearAssignment(key)
  }

  function undoAvailable(key) {
    var candidate = root.history && root.history.undo
    return !!candidate && candidate.key === key
      && Number(candidate.revision) === root.assignmentRevision
  }

  function undo(key) {
    if (!root.undoAvailable(key)) {
      root.showError(key, "This undo is no longer available")
      return
    }
    if (!wallpaperService || typeof wallpaperService.requestUndo !== "function") {
      root.showError(key, "Workspace wallpaper service is unavailable")
      return
    }
    if (root.isBusy()) {
      root.showError(key, "Another wallpaper operation is still saving")
      return
    }
    root.clearMessage()
    wallpaperService.requestUndo(key)
  }

  function addWorkspace() {
    var key = Model.workspaceKeyFromInput(addWorkspaceField.text)
    if (!key) {
      root.addWorkspaceError = "Enter a positive workspace number or a normal workspace name"
      return
    }
    var alreadyListed = root.rows.some(function(row) { return row.key === key })
    if (!alreadyListed && root.extraWorkspaceKeys.indexOf(key) === -1) {
      root.extraWorkspaceKeys = root.extraWorkspaceKeys.concat([key])
      root.refreshRows()
    }
    addWorkspaceField.text = ""
    root.addWorkspaceError = ""
    root.clearMessage()
  }

  function clearMessage() {
    root.statusMessage = ""
    root.statusError = false
    root.rowErrorKey = ""
  }

  function showError(key, message) {
    root.rowMessageKey = ""
    root.rowMessage = ""
    rowMessageTimer.stop()
    root.rowErrorKey = String(key || "")
    root.statusMessage = String(message || "Operation failed")
    root.statusError = true
  }

  function handleOperation(payload) {
    var result = {}
    try { result = JSON.parse(payload || "{}") || {} } catch (error) { return }
    if (result.operation === "status") return
    if (result.ok === true) {
      root.clearMessage()
      if ((result.operation === "assign" || result.operation === "clear"
          || result.operation === "undo") && String(result.key || "") !== "") {
        root.rowMessageKey = String(result.key)
        root.rowMessage = result.operation === "assign" ? "Wallpaper saved"
          : result.operation === "clear" ? "Using global background"
          : "Change undone"
        rowMessageTimer.restart()
      }
      root.statusMessage = result.operation === "clear" ? "Using global background"
        : result.operation === "undo" ? "Wallpaper change undone"
        : result.operation === "reload" ? "Wallpaper reloaded"
        : result.operation === "assign" ? "Wallpaper saved"
        : "Operation completed"
    } else {
      root.showError(result.key, result.reason || "Operation failed")
    }
    root.refreshRows()
  }

  // Tracks the active theme so the picker also offers the user's per-theme
  // backgrounds folder, mirroring omarchy-theme-bg-switcher.
  FileView {
    id: themeNameFile
    path: root.stateHome + "/omarchy/current/theme.name"
    watchChanges: true
    printErrors: false
    onLoaded: root.themeName = String(text()).trim()
    onLoadFailed: root.themeName = ""
    onFileChanged: reload()
  }

  Process {
    id: folderDialog
    command: ["zenity", "--file-selection", "--directory"]

    stdout: StdioCollector {
      id: folderDialogStdout
      waitForEnd: true
      onStreamFinished: {
        root.folderDialogOutputReady = true
        root.finishFolderDialog()
      }
    }

    onExited: function(exitCode) {
      root.folderDialogExitCode = exitCode
      root.folderDialogExited = true
      root.finishFolderDialog()
    }
  }

  Process {
    id: sourceFolderOpenProcess
    command: []
  }

  Timer {
    id: rowMessageTimer
    interval: 3000
    onTriggered: {
      root.rowMessageKey = ""
      root.rowMessage = ""
    }
  }

  Connections {
    target: root.wallpaperService
    ignoreUnknownSignals: true
    function onOperationFinished(result) { root.handleOperation(result) }
    function onAssignmentRevisionChanged() { root.refreshRows() }
    function onHistoryStateChanged() { root.refreshRows() }
    function onSourcePreferencesSaveFinished(success) {
      root.sourcePreferencesPending = false
      if (root.wallpaperService && typeof root.wallpaperService.statusData === "function")
        root.syncSourcePreferences(root.wallpaperService.statusData(), true)
      if (!success) root.showError("", "Image source settings could not be saved")
    }
    function onSourcePreferencesStateChanged() {
      if (root.wallpaperService && typeof root.wallpaperService.statusData === "function")
        root.syncSourcePreferences(root.wallpaperService.statusData(), true)
    }
  }

  PickerController {
    id: pickerController

    onSelected: function(key, path) {
      root.opened = true
      root.assignPath(key, path)
      Qt.callLater(function() { keyCatcher.forceActiveFocus() })
    }
    onCancelled: function(key) {
      root.opened = true
      root.clearMessage()
      root.statusMessage = "Selection cancelled"
      Qt.callLater(function() { keyCatcher.forceActiveFocus() })
    }
    onFailed: function(key, reason) {
      root.opened = true
      root.showError(key, reason === "unsupported-image-path"
        ? "Unsupported image; choose PNG, JPEG, or WebP" : reason)
      Qt.callLater(function() { keyCatcher.forceActiveFocus() })
    }
  }

  PanelWindow {
    visible: root.opened
    anchors { top: true; bottom: true; left: true; right: true }
    color: "transparent"
    exclusionMode: ExclusionMode.Ignore
    WlrLayershell.namespace: "workspace-wallpapers-settings"
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.Exclusive

    Rectangle {
      anchors.fill: parent
      color: Qt.rgba(Color.background.r, Color.background.g, Color.background.b, 0.86)
      MouseArea { anchors.fill: parent; onClicked: root.dismiss() }
    }

    Item {
      id: keyCatcher
      anchors.fill: parent
      focus: true
      Keys.onEscapePressed: root.dismiss()

      BorderSurface {
        id: card
        anchors.centerIn: parent
        visible: !root.browserOpen
        width: Math.max(1, Math.min(parent.width - Style.space(32), Style.space(960)))
        height: Math.max(1, Math.min(parent.height - Style.space(32), content.implicitHeight + Style.space(32)))
        color: Color.background
        radius: Style.cornerRadius
        borderSpec: Border.controlSpec("normal", Color.foreground, Color.accent)

        MouseArea { anchors.fill: parent; onClicked: {} }

        Flickable {
          id: contentViewport
          anchors.fill: parent
          anchors.margins: Style.space(16)
          contentWidth: width
          contentHeight: content.implicitHeight
          clip: true
          boundsBehavior: Flickable.StopAtBounds

          ColumnLayout {
            id: content
            width: contentViewport.width
            spacing: Style.spacing.controlGap

          RowLayout {
            Layout.fillWidth: true
            Text {
              Layout.fillWidth: true
              text: "Workspace Wallpapers"
              color: Color.foreground
              font.family: Style.font.family
              font.pixelSize: Style.font.title
              font.bold: true
            }
            Text {
              text: "Esc to close"
              color: Color.foreground
              opacity: 0.6
              font.family: Style.font.family
              font.pixelSize: Style.font.caption
              textFormat: Text.PlainText
            }
            Button {
              text: "Close"
              bordered: true
              focusable: true
              onClicked: root.dismiss()
            }
          }

          Text {
            Layout.fillWidth: true
            textFormat: Text.PlainText
            text: root.statusMessage
            visible: root.statusMessage !== ""
            color: root.statusError ? Color.urgent : Color.accent
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
            wrapMode: Text.Wrap
          }

          Button {
            text: "Wallpaper folders…"
            selected: root.sourceSectionOpen
            bordered: true
            focusable: true
            onClicked: root.sourceSectionOpen = !root.sourceSectionOpen
          }

          BorderSurface {
            id: sourceSectionPanel
            visible: root.sourceSectionOpen
            Layout.fillWidth: true
            implicitHeight: sourceSection.implicitHeight + contentTopInset + contentBottomInset
            color: Color.background
            radius: Style.cornerRadius
            borderSpec: Border.controlSpec("normal", Color.foreground, Color.accent)
            padding: Style.spacing.md

            ColumnLayout {
              id: sourceSection
              visible: root.sourceSectionOpen
              anchors.left: parent.left
              anchors.right: parent.right
              anchors.top: parent.top
              anchors.bottom: parent.bottom
              anchors.leftMargin: sourceSectionPanel.contentLeftInset
              anchors.rightMargin: sourceSectionPanel.contentRightInset
              anchors.topMargin: sourceSectionPanel.contentTopInset
              anchors.bottomMargin: sourceSectionPanel.contentBottomInset
              spacing: Style.spacing.controlGap

              Dropdown {
                id: sourceDropdown
                Layout.fillWidth: true
                Layout.minimumWidth: 0
                label: "Default source for picker"
                value: root.sourceSelection
                options: root.sourceOptions
                enabled: !root.sourcePreferencesPending
                onChanged: root.setSourceSelection(value)
              }

              Text {
                Layout.fillWidth: true
                textFormat: Text.PlainText
                text: "Saved folders"
                color: Color.foreground
                font.family: Style.font.family
                font.pixelSize: Style.font.caption
                font.bold: true
              }

              Text {
                Layout.fillWidth: true
                visible: root.sourcePreferences.folders.length === 0
                text: "No saved folders"
                color: Color.foreground
                font.family: Style.font.family
                font.pixelSize: Style.font.caption
                opacity: 0.7
              }

              ListView {
                id: sourceFolderList
                Layout.fillWidth: true
                Layout.preferredHeight: Math.min(Style.space(160), contentHeight)
                visible: count > 0
                clip: true
                spacing: Style.spacing.xs
                model: root.sourcePreferences.folders

                delegate: RowLayout {
                  width: sourceFolderList.width
                  spacing: Style.spacing.controlGap

                  Button {
                    Layout.fillWidth: true
                    Layout.minimumWidth: 0
                    text: root.basename(modelData)
                    tooltipText: String(modelData)
                    leftAlign: true
                    bordered: true
                    focusable: true
                    clip: true
                  }

                  Button {
                    text: "Open in Files"
                    tooltipText: "Open " + String(modelData) + " in Files"
                    bordered: true
                    focusable: true
                    onClicked: root.openSourceFolder(modelData)
                  }

                  Button {
                    text: "Remove"
                    tooltipText: "Remove " + String(modelData)
                    bordered: true
                    focusable: true
                    enabled: !root.sourcePreferencesPending
                    onClicked: root.removeSourceFolder(modelData)
                  }
                }
              }

              Button {
                text: "Add folder…"
                bordered: true
                focusable: true
                enabled: !root.sourcePreferencesPending
                onClicked: root.startFolderDialog()
              }
            }
          }

          Text {
            Layout.fillWidth: true
            visible: root.rows.length === 0
            text: "No normal workspaces are currently visible. Add a saved workspace key above."
            color: Color.foreground
            font.family: Style.font.family
            font.pixelSize: Style.font.body
            opacity: 0.7
            wrapMode: Text.Wrap
          }

          ListView {
            id: workspaceList
            Layout.fillWidth: true
            Layout.preferredHeight: Style.space(360)
            clip: true
            spacing: Style.spacing.controlGap
            model: root.rows
            delegate: WorkspaceRow {
              width: workspaceList.width
              workspaceKey: modelData.key
              label: modelData.label
              imagePath: modelData.path
              present: modelData.present
              busy: root.isBusy()
              errorText: root.errorFor(modelData.key)
              messageText: root.rowMessageFor(modelData.key)
              undoAvailable: root.undoAvailable(modelData.key)
              current: root.isCurrentWorkspace(modelData.key)
              onChooseRequested: root.choose(workspaceKey)
              onResetRequested: root.reset(workspaceKey)
              onUndoRequested: root.undo(workspaceKey)
              onPathSubmitted: function(path) { root.assignPath(workspaceKey, path) }
              onImageDropped: function(path) { root.assignPath(workspaceKey, path) }
              onDropRejected: function(reason) { root.showError(workspaceKey, reason) }
            }
          }

          RowLayout {
            Layout.fillWidth: true
            TextField {
              id: addWorkspaceField
              Layout.fillWidth: true
              placeholderText: "Add workspace number or exact name"
              onTextChanged: root.addWorkspaceError = ""
              onAccepted: root.addWorkspace()
            }
            Button {
              text: "Add workspace"
              bordered: true
              focusable: true
              onClicked: root.addWorkspace()
            }
          }

          Text {
            Layout.fillWidth: true
            visible: root.addWorkspaceError !== ""
            text: root.addWorkspaceError
            color: Color.urgent
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
            textFormat: Text.PlainText
            wrapMode: Text.Wrap
          }
          }
        }
      }

      WallpaperBrowser {
        id: wallpaperBrowser
        anchors.centerIn: parent
        width: Math.max(1, Math.min(parent.width - Style.space(32), Style.space(1100)))
        height: Math.max(1, Math.min(parent.height - Style.space(32), Style.space(720)))
        visible: root.browserOpen
        active: root.browserOpen
        targetKey: root.browserTargetKey
        targetLabel: root.labelForKey(root.browserTargetKey)
        directories: root.pickerDirectories
        sourceSelection: root.sourceSelection
        sortSelection: root.sortSelection
        thumbnailSizePreference: root.thumbnailSizeSelection
        sourceOptions: root.sourceOptions
        recentImages: root.history.recent

        onSelected: function(path) {
          var targetKey = root.browserTargetKey
          root.browserOpen = false
          root.browserTargetKey = ""
          root.opened = true
          root.assignPath(targetKey, path)
          Qt.callLater(function() { keyCatcher.forceActiveFocus() })
        }
        onCancelled: {
          root.browserOpen = false
          root.browserTargetKey = ""
          root.opened = true
          root.clearMessage()
          Qt.callLater(function() { keyCatcher.forceActiveFocus() })
        }
        onSourceChanged: root.setSourceSelection(value)
        onSortChanged: root.setSortSelection(value)
        onThumbnailSizeChangedByUser: root.setThumbnailSizeSelection(value)
        onFolderDropped: root.addSourceFolder(path)
        onDropRejected: root.showError(root.sourceTargetKey, reason)
        onSourceManagementRequested: {
          root.browserOpen = false
          root.browserTargetKey = ""
          root.opened = true
          root.sourceSectionOpen = true
          Qt.callLater(function() { keyCatcher.forceActiveFocus() })
        }
      }
    }
  }

  onLiveWorkspacesChanged: root.refreshRows()
}

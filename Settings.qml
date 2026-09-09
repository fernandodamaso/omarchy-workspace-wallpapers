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
  property var rows: []
  property var extraWorkspaceKeys: []
  property string statusMessage: ""
  property bool statusError: false
  property string rowErrorKey: ""

  readonly property string home: Quickshell.env("HOME")
  readonly property string stateHome: home + "/.local/state"
  // Same directories omarchy-theme-bg-switcher hands to omarchy-menu-images:
  // the current theme's backgrounds plus the user's per-theme folder.
  property string themeName: ""
  readonly property string pickerDirectories: {
    var directories = [stateHome + "/omarchy/current/theme/backgrounds"]
    if (root.themeName)
      directories.push(home + "/.config/omarchy/backgrounds/" + root.themeName)
    return directories.join("\n")
  }
  readonly property var wallpaperService: shell && manifest && manifest.id
    ? shell.serviceFor(manifest.id) : service
  readonly property var liveWorkspaces: Hyprland.workspaces.values

  function open(payloadJson) {
    var payload = {}
    try { payload = JSON.parse(payloadJson || "{}") || {} } catch (error) {}
    if (payload.folder !== undefined) folderField.text = String(payload.folder || "")
    root.statusMessage = ""
    root.statusError = false
    root.opened = true
    root.refreshRows()
    Qt.callLater(function() {
      if (root.opened) keyCatcher.forceActiveFocus()
    })
  }

  function close() {
    pickerController.cancel(false)
    root.opened = false
  }

  function dismiss() {
    if (shell && manifest && typeof shell.hide === "function") shell.hide(manifest.id)
    else root.close()
  }

  function snapshot() {
    if (!wallpaperService || typeof wallpaperService.statusData !== "function")
      return { assignments: {} }
    return wallpaperService.statusData() || { assignments: {} }
  }

  function refreshRows() {
    var data = snapshot()
    root.rows = Model.composeWorkspaceRows(
      root.liveWorkspaces,
      data.assignments || {},
      root.extraWorkspaceKeys
    )
  }

  function isBusy() {
    return !!(wallpaperService && wallpaperService.mutationBusy)
  }

  function errorFor(key) {
    return root.statusError && root.rowErrorKey === key ? root.statusMessage : ""
  }

  function choose(key) {
    if (root.isBusy()) {
      root.showError(key, "Another wallpaper operation is still saving")
      return
    }
    // The row key is copied before the panel disappears; picker results never
    // consult current focus or the current Hyprland workspace.
    root.opened = false
    pickerController.open(key, root.pickerDirectories, folderField.text)
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

  function addWorkspace() {
    var key = Model.workspaceKeyFromInput(addWorkspaceField.text)
    if (!key) {
      root.showError("", "Enter a positive workspace number or a normal workspace name")
      return
    }
    var alreadyListed = root.rows.some(function(row) { return row.key === key })
    if (!alreadyListed && root.extraWorkspaceKeys.indexOf(key) === -1) {
      root.extraWorkspaceKeys = root.extraWorkspaceKeys.concat([key])
      root.refreshRows()
    }
    addWorkspaceField.text = ""
    root.clearMessage()
  }

  function clearMessage() {
    root.statusMessage = ""
    root.statusError = false
    root.rowErrorKey = ""
  }

  function showError(key, message) {
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
      root.statusMessage = result.operation === "clear" ? "Wallpaper reset" : "Wallpaper saved"
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

  Connections {
    target: root.wallpaperService
    ignoreUnknownSignals: true
    function onOperationFinished(result) { root.handleOperation(result) }
    function onAssignmentRevisionChanged() { root.refreshRows() }
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
        width: Math.min(parent.width - Style.space(32), Style.space(960))
        height: Math.min(parent.height - Style.space(32), content.implicitHeight + Style.space(32))
        color: Color.background
        radius: Style.cornerRadius
        borderSpec: Border.controlSpec("normal", Color.foreground, Color.accent)

        MouseArea { anchors.fill: parent; onClicked: {} }

        ColumnLayout {
          id: content
          anchors.fill: parent
          anchors.margins: Style.space(16)
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

          RowLayout {
            Layout.fillWidth: true
            Text {
              text: "Folder"
              color: Color.foreground
              font.family: Style.font.family
              font.pixelSize: Style.font.caption
            }
            TextField {
              id: folderField
              Layout.fillWidth: true
              placeholderText: "Optional local image folder"
            }
          }

          RowLayout {
            Layout.fillWidth: true
            TextField {
              id: addWorkspaceField
              Layout.fillWidth: true
              placeholderText: "Add workspace number or exact name"
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
              onChooseRequested: root.choose(workspaceKey)
              onResetRequested: root.reset(workspaceKey)
              onPathSubmitted: function(path) { root.assignPath(workspaceKey, path) }
            }
          }
        }
      }
    }
  }

  onLiveWorkspacesChanged: root.refreshRows()
}

import Quickshell.Hyprland
import Quickshell.Wayland
import QtQuick
import qs.Commons
import qs.Ui

PanelWindow {
  id: panel

  required property var modelData
  required property var controller

  screen: modelData
  visible: !remapGuard.remapping
  anchors { top: true; bottom: true; left: true; right: true }
  color: "transparent"
  updatesEnabled: true

  readonly property var hyprlandMonitor: Hyprland.monitorFor(modelData)
  readonly property var activeWorkspace: hyprlandMonitor ? hyprlandMonitor.activeWorkspace : null
  readonly property string workspaceKey: controller.preferredWorkspaceKey(activeWorkspace)
  readonly property string assignedBackground: controller.assignmentForWorkspace(activeWorkspace)
  readonly property string imagePath: assignedBackground || controller.displayedBackground

  ScreenMoveRemap {
    id: remapGuard
    window: panel
  }

  WlrLayershell.namespace: "workspace-wallpapers-background"
  WlrLayershell.layer: WlrLayer.Background
  WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
  exclusionMode: ExclusionMode.Ignore

  Rectangle {
    anchors.fill: parent
    color: "black"
  }

  Image {
    anchors.fill: parent
    source: panel.imagePath ? Util.fileUrl(panel.imagePath) : ""
    visible: panel.imagePath !== ""
    fillMode: Image.PreserveAspectCrop
    asynchronous: true
    cache: true
    smooth: true
    mipmap: true
  }

  TapHandler {
    acceptedButtons: Qt.LeftButton
    onDoubleTapped: {
      if (panel.workspaceKey) controller.pickForWorkspace(panel.workspaceKey)
    }
  }

  TapHandler {
    acceptedButtons: Qt.RightButton
    onDoubleTapped: controller.openThemeSwitcher()
  }
}

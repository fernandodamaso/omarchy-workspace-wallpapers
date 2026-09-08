import Quickshell
import Quickshell.Hyprland
import Quickshell.Wayland
import QtQuick
import qs.Commons
import qs.Ui
import "WorkspaceModel.js" as Model

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
  readonly property int controllerRenderRevision: controller.renderRevision

  property var lastNormalWorkspace: null
  property var wallpaperWorkspace: null
  property var renderState: Model.emptyRenderState()
  property var pendingImage: null
  property bool renderQueued: false

  readonly property string workspaceKey: controller.preferredWorkspaceKey(wallpaperWorkspace)
  readonly property string displayedSource: sourceUrl(renderState.displayed, renderState.displayedGeneration)

  function sourceUrl(path, generation) {
    if (!path) return ""
    return Util.fileUrl(path) + "?v=" + controller.backgroundVersion + "&wwg=" + generation
  }

  function destroyPending() {
    if (!pendingImage) return
    var image = pendingImage
    pendingImage = null
    image.destroy()
  }

  function startPending(generation, path) {
    destroyPending()
    if (!path) return

    var image = pendingImageComponent.createObject(panel, {
      loadGeneration: generation,
      loadPath: path
    })
    if (!image) return
    pendingImage = image
    image.source = sourceUrl(path, generation)
  }

  function finishPending(image, ok) {
    var result = Model.completeRender(
      renderState,
      image.loadGeneration,
      image.loadPath,
      ok
    )

    if (pendingImage === image) pendingImage = null
    image.destroy()
    renderState = result.state

    if (result.action === "fallback")
      startPending(renderState.generation, renderState.requested)
  }

  function beginRender() {
    var assigned = controller.assignmentForWorkspace(wallpaperWorkspace)
    var fallback = assigned ? controller.displayedBackground : ""
    var requested = assigned || controller.displayedBackground

    renderState = Model.requestRender(renderState, requested, fallback)
    destroyPending()

    if (!renderState.requested) {
      renderState = Model.completeRender(
        renderState,
        renderState.generation,
        "",
        true
      ).state
      return
    }

    startPending(renderState.generation, renderState.requested)
  }

  function queueRender() {
    if (renderQueued) return
    renderQueued = true
    Qt.callLater(function() {
      renderQueued = false
      beginRender()
    })
  }

  function updateWorkspace() {
    var next = Model.wallpaperWorkspace(activeWorkspace, lastNormalWorkspace)
    if (next && next === activeWorkspace) lastNormalWorkspace = activeWorkspace
    wallpaperWorkspace = next
    queueRender()
  }

  onActiveWorkspaceChanged: updateWorkspace()
  onControllerRenderRevisionChanged: queueRender()

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
    source: panel.displayedSource
    visible: panel.renderState.displayed !== ""
    fillMode: Image.PreserveAspectCrop
    asynchronous: true
    cache: false
    smooth: true
    mipmap: true
  }

  Component {
    id: pendingImageComponent

    Image {
      property int loadGeneration: 0
      property string loadPath: ""

      visible: false
      asynchronous: true
      cache: false

      onStatusChanged: {
        if (status === Image.Ready)
          panel.finishPending(this, true)
        else if (status === Image.Error)
          panel.finishPending(this, false)
      }
    }
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

  Component.onCompleted: updateWorkspace()
  Component.onDestruction: {
    renderState = Model.cancelRender(renderState)
    destroyPending()
  }
}

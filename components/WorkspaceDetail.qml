import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as Controls
import qs.Commons
import qs.Ui

BorderSurface {
  id: root

  property string workspaceKey: ""
  property string label: ""
  property string imagePath: ""
  property bool current: false
  property bool present: false
  property bool busy: false
  // A different workspace/preferences operation blocks actions without
  // falsely claiming that this selected workspace is being saved.
  property bool blocked: busy
  property string errorText: ""
  property string messageText: ""
  property bool undoAvailable: false

  signal chooseRequested()
  signal resetRequested()
  signal undoRequested()
  signal imageDropped(path: string)
  signal dropRejected(reason: string)

  implicitHeight: content.implicitHeight + Style.space(32)
  color: Color.background
  radius: Style.cornerRadius
  borderSpec: Border.controlSpec("normal", Color.foreground, Color.accent)

  ColumnLayout {
    id: content
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.top: parent.top
    anchors.margins: Style.space(16)
    spacing: Style.space(16)

    Text {
      Layout.fillWidth: true
      Layout.minimumWidth: 0
      textFormat: Text.PlainText
      text: root.workspaceKey ? root.label : "Select a workspace"
      color: Color.foreground
      font.family: Style.font.family
      font.pixelSize: Style.font.heading
      font.bold: true
      elide: Text.ElideRight
    }

    Text {
      Layout.fillWidth: true
      textFormat: Text.PlainText
      text: !root.workspaceKey ? "Choose a workspace from the list or add one below it."
        : root.current ? "Current workspace"
        : root.present ? "Available workspace"
        : "Saved workspace · not currently active"
      color: root.current ? Color.accent : Color.foreground
      font.family: Style.font.family
      font.pixelSize: Style.font.caption
      wrapMode: Text.Wrap
      opacity: 0.8
    }

    Button {
      id: detailPreview
      visible: root.workspaceKey !== ""
      Layout.fillWidth: true
      Layout.minimumWidth: 0
      Layout.preferredHeight: width * 9 / 16
      text: ""
      bordered: true
      focusable: true
      enabled: !root.blocked
      horizontalPadding: 0
      verticalPadding: 0
      background: Color.background
      clip: true
      tooltipText: root.imagePath || "Using global background"
      Accessible.role: Accessible.Button
      Accessible.name: "Change wallpaper for " + root.label
      Accessible.description: root.imagePath ? "Custom wallpaper" : "Using global background"
      onClicked: root.chooseRequested()
      WallpaperPreview {
        anchors.fill: parent
        imagePath: root.imagePath
      }
    }

    Text {
      id: filenameLabel
      Layout.fillWidth: true
      Layout.minimumWidth: 0
      visible: root.workspaceKey !== ""
      textFormat: Text.PlainText
      text: root.imagePath ? root.imagePath.substring(root.imagePath.lastIndexOf("/") + 1)
        : "Using global background"
      color: Color.foreground
      font.family: Style.font.family
      font.pixelSize: Style.font.body
      elide: Text.ElideRight
      HoverHandler { id: filenameHover }
      Controls.ToolTip {
        visible: filenameHover.hovered && root.imagePath !== ""
        text: root.imagePath
        delay: 400
        padding: Style.spacing.controlPaddingX
        background: BorderSurface {
          color: Color.tooltip.background
          borderSpec: Border.controlSpec("normal", Color.tooltip.text, Color.accent)
        }
        contentItem: Text {
          textFormat: Text.PlainText
          text: root.imagePath
          color: Color.tooltip.text
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
        }
      }
    }

    Text {
      Layout.fillWidth: true
      visible: root.busy || root.errorText !== "" || root.messageText !== ""
      textFormat: Text.PlainText
      text: root.busy ? "Saving…" : root.errorText || root.messageText
      color: root.errorText && !root.busy ? Color.urgent : Color.accent
      font.family: Style.font.family
      font.pixelSize: Style.font.caption
      wrapMode: Text.Wrap
    }

    Flow {
      Layout.fillWidth: true
      implicitHeight: childrenRect.height
      spacing: Style.spacing.controlGap
      visible: root.workspaceKey !== ""

      Button {
        text: "Change…"
        bordered: true
        focusable: true
        enabled: !root.blocked && root.workspaceKey !== ""
        onClicked: root.chooseRequested()
      }
      Button {
        text: "Use global background"
        bordered: true
        focusable: true
        enabled: !root.blocked && root.workspaceKey !== "" && root.imagePath !== ""
        onClicked: root.resetRequested()
      }
      Button {
        visible: root.undoAvailable
        text: "Undo"
        bordered: true
        focusable: true
        enabled: !root.blocked && root.workspaceKey !== ""
        onClicked: root.undoRequested()
      }
    }
  }

  DropArea {
    anchors.fill: parent
    onDropped: function(drop) {
      if (!root.workspaceKey || root.blocked) {
        root.dropRejected(root.workspaceKey ? "Another wallpaper operation is still saving" : "Select a workspace first")
        return
      }
      var urls = drop.urls || []
      if (urls.length !== 1) {
        root.dropRejected("Drop one image at a time")
        return
      }
      var path = String(urls[0])
      try {
        if (path.indexOf("file://") === 0) path = decodeURIComponent(path.substring(7))
      } catch (error) {
        root.dropRejected("Invalid image URL")
        return
      }
      if (!/^\/(.*\.(png|jpe?g|webp))$/i.test(path)) {
        root.dropRejected("Drop a PNG, JPEG, or WebP image")
        return
      }
      root.imageDropped(path)
    }
  }
}

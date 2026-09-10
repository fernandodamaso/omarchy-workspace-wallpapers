import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Ui

BorderSurface {
  id: root

  property string workspaceKey: ""
  property string label: ""
  property string imagePath: ""
  property bool present: false
  property bool busy: false
  property bool blocked: busy
  property string errorText: ""
  property string messageText: ""
  property bool undoAvailable: false
  property bool current: false
  property bool selected: false

  function basename(path) {
    path = String(path || "").replace(/\/+$/, "")
    return path.substring(path.lastIndexOf("/") + 1)
  }

  signal selectionRequested()
  signal chooseRequested()
  // Retained public intents; the visible reset/Undo controls now live in detail.
  signal resetRequested()
  signal undoRequested()
  signal pathSubmitted(path: string)
  signal pathEntryRequested()
  signal imageDropped(path: string)
  signal dropRejected(reason: string)

  readonly property string workspaceStatus: root.current ? "Current"
    : root.present ? "Available workspace" : "Saved · not active"

  implicitHeight: content.implicitHeight + Style.space(24)
  radius: Style.cornerRadius
  color: root.selected ? Style.selectedFillFor(Color.foreground, Color.accent) : "transparent"
  opacity: root.present ? 1.0 : 0.6
  borderSpec: Border.controlSpec(root.activeFocus ? "focus" : root.selected ? "selected" : "normal", Color.foreground, Color.accent)
  activeFocusOnTab: true
  Accessible.role: Accessible.ListItem
  Accessible.name: root.label
  Accessible.description: root.workspaceStatus + "; " + (root.imagePath || "Using global background")
  Keys.onReturnPressed: root.selectionRequested()
  Keys.onEnterPressed: root.selectionRequested()
  Keys.onSpacePressed: root.selectionRequested()

  MouseArea {
    anchors.fill: parent
    onClicked: {
      root.forceActiveFocus()
      root.selectionRequested()
    }
  }

  GridLayout {
    id: content
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.top: parent.top
    anchors.margins: Style.space(12)
    columns: root.width >= Style.space(440) ? 3 : 2
    columnSpacing: Style.space(12)
    rowSpacing: Style.spacing.controlGap

    Button {
      id: previewCard
      Layout.column: 0
      Layout.row: 0
      Layout.rowSpan: content.columns === 3 ? 1 : 2
      Layout.preferredWidth: root.width >= Style.space(440) ? Style.space(148) : Style.space(96)
      Layout.preferredHeight: width * 9 / 16
      Layout.alignment: Qt.AlignVCenter
      text: ""
      bordered: true
      focusable: true
      enabled: !root.blocked
      horizontalPadding: 0
      verticalPadding: 0
      background: Color.background
      clip: true
      Accessible.role: Accessible.Button
      Accessible.name: "Change wallpaper for " + root.label
      Accessible.description: root.imagePath ? "Custom wallpaper" : "Using global background"
      tooltipText: root.imagePath || "Using global background"
      onClicked: root.chooseRequested()

      WallpaperPreview {
        anchors.fill: parent
        imagePath: root.imagePath
      }
    }

    Button {
      Layout.column: 1
      Layout.row: 0
      Layout.fillWidth: true
      Layout.minimumWidth: 0
      Layout.preferredHeight: rowInfo.implicitHeight + Style.space(8)
      horizontalPadding: 0
      verticalPadding: 0
      text: ""
      clip: true
      tooltipText: root.label + "\n" + root.workspaceKey + "\n" + (root.imagePath || "Using global background")
      Accessible.role: Accessible.Button
      Accessible.name: "Select " + root.label
      onClicked: {
        root.forceActiveFocus()
        root.selectionRequested()
      }

      ColumnLayout {
        id: rowInfo
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        anchors.margins: Style.space(4)
        spacing: Style.spacing.xs

        Text {
          Layout.fillWidth: true
          Layout.minimumWidth: 0
          textFormat: Text.PlainText
          text: root.label
          color: Color.foreground
          font.family: Style.font.family
          font.pixelSize: Style.font.body
          font.bold: true
          elide: Text.ElideRight
        }
        Text {
          Layout.fillWidth: true
          Layout.minimumWidth: 0
          textFormat: Text.PlainText
          text: root.workspaceStatus + " · " + (root.imagePath ? "Custom" : "Global")
          color: root.current ? Color.accent : Color.foreground
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
          elide: Text.ElideRight
          opacity: 0.8
        }
        Text {
          Layout.fillWidth: true
          Layout.minimumWidth: 0
          textFormat: Text.PlainText
          text: root.busy ? "Saving…" : root.errorText || root.messageText
            || (root.imagePath ? root.basename(root.imagePath) : "Using global background")
          color: root.errorText && !root.busy ? Color.urgent
            : root.messageText && !root.busy ? Color.accent : Color.foreground
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
          elide: Text.ElideRight
          opacity: root.busy || root.errorText || root.messageText ? 1 : 0.7
        }
      }
    }

    Button {
      Layout.column: content.columns === 3 ? 2 : 1
      Layout.row: content.columns === 3 ? 0 : 1
      Layout.alignment: Qt.AlignLeft | Qt.AlignVCenter
      text: "Change…"
      bordered: true
      focusable: true
      enabled: !root.blocked
      Accessible.name: "Change wallpaper for " + root.label
      onClicked: root.chooseRequested()
    }
  }

  DropArea {
    anchors.fill: parent
    onDropped: function(drop) {
      if (root.blocked) {
        root.dropRejected("Another wallpaper operation is still saving")
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

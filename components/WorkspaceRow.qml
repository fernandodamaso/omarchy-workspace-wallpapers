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
  property string errorText: ""
  property bool undoAvailable: false
  property bool current: false

  signal chooseRequested()
  signal resetRequested()
  signal undoRequested()
  signal pathSubmitted(path: string)
  signal pathEntryRequested()
  signal imageDropped(path: string)
  signal dropRejected(reason: string)

  implicitHeight: content.implicitHeight + Style.space(20)
  radius: Style.cornerRadius
  color: "transparent"
  borderSpec: Border.controlSpec("normal", Color.foreground, Color.accent)

  ColumnLayout {
    id: content

    anchors.fill: parent
    anchors.margins: Style.space(10)
    spacing: Style.spacing.controlGap

    GridLayout {
      id: body

      Layout.fillWidth: true
      columns: root.width >= Style.space(520) ? 2 : 1
      rowSpacing: Style.spacing.controlGap
      columnSpacing: Style.spacing.controlGap

      Button {
        id: previewCard

        Layout.column: 0
        Layout.row: 0
        Layout.rowSpan: body.columns > 1 ? 2 : 1
        Layout.fillWidth: body.columns === 1
        Layout.preferredWidth: body.columns > 1 ? Style.space(196) : 0
        Layout.minimumWidth: 0
        Layout.preferredHeight: width * 9 / 16
        text: ""
        bordered: true
        focusable: true
        enabled: !root.busy
        horizontalPadding: 0
        verticalPadding: 0
        background: Color.background
        clip: true
        Accessible.role: Accessible.Button
        Accessible.name: root.imagePath
          ? "Change wallpaper for " + root.label
          : "Choose a custom wallpaper for " + root.label
        Accessible.description: root.imagePath
          ? "Custom wallpaper"
          : "Using global background"

        Image {
          anchors.fill: parent
          anchors.margins: Style.space(2)
          source: root.imagePath ? Util.fileUrl(root.imagePath) : ""
          visible: root.imagePath !== ""
          fillMode: Image.PreserveAspectCrop
          asynchronous: true
          cache: false
          smooth: true
        }

        Rectangle {
          anchors.fill: parent
          anchors.margins: Style.space(2)
          visible: !root.imagePath
          color: Util.alpha(Color.foreground, 0.08)
        }

        Column {
          anchors.centerIn: parent
          width: Math.min(parent.width - Style.space(24), Style.space(240))
          spacing: Style.spacing.xs
          visible: !root.imagePath

          Text {
            anchors.horizontalCenter: parent.horizontalCenter
            textFormat: Text.PlainText
            text: "GLOBAL"
            color: Color.accent
            font.family: Style.font.family
            font.pixelSize: Style.font.heading
            font.bold: true
          }

          Text {
            width: parent.width
            textFormat: Text.PlainText
            text: "Using global background"
            color: Color.foreground
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.Wrap
          }
        }
      }

      ColumnLayout {
        Layout.column: body.columns > 1 ? 1 : 0
        Layout.row: body.columns > 1 ? 0 : 1
        Layout.fillWidth: true
        Layout.alignment: Qt.AlignTop
        spacing: Style.spacing.controlGap

        Text {
          Layout.fillWidth: true
          textFormat: Text.PlainText
          text: root.label + (root.current ? " · Current" : "")
          color: Color.foreground
          font.family: Style.font.family
          font.pixelSize: Style.font.body
          font.bold: true
          elide: Text.ElideRight
        }

        Text {
          Layout.fillWidth: true
          textFormat: Text.PlainText
          text: root.busy ? "Saving…" : (root.errorText || (root.imagePath
            ? "Custom wallpaper" : "Using global background"))
          color: root.errorText && !root.busy ? Color.urgent : Color.foreground
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
          opacity: root.errorText || root.busy ? 1 : 0.7
          wrapMode: Text.Wrap
        }
      }

      RowLayout {
        Layout.column: body.columns > 1 ? 1 : 0
        Layout.row: body.columns > 1 ? 1 : 2
        Layout.fillWidth: true
        spacing: Style.spacing.controlGap

        Button {
          Layout.fillWidth: true
          Layout.minimumWidth: 0
          text: root.busy ? "Saving…" : "Change…"
          bordered: true
          focusable: true
          enabled: !root.busy
          onClicked: root.chooseRequested()
        }

        Button {
          Layout.fillWidth: true
          Layout.minimumWidth: 0
          text: "Use global background"
          bordered: true
          focusable: true
          enabled: !root.busy && root.imagePath !== ""
          onClicked: root.resetRequested()
        }

        Button {
          visible: root.undoAvailable
          text: "Undo"
          bordered: true
          focusable: true
          enabled: !root.busy
          onClicked: root.undoRequested()
        }
      }
    }
  }

  DropArea {
    anchors.fill: parent
    onDropped: function(drop) {
      var urls = drop.urls || []
      if (urls.length !== 1) {
        root.dropRejected("Drop one image at a time")
        return
      }
      var path = String(urls[0])
      if (path.indexOf("file://") === 0) path = decodeURIComponent(path.substring(7))
      if (!/^\/(.*\.(png|jpe?g|webp))$/i.test(path)) {
        root.dropRejected("Drop a PNG, JPEG, or WebP image")
        return
      }
      root.imageDropped(path)
    }
  }
}

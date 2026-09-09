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

  signal chooseRequested()
  signal resetRequested()
  signal pathSubmitted(path: string)

  implicitHeight: Style.space(104)
  radius: Style.cornerRadius
  color: "transparent"
  borderSpec: Border.controlSpec("normal", Color.foreground, Color.accent)

  RowLayout {
    anchors.fill: parent
    anchors.margins: Style.space(10)
    spacing: Style.spacing.controlGap

    BorderSurface {
      Layout.preferredWidth: Style.space(74)
      Layout.preferredHeight: Style.space(74)
      color: Color.background
      borderSpec: Border.controlSpec("normal", Color.foreground, Color.accent)
      radius: Style.cornerRadius

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

      Text {
        anchors.centerIn: parent
        visible: !root.imagePath
        text: "GLOBAL"
        color: Color.foreground
        font.family: Style.font.family
        font.pixelSize: Style.font.caption
        opacity: 0.7
      }
    }

    ColumnLayout {
      Layout.fillWidth: true
      spacing: Style.spacing.controlGap

      Text {
        Layout.fillWidth: true
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
        textFormat: Text.PlainText
        text: root.errorText || (root.busy ? "Saving…" : (root.imagePath ? root.imagePath : "Use global wallpaper"))
        color: root.errorText ? Color.urgent : Color.foreground
        font.family: Style.font.family
        font.pixelSize: Style.font.caption
        opacity: root.errorText || root.busy ? 1 : 0.7
        elide: Text.ElideMiddle
      }

      TextField {
        id: pathField
        Layout.fillWidth: true
        placeholderText: "Absolute image path — press Enter"
        enabled: !root.busy
        onAccepted: root.pathSubmitted(text)
      }
    }

    ColumnLayout {
      spacing: Style.spacing.controlGap

      Button {
        text: root.busy ? "Saving…" : "Choose"
        bordered: true
        focusable: true
        enabled: !root.busy
        onClicked: root.chooseRequested()
      }

      Button {
        text: "Reset"
        bordered: true
        focusable: true
        enabled: !root.busy
        onClicked: root.resetRequested()
      }
    }
  }
}

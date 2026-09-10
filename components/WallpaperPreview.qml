import QtQuick
import qs.Commons

Item {
  id: root

  property string imagePath: ""

  implicitHeight: width * 9 / 16

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

    Text {
      width: parent.width
      textFormat: Text.PlainText
      text: "Drop an image or click to choose"
      color: Color.foreground
      font.family: Style.font.family
      font.pixelSize: Style.font.caption
      horizontalAlignment: Text.AlignHCenter
      opacity: 0.6
      wrapMode: Text.Wrap
    }
  }
}

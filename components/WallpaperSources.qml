import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Ui

ColumnLayout {
  id: root

  property var folders: []
  property var sourceOptions: []
  property string sourceSelection: "theme"
  property bool pending: false
  property string message: ""
  property bool error: false
  property string home: ""

  signal sourceChangeRequested(value: string)
  signal addFolderRequested()
  signal openFolderRequested(path: string)
  signal removeFolderRequested(path: string)

  // Dropdown changes its displayed value before emitting changed. Rejected
  // requests and committed snapshots must restore it through this public API.
  function setDisplayedSource(value) {
    sourceDropdown.value = value
  }

  function basename(path) {
    var value = String(path || "").replace(/\/+$/, "")
    var slash = value.lastIndexOf("/")
    return slash >= 0 ? (value.substring(slash + 1) || "/") : value
  }

  spacing: Style.spacing.controlGap

  Dropdown {
    id: sourceDropdown
    Layout.fillWidth: true
    Layout.minimumWidth: 0
    label: "Default source for picker"
    value: root.sourceSelection
    options: root.sourceOptions
    enabled: !root.pending
    onChanged: root.sourceChangeRequested(value)
  }

  Text {
    Layout.fillWidth: true
    visible: root.message !== ""
    text: root.message
    textFormat: Text.PlainText
    color: root.error ? Color.urgent : Color.accent
    font.family: Style.font.family
    font.pixelSize: Style.font.caption
    wrapMode: Text.Wrap
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
    visible: root.folders.length === 0
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
    model: root.folders

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
        onClicked: root.openFolderRequested(modelData)
      }

      Button {
        text: "Remove"
        tooltipText: "Remove " + String(modelData)
        bordered: true
        focusable: true
        enabled: !root.pending
        onClicked: root.removeFolderRequested(modelData)
      }
    }
  }

  Button {
    text: "Add folder…"
    bordered: true
    focusable: true
    enabled: !root.pending
    onClicked: root.addFolderRequested()
  }
}

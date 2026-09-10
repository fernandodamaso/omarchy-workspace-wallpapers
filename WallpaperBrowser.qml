import Quickshell.Io
import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Ui

Item {
  id: root

  property bool active: false
  property string targetKey: ""
  property string targetLabel: ""
  property var directories: []
  property string sourceSelection: ""
  property var sourceOptions: []
  property var recentImages: []

  signal cancelled()
  signal selected(path: string)
  signal sourceChanged(value: string)
  signal sortChanged(value: string)
  signal thumbnailSizeChangedByUser(value: string)
  signal sourceManagementRequested()
  signal folderDropped(path: string)
  signal dropRejected(reason: string)

  property var images: []
  property string selectedPath: ""
  property string searchText: ""
  property string sortSelection: "name"
  property string thumbnailSizePreference: "medium"
  property int thumbnailSize: 1
  property bool recursiveScan: false
  property bool loading: false
  property string scanError: ""
  property int scanSerial: 0
  property int activeScanSerial: 0
  property int processSerial: 0
  property bool processExited: false
  property int processExitCode: 0
  property bool stdoutReady: false
  property bool stderrReady: false
  property int queuedScanSerial: 0
  property var queuedDirectories: []

  readonly property int thumbnailWidth: [Style.space(220), Style.space(280), Style.space(340)][root.thumbnailSize]
  readonly property int thumbnailHeight: Math.round(root.thumbnailWidth * 9 / 16)
  readonly property int gridCellWidth: root.thumbnailWidth + Style.spacing.md
  readonly property int gridCellHeight: root.thumbnailHeight + Style.spacing.md

  implicitWidth: Style.space(960)
  implicitHeight: Style.space(700)
  visible: root.active
  focus: root.active
  clip: true

  function usableDirectory(value) {
    var path = String(value || "")
    return path.charAt(0) === "/"
      && path.indexOf("\0") < 0
      && path.indexOf("\n") < 0
      && path.indexOf("\r") < 0
  }

  function scanDirectories() {
    var values = Array.isArray(root.directories) ? root.directories : [root.directories]
    var result = []
    for (var i = 0; i < values.length; i++) {
      if (values[i] === undefined || values[i] === null) continue
      var path = String(values[i])
      if (usableDirectory(path) && result.indexOf(path) === -1)
        result.push(path)
    }
    return result
  }

  function findCommand(dirs) {
    var command = ["find", "-L"].concat(dirs)
    if (!root.recursiveScan) command = command.concat(["-maxdepth", "1"])
    return command.concat([
      "-type", "f",
      "(",
      "-iname", "*.png",
      "-o", "-iname", "*.jpg",
      "-o", "-iname", "*.jpeg",
      "-o", "-iname", "*.webp",
      ")",
      "-printf", "%T@\\0%p\\0"
    ])
  }

  function thumbnailPreferenceName() {
    return root.thumbnailSize === 0 ? "small"
      : root.thumbnailSize === 2 ? "large" : "medium"
  }

  function applyThumbnailPreference() {
    root.thumbnailSize = root.thumbnailSizePreference === "small" ? 0
      : root.thumbnailSizePreference === "large" ? 2 : 1
  }

  function parseScanOutput(output) {
    var records = String(output || "").split("\0")
    var result = []
    var seen = {}
    for (var i = 0; i + 1 < records.length; i += 2) {
      var timestamp = records[i]
      var path = records[i + 1]
      if (!path || path.charAt(0) !== "/" || seen[path] === true) continue
      seen[path] = true

      var slash = path.lastIndexOf("/")
      var name = slash >= 0 ? path.substring(slash + 1) : path
      result.push({
        path: path,
        name: name,
        mtime: Number(timestamp) || 0
      })
    }
    return result
  }

  function startScan(serial, dirs) {
    if (!root.active || serial !== root.scanSerial) return
    if (root.sourceSelection === "recent") {
      root.images = root.recentRecords()
      root.loading = false
      return
    }
    if (dirs.length === 0) {
      root.loading = false
      root.images = []
      root.selectedPath = ""
      return
    }

    root.activeScanSerial = serial
    root.processSerial = serial
    root.processExited = false
    root.stdoutReady = false
    root.stderrReady = false
    scanProcess.command = root.findCommand(dirs)
    scanProcess.running = true
  }

  function recentRecords() {
    var entries = Array.isArray(root.recentImages) ? root.recentImages : []
    var result = []
    var seen = {}
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i]
      var path = String(entry && entry.path || "")
      if (!path || path.charAt(0) !== "/" || seen[path]) continue
      if (!/\.(png|jpe?g|webp)$/i.test(path)) continue
      seen[path] = true
      result.push({
        path: path,
        name: String(entry.name || root.filename(path)),
        mtime: Number(entry.usedAt) || 0
      })
    }
    return result
  }

  function requestScan() {
    root.scanSerial += 1
    var serial = root.scanSerial
    var dirs = root.scanDirectories()
    root.loading = true
    root.scanError = ""
    root.images = []
    root.selectedPath = ""

    if (root.sourceSelection === "recent") {
      root.images = root.recentRecords()
      root.loading = false
      return
    }

    if (root.processSerial !== 0) {
      root.queuedScanSerial = serial
      root.queuedDirectories = dirs
      if (scanProcess.running) scanProcess.running = false
      return
    }
    root.startScan(serial, dirs)
  }

  function stopScan() {
    root.scanSerial += 1
    root.activeScanSerial = 0
    root.queuedScanSerial = 0
    root.queuedDirectories = []
    root.loading = false
    if (scanProcess.running) scanProcess.running = false
  }

  function finishScan(serial, exitCode, output, errorText) {
    if (!root.active || serial !== root.scanSerial) return
    var parsed = root.parseScanOutput(output)
    root.images = parsed
    root.loading = false
    root.scanError = parsed.length > 0 ? "" : exitCode === 0 ? String(errorText || "")
      : "A wallpaper folder is unavailable or could not be read"
  }

  function maybeFinishScan() {
    if (!root.processExited || !root.stdoutReady || !root.stderrReady) return

    var serial = root.processSerial
    var output = String(scanStdout.text || "")
    var errorText = String(scanStderr.text || "").trim()
    var nextSerial = root.queuedScanSerial
    var nextDirectories = root.queuedDirectories

    root.activeScanSerial = 0
    root.processSerial = 0
    root.processExited = false
    root.stdoutReady = false
    root.stderrReady = false
    root.queuedScanSerial = 0
    root.queuedDirectories = []

    if (serial === root.scanSerial && root.active)
      root.finishScan(serial, root.processExitCode, output, errorText)

    if (nextSerial > 0 && root.active && nextSerial === root.scanSerial)
      root.startScan(nextSerial, nextDirectories)
  }

  function displayImages() {
    var all = root.images || []
    var needle = String(root.searchText || "").toLowerCase()
    var result = []
    for (var i = 0; i < all.length; i++) {
      var item = all[i]
      var name = String(item.name || "")
      if (!needle || name.toLowerCase().indexOf(needle) >= 0)
        result.push(item)
    }

    result.sort(function(a, b) {
      if (root.sortSelection === "mtime") {
        if (a.mtime !== b.mtime) return b.mtime - a.mtime
      }
      var an = String(a.name || "").toLowerCase()
      var bn = String(b.name || "").toLowerCase()
      if (an < bn) return -1
      if (an > bn) return 1
      return String(a.path).localeCompare(String(b.path))
    })
    return result
  }

  readonly property var displayedImages: root.displayImages()

  function ensureSelection() {
    var visibleImages = root.displayedImages || []
    for (var i = 0; i < visibleImages.length; i++) {
      if (visibleImages[i].path === root.selectedPath) return
    }
    root.selectedPath = visibleImages.length > 0 ? visibleImages[0].path : ""
  }

  function selectImage(path) {
    var value = String(path || "")
    if (!value) return
    root.selectedPath = value
  }

  function filename(path) {
    var value = String(path || "")
    var slash = value.lastIndexOf("/")
    return slash >= 0 ? value.substring(slash + 1) : value
  }

  onActiveChanged: {
    if (root.active) {
      root.applyThumbnailPreference()
      root.requestScan()
      Qt.callLater(function() {
        if (root.active) searchField.forceActiveFocus()
      })
    } else {
      root.stopScan()
    }
  }
  onDirectoriesChanged: if (root.active) root.requestScan()
  onSourceSelectionChanged: if (root.active) root.requestScan()
  onRecentImagesChanged: if (root.active && root.sourceSelection === "recent") root.requestScan()
  onRecursiveScanChanged: if (root.active) root.requestScan()
  onDisplayedImagesChanged: root.ensureSelection()

  Keys.onEscapePressed: {
    if (root.active) root.cancelled()
  }

  Component.onCompleted: {
    if (root.active && root.scanSerial === 0) root.requestScan()
  }
  Component.onDestruction: {
    root.scanSerial += 1
    if (scanProcess.running) scanProcess.running = false
  }

  Process {
    id: scanProcess
    command: []

    stdout: StdioCollector {
      id: scanStdout
      waitForEnd: true
      onStreamFinished: {
        root.stdoutReady = true
        root.maybeFinishScan()
      }
    }
    stderr: StdioCollector {
      id: scanStderr
      waitForEnd: true
      onStreamFinished: {
        root.stderrReady = true
        root.maybeFinishScan()
      }
    }

    onExited: function(exitCode) {
      root.processExitCode = exitCode
      root.processExited = true
      root.maybeFinishScan()
    }
  }

  BorderSurface {
    id: card
    anchors.fill: parent
    color: Color.popups.background
    borderSpec: Border.controlSpec("normal", Color.foreground, Color.accent)
    padding: Style.spacing.panelPadding

    ColumnLayout {
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.top: parent.top
      anchors.bottom: parent.bottom
      anchors.leftMargin: card.contentLeftInset
      anchors.rightMargin: card.contentRightInset
      anchors.topMargin: card.contentTopInset
      anchors.bottomMargin: card.contentBottomInset
      spacing: Style.spacing.controlGap

      Text {
        Layout.fillWidth: true
        textFormat: Text.PlainText
        text: "Choose wallpaper for " + root.targetLabel
        color: Color.foreground
        font.family: Style.font.family
        font.pixelSize: Style.font.heading
        font.bold: true
        elide: Text.ElideRight
      }

      RowLayout {
        Layout.fillWidth: true
        spacing: Style.spacing.controlGap

        Dropdown {
          Layout.preferredWidth: Style.space(180)
          Layout.minimumWidth: 0
          label: "Source"
          value: root.sourceSelection
          options: root.sourceOptions
          onChanged: root.sourceChanged(value)
        }

        TextField {
          id: searchField
          Layout.fillWidth: true
          Layout.minimumWidth: 0
          placeholderText: "Search filenames"
          onTextChanged: root.searchText = text
        }

        Dropdown {
          Layout.preferredWidth: Style.space(190)
          Layout.minimumWidth: 0
          label: "Sort"
          value: root.sortSelection
         options: [
            { label: "Name", value: "name" },
            { label: "Recently added", value: "mtime" }
          ]
           onChanged: {
             root.sortSelection = value
             root.sortChanged(value)
           }
        }
      }

      RowLayout {
        Layout.fillWidth: true
        spacing: Style.spacing.controlGap

        Text {
          textFormat: Text.PlainText
          text: "Thumbnail size"
          color: Color.foreground
          opacity: 0.75
          font.family: Style.font.family
          font.pixelSize: Style.font.bodySmall
        }

        Button {
          text: "-"
          tooltipText: "Smaller thumbnails"
          bordered: true
          focusable: true
          enabled: root.thumbnailSize > 0
          onClicked: {
            root.thumbnailSize -= 1
            root.thumbnailSizeChangedByUser(root.thumbnailPreferenceName())
          }
        }

        Text {
          textFormat: Text.PlainText
          text: root.thumbnailWidth + " px"
          color: Color.foreground
          font.family: Style.font.family
          font.pixelSize: Style.font.bodySmall
          horizontalAlignment: Text.AlignHCenter
          Layout.preferredWidth: Style.space(55)
        }

        Button {
          text: "+"
          tooltipText: "Larger thumbnails"
          bordered: true
          focusable: true
          enabled: root.thumbnailSize < 2
          onClicked: {
            root.thumbnailSize += 1
            root.thumbnailSizeChangedByUser(root.thumbnailPreferenceName())
          }
        }

        Button {
          text: root.recursiveScan ? "Include subfolders: On" : "Include subfolders: Off"
          tooltipText: "Scan inside saved folders"
          bordered: true
          focusable: true
          onClicked: root.recursiveScan = !root.recursiveScan
        }

        Item { Layout.fillWidth: true }

        Text {
          Layout.fillWidth: true
          textFormat: Text.PlainText
          text: root.loading ? "Scanning wallpaper folders..."
            : root.scanError !== "" ? "Scan failed"
            : root.displayedImages.length + " wallpapers"
          color: root.scanError !== "" ? Color.urgent : Color.foreground
          opacity: 0.75
          font.family: Style.font.family
          font.pixelSize: Style.font.bodySmall
          horizontalAlignment: Text.AlignRight
          elide: Text.ElideRight
        }
      }

      BorderSurface {
        id: previewCard
        Layout.fillWidth: true
        Layout.preferredHeight: Style.space(190)
        Layout.minimumHeight: Style.space(130)
        color: Color.background
        borderSpec: Border.controlSpec("normal", Color.foreground, Color.accent)
        padding: Style.spacing.md

        ColumnLayout {
          anchors.left: parent.left
          anchors.right: parent.right
          anchors.top: parent.top
          anchors.bottom: parent.bottom
          anchors.leftMargin: previewCard.contentLeftInset
          anchors.rightMargin: previewCard.contentRightInset
          anchors.topMargin: previewCard.contentTopInset
          anchors.bottomMargin: previewCard.contentBottomInset
          spacing: Style.spacing.sm

          Item {
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.minimumHeight: Style.space(65)
            clip: true

            Image {
              id: previewImage
              anchors.fill: parent
              source: root.selectedPath ? Util.fileUrl(root.selectedPath) : ""
              visible: source !== ""
              fillMode: Image.PreserveAspectCrop
              asynchronous: true
              cache: false
              smooth: true
              mipmap: true
            }

            Text {
              anchors.centerIn: parent
              visible: !previewImage.visible
              textFormat: Text.PlainText
              text: "Select a wallpaper to preview"
              color: Color.foreground
              opacity: 0.6
              font.family: Style.font.family
              font.pixelSize: Style.font.bodySmall
            }
          }

          Text {
            Layout.fillWidth: true
            textFormat: Text.PlainText
            text: root.selectedPath ? root.filename(root.selectedPath) : "No wallpaper selected"
            color: Color.foreground
            font.family: Style.font.family
            font.pixelSize: Style.font.body
            font.bold: true
            elide: Text.ElideRight
          }

          Text {
            Layout.fillWidth: true
            textFormat: Text.PlainText
            text: "Preview crop is approximate."
            color: Color.foreground
            opacity: 0.65
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
            elide: Text.ElideRight
          }
        }
      }

      Item {
        id: gridArea
        Layout.fillWidth: true
        Layout.fillHeight: true
        Layout.minimumHeight: Style.space(120)
        clip: true

        GridView {
          id: imageGrid
          anchors.fill: parent
          model: root.displayedImages
          cellWidth: root.gridCellWidth
          cellHeight: root.gridCellHeight
          clip: true
          boundsBehavior: Flickable.StopAtBounds
          cacheBuffer: root.thumbnailHeight

          delegate: Button {
            required property var modelData
            required property int index

            width: root.thumbnailWidth
            height: root.thumbnailHeight
            text: ""
            tooltipText: modelData.name + "\n" + modelData.path
            background: Color.background
            bordered: true
            focusable: true
            selected: root.selectedPath === modelData.path
            Accessible.name: "Select " + modelData.name
            onClicked: root.selectImage(modelData.path)

            Image {
              id: thumbnail
              anchors.fill: parent
              anchors.margins: Style.space(2)
              source: Util.fileUrl(modelData.path)
              fillMode: Image.PreserveAspectCrop
              asynchronous: true
              cache: false
              smooth: true
              mipmap: true
              sourceSize.width: root.thumbnailWidth
              sourceSize.height: root.thumbnailHeight
            }

            Rectangle {
              anchors.fill: thumbnail
              visible: thumbnail.status !== Image.Ready
              color: Color.background
              opacity: 0.86

              Text {
                anchors.centerIn: parent
                textFormat: Text.PlainText
                text: thumbnail.status === Image.Error ? "Unable to load" : "Loading..."
                color: Color.foreground
                opacity: 0.8
                font.family: Style.font.family
                font.pixelSize: Style.font.caption
              }
            }

            Rectangle {
              anchors.left: parent.left
              anchors.right: parent.right
              anchors.bottom: parent.bottom
              height: Style.space(30)
              color: Util.alpha(Color.background, 0.9)
            }

            Text {
              anchors.left: parent.left
              anchors.right: parent.right
              anchors.bottom: parent.bottom
              anchors.leftMargin: Style.spacing.sm
              anchors.rightMargin: Style.spacing.sm
              height: Style.space(30)
              textFormat: Text.PlainText
              text: modelData.name
              color: Color.foreground
              font.family: Style.font.family
              font.pixelSize: Style.font.bodySmall
              verticalAlignment: Text.AlignVCenter
              elide: Text.ElideRight
            }

            Rectangle {
              anchors.fill: parent
              visible: root.selectedPath === modelData.path
              color: "transparent"
              border.color: Color.accent
              border.width: Style.space(2)
            }
          }
        }

        Column {
          anchors.centerIn: parent
          width: Math.min(parent.width - Style.space(24), Style.space(420))
          spacing: Style.spacing.sm
          visible: root.loading || root.scanError !== "" || root.displayedImages.length === 0

          Text {
            width: parent.width
            textFormat: Text.PlainText
            text: root.loading ? "Loading wallpapers..."
              : root.scanError !== "" ? "Could not load wallpapers"
              : root.searchText ? "No wallpapers match this filename"
              : "No wallpapers found"
            color: root.scanError !== "" ? Color.urgent : Color.foreground
            font.family: Style.font.family
            font.pixelSize: Style.font.title
            font.bold: true
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.Wrap
          }

          Text {
            width: parent.width
            visible: root.scanError !== ""
            textFormat: Text.PlainText
            text: root.scanError
            color: Color.foreground
            opacity: 0.75
            font.family: Style.font.family
            font.pixelSize: Style.font.bodySmall
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.Wrap
          }
        }

        DropArea {
          anchors.fill: parent
          onDropped: function(drop) {
            var urls = drop.urls || []
            if (urls.length !== 1) {
              root.dropRejected("Drop one folder at a time")
              return
            }
            var value = String(urls[0])
            if (value.indexOf("file://") === 0) value = decodeURIComponent(value.substring(7))
            if (value.charAt(0) !== "/") {
              root.dropRejected("Only local folders can be added")
              return
            }
            root.folderDropped(value)
          }
        }
      }

      RowLayout {
        Layout.fillWidth: true
        spacing: Style.spacing.controlGap

        Item { Layout.fillWidth: true }

        Button {
          text: "Manage sources"
          bordered: true
          focusable: true
          onClicked: root.sourceManagementRequested()
        }

        Button {
          text: "Cancel"
          bordered: true
          focusable: true
          onClicked: root.cancelled()
        }

        Button {
          text: "Use this wallpaper"
          bordered: true
          focusable: true
          enabled: root.selectedPath !== "" && !root.loading
          onClicked: {
            var path = String(root.selectedPath || "")
            if (path) root.selected(path)
          }
        }
      }
    }
  }
}

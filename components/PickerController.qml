import Quickshell.Io
import QtQuick
import "../WorkspaceModel.js" as Model

Item {
  id: root

  property var pickerState: Model.emptyPickerState()
  property int requestSerial: 0
  property int activeSerial: 0
  property string targetKey: ""
  property bool active: false
  property bool expectedStop: false
  property int processSerial: 0
  property bool processExited: false
  property int processExitCode: 0
  property bool stdoutReady: false
  property bool stderrReady: false

  signal selected(targetKey: string, path: string, serial: int)
  signal cancelled(targetKey: string, serial: int)
  signal failed(targetKey: string, reason: string, serial: int)

  function usableDirectory(path) {
    var value = String(path || "")
    return value[0] === "/" && !/[\0\r\n\t]/.test(value)
  }

  function appendDirectories(value, directories) {
    var candidates = Array.isArray(value) ? value : String(value || "").split("\n")
    for (var i = 0; i < candidates.length; i++) {
      var directory = String(candidates[i] || "").trim()
      if (usableDirectory(directory) && directories.indexOf(directory) === -1)
        directories.push(directory)
    }
  }

  function invalidate() {
    root.requestSerial += 1
    root.pickerState = {
      serial: root.requestSerial,
      active: false,
      targetKey: ""
    }
  }

  function open(workspaceKey, themeDirectory, folderDirectory) {
    var key = Model.normalizeWorkspaceKey(workspaceKey)
    if (!key) {
      root.failed(String(workspaceKey || ""), "invalid-workspace-key", root.requestSerial)
      return
    }
    if (root.active || root.processSerial !== 0) {
      root.failed(key, "picker-busy", root.requestSerial)
      return
    }

    var next = Model.beginPicker(root.pickerState, key)
    root.pickerState = next.state
    root.requestSerial = next.serial
    root.activeSerial = next.serial
    root.targetKey = key
    root.active = true
    root.expectedStop = false

    var directories = []
    appendDirectories(themeDirectory, directories)
    appendDirectories(folderDirectory, directories)
    if (!directories.length) {
      root.active = false
      root.targetKey = ""
      root.pickerState = Model.completePicker(root.pickerState, root.activeSerial, "").state
      root.failed(key, "no-image-directories", root.activeSerial)
      return
    }

    root.processSerial = next.serial
    root.processExited = false
    root.stdoutReady = false
    root.stderrReady = false
    pickerProc.command = [
      "omarchy-menu-images", "--show-labels", "--filterable", "--lazy-thumbnails"
    ].concat(directories)
    pickerProc.running = true
  }

  function cancel(notify) {
    var key = root.targetKey
    var serial = root.activeSerial
    var wasActive = root.active || pickerProc.running
    if (!wasActive) return
    root.expectedStop = root.processSerial !== 0
    root.active = false
    root.targetKey = ""
    root.invalidate()
    if (pickerProc.running) pickerProc.running = false
    if (notify && key) root.cancelled(key, serial)
  }

  function completeProcess() {
    if (!root.processExited || !root.stdoutReady || !root.stderrReady) return

    var serial = root.processSerial
    var wasExpectedStop = root.expectedStop
    var output = String(pickerStdout.text || "").trim()
    var errorText = String(pickerStderr.text || "").trim()
    var exitCode = root.processExitCode
    var key = root.targetKey
    root.processSerial = 0
    root.processExited = false
    root.stdoutReady = false
    root.stderrReady = false
    root.active = false
    root.targetKey = ""
    root.expectedStop = false

    if (wasExpectedStop) return
    if (exitCode !== 0) {
      root.pickerState = Model.completePicker(root.pickerState, serial, "").state
      root.failed(key, errorText || "picker-failed", serial)
      return
    }

    var result = Model.completePicker(root.pickerState, serial, output)
    root.pickerState = result.state
    if (result.action === "stale") return
    if (result.action === "cancelled") {
      root.cancelled(key, serial)
    } else if (result.action === "invalid") {
      root.failed(key, "unsupported-image-path", serial)
    } else if (result.action === "selected") {
      root.selected(result.key, result.path, serial)
    }
  }

  Process {
    id: pickerProc
    command: []

    stdout: StdioCollector {
      id: pickerStdout
      waitForEnd: true
      onStreamFinished: {
        root.stdoutReady = true
        root.completeProcess()
      }
    }
    stderr: StdioCollector {
      id: pickerStderr
      waitForEnd: true
      onStreamFinished: {
        root.stderrReady = true
        root.completeProcess()
      }
    }

    onExited: function(exitCode) {
      root.processExitCode = exitCode
      root.processExited = true
      root.completeProcess()
    }
  }
}

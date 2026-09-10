import Quickshell
import Quickshell.Io
import QtQuick
import "ConfigModel.js" as Config
import "ApplyModel.js" as Apply

Item {
  id: root
  property var engine: null
  property var worker: null
  property var capabilityState: ({
    schemaVersion: 1, protocolVersion: 1, sessionId: "starting", ready: false, busy: false,
    mode: "unavailable", revision: 0, token: "missing", desiredHash: "", assignments: {}, sources: {}, sourceHashes: {},
    features: ["applyConfig", "operationStatus"], limits: { maxRequestBytes: 65536 }, lastError: null
  })
  readonly property bool ready: capabilityState.ready === true
  readonly property bool busy: worker !== null || capabilityState.busy === true
  readonly property string helperPath: decodeURIComponent(String(Qt.resolvedUrl("cli/runtime-helper.cjs")).replace(/^file:\/\//, ""))

  signal snapshotPublished(var runtime)
  signal operationFinished(string result)
  signal reloadFinished(bool success, string message)

  function capabilities() { return JSON.stringify(capabilityState) }
  function operationStatus(requestId) {
    if (!engine) return JSON.stringify({ schemaVersion: 1, ok: false, command: "config apply", requestId: requestId,
      phase: "unknown", code: "unknown-operation", message: "Service is starting; inspect status before retrying.",
      data: { sessionId: "starting", exitCode: 5, retrySafe: false, renderVerification: "unknown" } })
    return JSON.stringify(engine.operationStatus(requestId))
  }
  function applyJson(raw) {
    try {
      if (!engine) throw Config.configError("runtime-starting", "Service is starting.")
      if (raw.length > 65536) throw Config.configError("request-too-large", "Apply request exceeds the IPC limit.")
      return JSON.stringify(engine.accept(Config.parseJson(raw)))
    } catch (error) {
      return JSON.stringify({ schemaVersion: 1, ok: false, command: "config apply", requestId: "",
        phase: "failed", code: error.code || "invalid-request", message: error.message,
        data: { sessionId: capabilityState.sessionId, exitCode: error.exitCode || 2, retrySafe: false, renderVerification: "unknown" } })
    }
  }
  function completeJob(job, outcome) {
    if (worker !== job) return
    worker = null
    if (job.mode === "inspect") {
      var loaded = outcome.ok === true ? engine.load(outcome.data) : false
      if (outcome.ok !== true) engine.failLoad(outcome)
      if (job.notifyReload) reloadFinished(loaded, loaded ? "Applied state reloaded; desired configuration was not read." : String(outcome.message || capabilityState.lastError.message))
    } else if (engine.finish(job.requestId, outcome)) {
      operationFinished(JSON.stringify(engine.operationStatus(job.requestId)))
    }
    job.destroy()
  }
  function launch(mode, payload, requestId, notifyReload) {
    if (worker) throw new Error("A runtime worker is already active.")
    var job = workerComponent.createObject(root, { mode: mode, payload: payload || "", requestId: requestId || "", notifyReload: notifyReload === true })
    if (!job) throw new Error("Cannot create runtime worker.")
    worker = job
    job.completed.connect(function(outcome) { root.completeJob(job, outcome) })
    job.begin()
  }
  function reload(notify) {
    if (!engine || busy || !engine.beginLoad()) return false
    try { launch("inspect", "", "", notify) }
    catch (error) {
      engine.failLoad({ code: "worker-start", message: error.message, exitCode: 3 })
      if (notify) reloadFinished(false, error.message)
    }
    return true
  }

  Component {
    id: workerComponent
    Item {
      id: job
      property string mode: "inspect"
      property string payload: ""
      property string requestId: ""
      property bool notifyReload: false
      property bool outputDone: false
      property bool errorDone: false
      property bool processExited: false
      property bool didStart: false
      property bool finished: false
      property int code: -1
      signal completed(var outcome)

      function begin() { deadline.start(); process.running = true }
      function finish(outcome) {
        if (finished) return
        finished = true
        deadline.stop()
        completed(outcome)
      }
      function collect() {
        if (finished || !processExited || !outputDone || !errorDone) return
        try {
          var outcome = Config.parseJson(String(output.text || ""))
          if (!outcome || typeof outcome.ok !== "boolean" || (code !== 0 && outcome.ok)) throw new Error("Invalid worker response.")
          if (!outcome.ok && (!outcome.message || !outcome.code || [2, 3, 4, 5, 6].indexOf(outcome.exitCode) === -1)) throw new Error("Invalid worker error.")
          finish(outcome)
        } catch (error) {
          finish({ ok: false, code: "worker-protocol", message: "Cannot verify runtime worker completion; inspect status before retrying.", exitCode: mode === "apply" ? 5 : 6 })
        }
      }
      Process {
        id: process
        command: job.mode === "apply" ? ["node", root.helperPath, "apply", job.payload] : ["node", root.helperPath, "inspect"]
        stdout: StdioCollector {
          id: output
          waitForEnd: true
          onStreamFinished: { job.outputDone = true; job.collect() }
        }
        stderr: StdioCollector {
          waitForEnd: true
          onStreamFinished: { job.errorDone = true; job.collect() }
        }
        onStarted: job.didStart = true
        onExited: function(exitCode, exitStatus) { job.code = exitCode; job.processExited = true; job.collect() }
      }
      // This watchdog exists only while a request/initial load is active.
      Timer {
        id: deadline
        interval: job.mode === "apply" ? 30000 : 5000
        repeat: false
        onTriggered: {
          if (job.finished) return
          var outcome = { ok: false, code: job.didStart ? "worker-timeout" : "dependency-unavailable",
            message: job.didStart ? "Runtime worker deadline expired. Completion is unknown; inspect state before retrying." : "Cannot start the runtime worker. Verify Node 22+ is on the shell service PATH.",
            exitCode: job.didStart && job.mode === "apply" ? 5 : 3 }
          job.finished = true
          if (process.running) process.signal(9)
          job.completed(outcome)
        }
      }
    }
  }

  Component.onCompleted: {
    var session = Date.now().toString(36) + "-" + Math.random().toString(36).substring(2) + "-" + Math.random().toString(36).substring(2)
    engine = Apply.createEngine({
      sessionId: session,
      validateConfig: function(value) { return Config.validateConfig(value) },
      run: function(request) { root.launch("apply", JSON.stringify(request), request.requestId, false) },
      publish: function(runtime) { root.snapshotPublished(runtime) },
      changed: function() { root.capabilityState = root.engine.capabilities() }
    })
    capabilityState = engine.capabilities()
    reload(false)
  }
}

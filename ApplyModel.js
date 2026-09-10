// Pure transaction/receipt state shared by Quickshell and headless tests.
function fail(code, message, exitCode) {
  var error = new Error(message)
  error.code = code
  error.exitCode = exitCode || 2
  return error
}
function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value) }
function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key) }
function clone(value) { return JSON.parse(JSON.stringify(value)) }
function identifier(value) { return typeof value === "string" && value.length > 0 && value.length <= 128 && !/[^A-Za-z0-9-]/.test(value) }
function hash(value) { return typeof value === "string" && value.length === 64 && !/[^a-f0-9]/.test(value) }
function revision(value) { return typeof value === "number" && isFinite(value) && Math.floor(value) === value && value >= 0 && value <= 9007199254740991 }
function exact(value, keys) {
  if (!object(value) || Object.keys(value).length !== keys.length) return false
  for (var i = 0; i < keys.length; i++) if (!own(value, keys[i])) return false
  return true
}
function sameMap(a, b) {
  if (!object(a) || !object(b)) return false
  var keys = Object.keys(a).sort()
  if (keys.length !== Object.keys(b).length) return false
  for (var i = 0; i < keys.length; i++) if (!own(b, keys[i]) || a[keys[i]] !== b[keys[i]]) return false
  return true
}
function hashesFor(value, assignments) {
  if (!object(value) || Object.keys(value).length !== Object.keys(assignments).length)
    throw fail("invalid-request", "Every assignment needs exactly one source content hash.")
  var result = Object.create(null)
  var keys = Object.keys(assignments).sort()
  for (var i = 0; i < keys.length; i++) {
    if (!own(value, keys[i]) || !hash(value[keys[i]])) throw fail("invalid-request", "Invalid source content hash.")
    result[keys[i]] = value[keys[i]]
  }
  return result
}
function validateRequest(value, validateConfig) {
  if (!exact(value, ["schemaVersion", "requestId", "sessionId", "expectedRevision", "expectedToken", "desiredHash", "config", "sourceHashes"])
      || value.schemaVersion !== 1 || !identifier(value.requestId) || value.requestId.length > 64
      || !identifier(value.sessionId) || !revision(value.expectedRevision)
      || !(value.expectedToken === "missing" || hash(value.expectedToken)) || !hash(value.desiredHash))
    throw fail("invalid-request", "Invalid v1 apply request envelope.")
  var config = validateConfig(value.config)
  return {
    schemaVersion: 1, requestId: value.requestId, sessionId: value.sessionId,
    expectedRevision: value.expectedRevision, expectedToken: value.expectedToken,
    desiredHash: value.desiredHash, config: config,
    sourceHashes: hashesFor(value.sourceHashes, config.assignments)
  }
}
function validateSnapshot(value, validateConfig, imageDirectory) {
  if (!exact(value, ["schemaVersion", "revision", "desiredHash", "assignments", "sources", "sourceHashes", "requestId", "sessionId"])
      || value.schemaVersion !== 1 || !revision(value.revision) || value.revision < 1
      || !hash(value.desiredHash) || !identifier(value.requestId) || !identifier(value.sessionId)
      || typeof imageDirectory !== "string" || imageDirectory.charAt(0) !== "/")
    throw fail("invalid-applied-state", "Invalid applied snapshot; last good in-memory state is retained.", 6)
  var assignments = validateConfig({ version: 1, assignments: value.assignments }).assignments
  var sources = validateConfig({ version: 1, assignments: value.sources }).assignments
  var hashes = hashesFor(value.sourceHashes, sources)
  if (Object.keys(assignments).length !== Object.keys(sources).length)
    throw fail("invalid-applied-state", "Applied and source maps disagree.", 6)
  var keys = Object.keys(sources)
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i]
    var extension = sources[key].substring(sources[key].lastIndexOf(".") + 1).toLowerCase()
    if (extension === "jpeg") extension = "jpg"
    if (assignments[key] !== imageDirectory + "/" + hashes[key] + "." + extension)
      throw fail("invalid-applied-state", "Applied image is outside its content-addressed storage contract.", 6)
  }
  return { schemaVersion: 1, revision: value.revision, desiredHash: value.desiredHash,
    assignments: assignments, sources: sources, sourceHashes: hashes,
    requestId: value.requestId, sessionId: value.sessionId }
}
function validateRuntime(value, validateConfig) {
  if (!object(value) || !(value.token === "missing" || hash(value.token)) || typeof value.statePath !== "string")
    throw fail("invalid-applied-state", "Invalid runtime snapshot.", 6)
  var result = clone(value)
  if (value.mode === "applied") result.snapshot = validateSnapshot(value.snapshot, validateConfig, value.imageDirectory)
  else if (value.mode === "legacy" && object(value.snapshot) && value.snapshot.revision === 0 && value.snapshot.desiredHash === "") {
    result.snapshot.assignments = validateConfig({ version: 1, assignments: value.snapshot.assignments }).assignments
    if (!sameMap(result.snapshot.assignments, value.snapshot.sources) || Object.keys(value.snapshot.sourceHashes || {}).length)
      throw fail("invalid-applied-state", "Invalid legacy snapshot.", 6)
  } else throw fail("invalid-applied-state", "Unsupported runtime snapshot mode.", 6)
  return result
}
function createEngine(options) {
  var sessionId = options.sessionId
  var current = null
  var ready = false
  var active = null
  var lastError = null
  var receipts = Object.create(null)
  var order = []
  function changed() { if (options.changed) options.changed() }
  function result(id, phase, ok, code, message, data) {
    var detail = data || {}
    detail.sessionId = sessionId
    detail.renderVerification = "unknown"
    return { schemaVersion: 1, ok: ok, command: "config apply", requestId: String(id || ""), phase: phase, code: code, message: message, data: detail }
  }
  function rejected(id, code, message, exitCode) {
    return result(id, exitCode === 5 ? "unknown" : "failed", false, code, message, { exitCode: exitCode, retrySafe: false })
  }
  function capabilities() {
    var state = current ? current.snapshot : { revision: 0, desiredHash: "", assignments: {}, sources: {}, sourceHashes: {} }
    return clone({ schemaVersion: 1, protocolVersion: 1, sessionId: sessionId, ready: ready, busy: active !== null,
      mode: current ? current.mode : "unavailable", revision: state.revision, token: current ? current.token : "missing",
      desiredHash: state.desiredHash, assignments: state.assignments, sources: state.sources, sourceHashes: state.sourceHashes,
      statePath: current ? current.statePath : "", imageDirectory: current ? current.imageDirectory : "",
      lastRequestId: state.requestId || "", lastAppliedSessionId: state.sessionId || "",
      features: ["applyConfig", "operationStatus"], limits: { maxRequestBytes: 65536, retainedOperations: 64 }, lastError: lastError })
  }
  function failLoad(error) {
    ready = false
    lastError = { code: error.code || "runtime-unavailable", message: error.message || "Cannot inspect runtime state.", exitCode: error.exitCode || 6 }
    changed()
  }
  function load(runtime) {
    if (active) throw fail("runtime-busy", "Cannot reload during an active apply.", 4)
    try {
      var next = validateRuntime(runtime, options.validateConfig)
      if (current && current.mode === "applied" && (next.mode !== "applied" || next.snapshot.revision < current.snapshot.revision))
        throw fail("state-regressed", "Applied state disappeared or regressed; restore it before reloading.", 6)
      options.publish(clone(next))
      current = next
      ready = true
      lastError = null
      changed()
      return true
    } catch (error) { failLoad(error); return false }
  }
  function beginLoad() {
    if (active) return false
    ready = false
    changed()
    return true
  }
  function operationStatus(id) {
    return own(receipts, id) ? clone(receipts[id].result) : rejected(id, "unknown-operation", "Receipt is unknown, expired, or belongs to another service session. Inspect status before retrying.", 5)
  }
  function finish(id, outcome) {
    if (!active || active.requestId !== id) return false
    var request = active
    active = null
    var completion
    try {
      if (!outcome || outcome.ok !== true) {
        var err = outcome || { code: "worker-protocol", message: "Missing worker result.", exitCode: 5 }
        var uncertain = err.exitCode === 5 || !!(err.data && err.data.committed)
        if (uncertain) ready = false
        lastError = { code: err.code || "runtime-failure", message: err.message || "Apply failed.", exitCode: uncertain ? 5 : (err.exitCode || 6) }
        completion = result(id, uncertain ? "unknown" : "failed", false, lastError.code, lastError.message,
          { exitCode: lastError.exitCode, retrySafe: false, committed: !!(err.data && err.data.committed) })
      } else {
        var next = validateRuntime(outcome.data.runtime, options.validateConfig)
        var unchanged = outcome.data.unchanged === true
        if (next.mode !== "applied" || next.snapshot.desiredHash !== request.desiredHash
            || !sameMap(next.snapshot.sources, request.config.assignments) || !sameMap(next.snapshot.sourceHashes, request.sourceHashes)
            || (unchanged ? next.token !== current.token || next.snapshot.revision !== request.expectedRevision
              : next.snapshot.requestId !== id || next.snapshot.sessionId !== sessionId || next.snapshot.revision !== request.expectedRevision + 1))
          throw fail("worker-protocol", "Worker completion does not match this transaction; inspect persisted status.", 5)
        if (!unchanged) options.publish(clone(next))
        current = next
        ready = true
        lastError = null
        completion = result(id, unchanged ? "unchanged" : "applied", true, "ok", unchanged ? "Configuration is already applied." : "Complete configuration persisted; renderer verification is separate.",
          { revision: next.snapshot.revision, desiredHash: next.snapshot.desiredHash, assignments: next.snapshot.assignments, warnings: outcome.data.warnings || [], retrySafe: false })
      }
    } catch (error) {
      ready = false
      lastError = { code: error.code || "worker-protocol", message: error.message, exitCode: 5 }
      completion = rejected(id, lastError.code, lastError.message, 5)
    }
    receipts[id].result = completion
    changed()
    return true
  }
  function accept(value) {
    var id = value && typeof value.requestId === "string" ? value.requestId : ""
    var request
    try { request = validateRequest(value, options.validateConfig) }
    catch (error) { return rejected(id, error.code || "invalid-request", error.message, error.exitCode || 2) }
    var fingerprint = JSON.stringify(request)
    if (own(receipts, id)) return receipts[id].fingerprint === fingerprint ? clone(receipts[id].result) : rejected(id, "request-conflict", "Request ID was reused with different content.", 4)
    if (request.sessionId !== sessionId) return rejected(id, "session-changed", "Service session changed; inspect status and prepare a new request.", 4)
    if (active) return rejected(id, "runtime-busy", "Another configuration is being applied.", 4)
    if (!ready || !current) return rejected(id, "runtime-unavailable", "Runtime state is not ready; inspect doctor/status and reload after recovery.", 3)
    if (request.expectedRevision !== current.snapshot.revision || request.expectedToken !== current.token)
      return rejected(id, "stale-revision", "Applied state changed; reread status before applying.", 4)
    while (order.length >= 64) delete receipts[order.shift()]
    var receipt = result(id, "accepted", true, "accepted", "Request accepted, not yet persisted.", { revision: current.snapshot.revision, retrySafe: false })
    receipts[id] = { fingerprint: fingerprint, result: receipt }
    order.push(id)
    active = request
    changed()
    try { options.run(clone(request)) }
    catch (error) { finish(id, { ok: false, code: error.code || "worker-start", message: error.message, exitCode: error.exitCode || 3 }) }
    return clone(receipt)
  }
  return { load: load, beginLoad: beginLoad, failLoad: failLoad, accept: accept, finish: finish, operationStatus: operationStatus,
    capabilities: capabilities, view: function() { return { operationCount: order.length, activeRequestId: active ? active.requestId : "", ready: ready } } }
}
if (typeof module !== "undefined") module.exports = { validateRequest: validateRequest, validateSnapshot: validateSnapshot, validateRuntime: validateRuntime, sameMap: sameMap, createEngine: createEngine }

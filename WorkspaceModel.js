function asString(value) {
  return value === undefined || value === null ? "" : String(value)
}

function isSpecialWorkspaceName(name) {
  var value = asString(name)
  return value === "special" || value.indexOf("special:") === 0
}

function normalizeWorkspaceKey(value) {
  var raw = asString(value)
  var idMatch = raw.match(/^id:(\d+)$/)
  if (idMatch) {
    var id = Number(idMatch[1])
    return Number.isInteger(id) && id > 0 ? "id:" + id : ""
  }

  if (raw.indexOf("name:") === 0) {
    var name = raw.substring(5)
    if (!name || isSpecialWorkspaceName(name)) return ""
    return "name:" + name
  }

  return ""
}

function workspaceKeyCandidates(workspace) {
  if (!workspace || typeof workspace !== "object") return []

  var name = asString(workspace.name)
  if (isSpecialWorkspaceName(name)) return []

  var keys = []
  var id = Number(workspace.id)
  if (Number.isInteger(id) && id > 0) keys.push("id:" + id)
  if (name) keys.push("name:" + name)
  return keys
}

function preferredWorkspaceKey(workspace) {
  var keys = workspaceKeyCandidates(workspace)
  return keys.length ? keys[0] : ""
}

function normalizeImagePath(value) {
  var path = asString(value)
  if (!path || path[0] !== "/" || path.indexOf("\0") !== -1) return ""
  if (!/\.(png|jpe?g|webp)$/i.test(path)) return ""
  return path
}

function emptyState() {
  return { version: 1, assignments: {} }
}

function parseState(raw) {
  try {
    var parsed = JSON.parse(asString(raw))
    if (!parsed || typeof parsed !== "object" || parsed.version !== 1)
      return emptyState()

    var source = parsed.assignments && typeof parsed.assignments === "object"
      ? parsed.assignments : {}
    var assignments = {}

    Object.keys(source).forEach(function(key) {
      var normalizedKey = normalizeWorkspaceKey(key)
      var normalizedPath = normalizeImagePath(source[key])
      if (normalizedKey && normalizedPath) assignments[normalizedKey] = normalizedPath
    })

    return { version: 1, assignments: assignments }
  } catch (error) {
    return emptyState()
  }
}

function assignmentForWorkspace(state, workspace) {
  var normalized = parseState(JSON.stringify(state || emptyState()))
  var keys = workspaceKeyCandidates(workspace)
  for (var i = 0; i < keys.length; i++) {
    if (normalized.assignments[keys[i]]) return normalized.assignments[keys[i]]
  }
  return ""
}

function withAssignment(state, workspaceKey, imagePath) {
  var key = normalizeWorkspaceKey(workspaceKey)
  var path = normalizeImagePath(imagePath)
  var next = parseState(JSON.stringify(state || emptyState()))
  if (key && path) next.assignments[key] = path
  return next
}

function withoutAssignment(state, workspaceKey) {
  var key = normalizeWorkspaceKey(workspaceKey)
  var next = parseState(JSON.stringify(state || emptyState()))
  if (key) delete next.assignments[key]
  return next
}

function statusPayload(state, fallback, statePath) {
  var normalized = parseState(JSON.stringify(state || emptyState()))
  return {
    version: 1,
    assignments: normalized.assignments,
    fallback: normalizeImagePath(fallback),
    statePath: asString(statePath),
    staticFormats: ["png", "jpg", "jpeg", "webp"]
  }
}

function emptyRenderState() {
  return {
    generation: 0,
    requested: "",
    fallback: "",
    displayed: "",
    displayedGeneration: 0
  }
}

function normalizeRenderState(state) {
  var source = state && typeof state === "object" ? state : emptyRenderState()
  var generation = Number(source.generation)
  var displayedGeneration = Number(source.displayedGeneration)
  return {
    generation: Number.isInteger(generation) && generation >= 0 ? generation : 0,
    requested: normalizeImagePath(source.requested),
    fallback: normalizeImagePath(source.fallback),
    displayed: normalizeImagePath(source.displayed),
    displayedGeneration: Number.isInteger(displayedGeneration) && displayedGeneration >= 0
      ? displayedGeneration : 0
  }
}

function requestRender(state, requestedPath, fallbackPath) {
  var current = normalizeRenderState(state)
  return {
    generation: current.generation + 1,
    requested: normalizeImagePath(requestedPath),
    fallback: normalizeImagePath(fallbackPath),
    displayed: current.displayed,
    displayedGeneration: current.displayedGeneration
  }
}

function completeRender(state, generation, imagePath, ok) {
  var current = normalizeRenderState(state)
  var path = normalizeImagePath(imagePath)
  if (generation !== current.generation || path !== current.requested) {
    return { action: "stale", state: current }
  }

  if (ok === true) {
    return {
      action: "display",
      state: {
        generation: current.generation,
        requested: current.requested,
        fallback: current.fallback,
        displayed: current.requested,
        displayedGeneration: current.generation
      }
    }
  }

  if (current.fallback && current.fallback !== current.requested) {
    return {
      action: "fallback",
      state: {
        generation: current.generation + 1,
        requested: current.fallback,
        fallback: "",
        displayed: current.displayed,
        displayedGeneration: current.displayedGeneration
      }
    }
  }

  return {
    action: "clear",
    state: {
      generation: current.generation,
      requested: "",
      fallback: "",
      displayed: "",
      displayedGeneration: current.generation
    }
  }
}

if (typeof module !== "undefined") {
  module.exports = {
    isSpecialWorkspaceName: isSpecialWorkspaceName,
    normalizeWorkspaceKey: normalizeWorkspaceKey,
    workspaceKeyCandidates: workspaceKeyCandidates,
    preferredWorkspaceKey: preferredWorkspaceKey,
    normalizeImagePath: normalizeImagePath,
    emptyState: emptyState,
    parseState: parseState,
    assignmentForWorkspace: assignmentForWorkspace,
    withAssignment: withAssignment,
    withoutAssignment: withoutAssignment,
    statusPayload: statusPayload,
    emptyRenderState: emptyRenderState,
    requestRender: requestRender,
    completeRender: completeRender
  }
}

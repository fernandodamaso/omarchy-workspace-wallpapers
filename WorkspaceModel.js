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

function workspaceKeyFromInput(value) {
  var raw = asString(value)
  if (!raw) return ""
  if (raw.indexOf("id:") === 0 || raw.indexOf("name:") === 0)
    return normalizeWorkspaceKey(raw)
  if (/^\d+$/.test(raw)) return normalizeWorkspaceKey("id:" + raw)
  return normalizeWorkspaceKey("name:" + raw)
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

function workspaceLabel(workspace, key) {
  if (workspace && asString(workspace.name)) return asString(workspace.name)
  if (key.indexOf("id:") === 0) return "Workspace " + key.substring(3)
  return key.substring(5)
}

function composeWorkspaceRows(workspaces, assignments, extraKeys) {
  var state = parseState(JSON.stringify({ version: 1, assignments: assignments || {} }))
  var rows = []
  var seen = {}
  var list = workspaces || []

  for (var i = 0; i < list.length; i++) {
    var workspace = list[i]
    var key = preferredWorkspaceKey(workspace)
    if (!key || seen[key]) continue
    var candidates = workspaceKeyCandidates(workspace)
    for (var c = 0; c < candidates.length; c++) seen[candidates[c]] = true
    rows.push({
      key: key,
      label: workspaceLabel(workspace, key),
      path: assignmentForWorkspace(state, workspace),
      present: true
    })
  }

  var keys = Object.keys(state.assignments).concat(extraKeys || [])
  for (var k = 0; k < keys.length; k++) {
    var normalizedKey = normalizeWorkspaceKey(keys[k])
    if (!normalizedKey || seen[normalizedKey]) continue
    seen[normalizedKey] = true
    rows.push({
      key: normalizedKey,
      label: workspaceLabel(null, normalizedKey),
      path: state.assignments[normalizedKey] || "",
      present: false
    })
  }
  return rows
}

function wallpaperWorkspace(currentWorkspace, previousNormalWorkspace) {
  var current = currentWorkspace && typeof currentWorkspace === "object"
    ? currentWorkspace : null
  if (current && !isSpecialWorkspaceName(current.name)) return current

  var previous = previousNormalWorkspace && typeof previousNormalWorkspace === "object"
    ? previousNormalWorkspace : null
  if (previous && !isSpecialWorkspaceName(previous.name)) return previous
  return null
}

function normalizeImagePath(value) {
  var path = asString(value)
  if (!path || path[0] !== "/" || /[\0\r\n\t]/.test(path)) return ""
  if (!/\.(png|jpe?g|webp)$/i.test(path)) return ""
  return path
}

function emptyHistoryState() {
  return { version: 1, recent: [], undo: null }
}

function normalizeHistoryUsedAt(value) {
  if (value === undefined || value === null || asString(value).trim() === "") return null
  var usedAt = Number(value)
  return Number.isFinite(usedAt) && usedAt >= 0 ? usedAt : null
}

function normalizeHistoryRevision(value) {
  if (value === undefined || value === null || asString(value).trim() === "") return null
  var revision = Number(value)
  return Number.isInteger(revision) && revision >= 0 ? revision : null
}

function normalizeHistoryEntry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null

  var path = normalizeImagePath(value.path)
  var usedAt = normalizeHistoryUsedAt(value.usedAt)
  if (!path || typeof value.name !== "string" || !value.name || usedAt === null)
    return null

  return { path: path, name: value.name, usedAt: usedAt }
}

function normalizeHistoryUndo(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null

  var key = normalizeWorkspaceKey(value.key)
  var previousPath = value.previousPath === ""
    ? "" : normalizeImagePath(value.previousPath)
  var revision = normalizeHistoryRevision(value.revision)
  if (!key || (value.previousPath !== "" && !previousPath) || revision === null)
    return null

  return { key: key, previousPath: previousPath, revision: revision }
}

function parseHistoryState(raw) {
  var parsed
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw
  } catch (error) {
    return emptyHistoryState()
  }

  if (!parsed || typeof parsed !== "object" || parsed.version !== 1)
    return emptyHistoryState()

  var recent = []
  var seenRecent = {}
  if (Array.isArray(parsed.recent)) {
    for (var i = 0; i < parsed.recent.length; i++) {
      var entry = normalizeHistoryEntry(parsed.recent[i])
      if (entry && !seenRecent[entry.path] && recent.length < 20) {
        seenRecent[entry.path] = true
        recent.push(entry)
      }
    }
  }

  return {
    version: 1,
    recent: recent,
    undo: normalizeHistoryUndo(parsed.undo)
  }
}

function recordRecent(state, path, name, usedAt, maxEntries) {
  var next = parseHistoryState(state)
  var entry = normalizeHistoryEntry({ path: path, name: name, usedAt: usedAt })
  if (!entry) return next

  var limit = maxEntries === undefined ? 20 : Number(maxEntries)
  if (!Number.isFinite(limit) || limit < 0) limit = 20
  limit = Math.floor(limit)

  var recent = [entry]
  for (var i = 0; i < next.recent.length; i++) {
    if (next.recent[i].path !== entry.path) recent.push(next.recent[i])
  }
  next.recent = recent.slice(0, limit)
  return next
}

function recordUndo(state, key, previousPath, revision) {
  var next = parseHistoryState(state)
  var undo = normalizeHistoryUndo({
    key: key,
    previousPath: previousPath,
    revision: revision
  })
  if (undo) next.undo = undo
  return next
}

function undoCandidate(state, key, currentRevision) {
  var next = parseHistoryState(state)
  var normalizedKey = normalizeWorkspaceKey(key)
  var revision = normalizeHistoryRevision(currentRevision)
  if (!next.undo || !normalizedKey || revision === null ||
      next.undo.key !== normalizedKey || next.undo.revision !== revision)
    return { action: "stale" }
  return { action: "available", path: next.undo.previousPath }
}

function clearUndo(state) {
  var next = parseHistoryState(state)
  next.undo = null
  return next
}

function emptySourcePreferences() {
  return {
    version: 1,
    folders: [],
    lastSource: "theme",
    sort: "name",
    thumbnailSize: "medium"
  }
}

function normalizeSourceFolder(value) {
  var folder = asString(value)
  if (!folder || folder[0] !== "/" || /[\0\r\n\t]/.test(folder)) return ""
  return folder
}

function uniqueSourceFolders(value) {
  var folders = []
  if (!Array.isArray(value)) return folders

  for (var i = 0; i < value.length; i++) {
    var folder = normalizeSourceFolder(value[i])
    if (folder && folders.indexOf(folder) === -1) folders.push(folder)
  }
  return folders
}

function isValidSource(value) {
  return value === "theme" || value === "folders" || value === "recent" || value === "all"
}

function isValidSort(value) {
  return value === "name" || value === "mtime"
}

function isValidThumbnailSize(value) {
  return value === "small" || value === "medium" || value === "large"
}

function parseSourcePreferences(raw) {
  var parsed
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw
  } catch (error) {
    return emptySourcePreferences()
  }

  if (!parsed || typeof parsed !== "object" || parsed.version !== 1)
    return emptySourcePreferences()

  var preferences = emptySourcePreferences()
  preferences.folders = uniqueSourceFolders(parsed.folders)
  if (isValidSource(parsed.lastSource)) preferences.lastSource = parsed.lastSource
  if (isValidSort(parsed.sort)) preferences.sort = parsed.sort
  if (isValidThumbnailSize(parsed.thumbnailSize))
    preferences.thumbnailSize = parsed.thumbnailSize
  return preferences
}

function addSourceFolder(preferences, folder) {
  var next = parseSourcePreferences(preferences)
  var normalized = normalizeSourceFolder(folder)
  if (normalized && next.folders.indexOf(normalized) === -1)
    next.folders.push(normalized)
  return next
}

function removeSourceFolder(preferences, folder) {
  var next = parseSourcePreferences(preferences)
  var normalized = normalizeSourceFolder(folder)
  if (!normalized) return next
  next.folders = next.folders.filter(function(item) { return item !== normalized })
  return next
}

function updateSourcePreferences(preferences, updates) {
  var next = parseSourcePreferences(preferences)
  if (!updates || typeof updates !== "object") return next

  if (isValidSource(updates.lastSource)) next.lastSource = updates.lastSource
  if (isValidSort(updates.sort)) next.sort = updates.sort
  if (isValidThumbnailSize(updates.thumbnailSize))
    next.thumbnailSize = updates.thumbnailSize
  if (Array.isArray(updates.folders)) next.folders = uniqueSourceFolders(updates.folders)
  return next
}

function sourceDirectories(preferences, source, themeDirectories) {
  var normalized = parseSourcePreferences(preferences)
  var directories = []

  function append(values) {
    if (!Array.isArray(values)) return
    for (var i = 0; i < values.length; i++) {
      var directory = normalizeSourceFolder(values[i])
      if (directory && directories.indexOf(directory) === -1)
        directories.push(directory)
    }
  }

  if (source === "theme" || source === "all") append(themeDirectories)
  if (source === "folders" || source === "all") append(normalized.folders)
  return directories
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

function cancelRender(state) {
  var current = normalizeRenderState(state)
  return {
    generation: current.generation + 1,
    requested: "",
    fallback: "",
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

function emptyPickerState() {
  return { serial: 0, active: false, targetKey: "" }
}

function beginPicker(state, workspaceKey) {
  var current = state && typeof state === "object" ? state : emptyPickerState()
  var serial = Number(current.serial)
  if (!Number.isInteger(serial) || serial < 0) serial = 0
  return {
    serial: serial + 1,
    state: { serial: serial + 1, active: true, targetKey: normalizeWorkspaceKey(workspaceKey) }
  }
}

function completePicker(state, serial, imagePath) {
  var current = state && typeof state === "object" ? state : emptyPickerState()
  if (!current.active || serial !== current.serial)
    return { action: "stale", state: current }

  var next = { serial: current.serial, active: false, targetKey: "" }
  if (!asString(imagePath).trim()) return { action: "cancelled", state: next }

  var path = normalizeImagePath(imagePath)
  if (!path) return { action: "invalid", state: next }
  return { action: "selected", key: current.targetKey, path: path, state: next }
}

if (typeof module !== "undefined") {
  module.exports = {
    isSpecialWorkspaceName: isSpecialWorkspaceName,
    normalizeWorkspaceKey: normalizeWorkspaceKey,
    workspaceKeyFromInput: workspaceKeyFromInput,
    workspaceKeyCandidates: workspaceKeyCandidates,
    preferredWorkspaceKey: preferredWorkspaceKey,
    composeWorkspaceRows: composeWorkspaceRows,
    wallpaperWorkspace: wallpaperWorkspace,
    normalizeImagePath: normalizeImagePath,
    emptyHistoryState: emptyHistoryState,
    parseHistoryState: parseHistoryState,
    recordRecent: recordRecent,
    recordUndo: recordUndo,
    undoCandidate: undoCandidate,
    clearUndo: clearUndo,
    emptySourcePreferences: emptySourcePreferences,
    parseSourcePreferences: parseSourcePreferences,
    addSourceFolder: addSourceFolder,
    removeSourceFolder: removeSourceFolder,
    updateSourcePreferences: updateSourcePreferences,
    sourceDirectories: sourceDirectories,
    emptyState: emptyState,
    parseState: parseState,
    assignmentForWorkspace: assignmentForWorkspace,
    withAssignment: withAssignment,
    withoutAssignment: withoutAssignment,
    statusPayload: statusPayload,
    emptyRenderState: emptyRenderState,
    requestRender: requestRender,
    cancelRender: cancelRender,
    completeRender: completeRender,
    emptyPickerState: emptyPickerState,
    beginPicker: beginPicker,
    completePicker: completePicker
  }
}

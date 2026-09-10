// Pure desired-config boundary shared by Node and Quickshell; never evaluates input.
function configError(code, message) {
  var error = new Error(message)
  error.code = code
  error.exitCode = 2
  return error
}

function keyPattern() {
  // Lexical range 1..Number.MAX_SAFE_INTEGER, also expressible in JSON Schema.
  var upper = "9007199254740991"
  var ranges = ["[1-9][0-9]{0,14}"]
  for (var i = 0; i < upper.length; i++) {
    var low = i === 0 ? 1 : 0
    var high = Number(upper[i]) - 1
    if (high < low) continue
    var digit = low === high ? String(low) : "[" + low + "-" + high + "]"
    var count = upper.length - i - 1
    var suffix = count === 0 ? "" : count === 1 ? "[0-9]" : "[0-9]{" + count + "}"
    ranges.push(upper.substring(0, i) + digit + suffix)
  }
  ranges.push(upper)
  // An absolute end assertion avoids JavaScript $ accepting a final newline.
  return "^(?:id:(?:" + ranges.join("|") + ")|name:(?!special(?::|$))[^\\u0000-\\u001f\\u007f]+)(?![\\s\\S])"
}

function pathPattern() {
  return "^/[^\\u0000-\\u001f\\u007f]*\\.(?:[pP][nN][gG]|[jJ][pP][eE]?[gG]|[wW][eE][bB][pP])(?![\\s\\S])"
}

function validKey(key) {
  return typeof key === "string" && new RegExp(keyPattern()).test(key)
}

function validPath(path) {
  return typeof path === "string" && new RegExp(pathPattern()).test(path)
}

function schema() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Workspace Wallpapers desired configuration v1",
    type: "object",
    additionalProperties: false,
    required: ["version", "assignments"],
    properties: {
      version: { const: 1 },
      assignments: {
        type: "object",
        maxProperties: 1024,
        propertyNames: { pattern: keyPattern() },
        additionalProperties: { type: "string", pattern: pathPattern() }
      }
    }
  }
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function validateConfig(value) {
  if (!object(value) || value.version !== 1 || !object(value.assignments)
      || Object.keys(value).length !== 2
      || !Object.prototype.hasOwnProperty.call(value, "version")
      || !Object.prototype.hasOwnProperty.call(value, "assignments"))
    throw configError("invalid-config", "Expected exactly version: 1 and an assignments object.")
  var keys = Object.keys(value.assignments).sort()
  if (keys.length > 1024) throw configError("invalid-config", "At most 1024 assignments are supported.")
  var assignments = Object.create(null)
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i]
    if (!validKey(key)) throw configError("invalid-workspace-key", "Invalid canonical workspace key: " + JSON.stringify(key))
    if (!validPath(value.assignments[key])) throw configError("unsupported-image-path", "Use an absolute PNG/JPEG/WebP path for " + JSON.stringify(key))
    assignments[key] = value.assignments[key]
  }
  return { version: 1, assignments: assignments }
}

function parseJson(raw) {
  if (typeof raw !== "string" || raw.length > 1048576)
    throw configError("invalid-json", "JSON must be a string no larger than 1 MiB.")
  var at = 0
  function bad() { throw configError("invalid-json", "Invalid JSON near character " + at + ".") }
  function space() { while (at < raw.length && /[ \t\r\n]/.test(raw[at])) at++ }
  function string() {
    if (raw[at] !== '"') bad()
    var start = at++
    while (at < raw.length) {
      var ch = raw[at++]
      if (ch === "\\") at++
      else if (ch === '"') {
        try { return JSON.parse(raw.substring(start, at)) } catch (error) { bad() }
      }
    }
    bad()
  }
  function value(depth) {
    if (depth > 64) throw configError("invalid-json", "JSON nesting exceeds 64 levels.")
    space()
    var ch = raw[at]
    if (ch === '"') return string()
    if (ch === "{" || ch === "[") {
      var isObject = ch === "{"
      var result = isObject ? Object.create(null) : []
      var end = isObject ? "}" : "]"
      at++
      space()
      if (raw[at] === end) { at++; return result }
      while (at < raw.length) {
        space()
        if (isObject) {
          var key = string()
          if (Object.prototype.hasOwnProperty.call(result, key))
            throw configError("duplicate-key", "Duplicate JSON property: " + JSON.stringify(key))
          space()
          if (raw[at++] !== ":") bad()
          result[key] = value(depth + 1)
        } else result.push(value(depth + 1))
        space()
        if (raw[at] === end) { at++; return result }
        if (raw[at++] !== ",") bad()
      }
      bad()
    }
    var match = raw.substring(at).match(/^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/)
    if (!match) bad()
    at += match[0].length
    var parsed = JSON.parse(match[0])
    if (typeof parsed === "number" && !isFinite(parsed)) bad()
    return parsed
  }
  var parsed = value(0)
  space()
  if (at !== raw.length) bad()
  return parsed
}

if (typeof module !== "undefined") module.exports = { configError: configError, keyPattern: keyPattern, pathPattern: pathPattern, validKey: validKey, validPath: validPath, schema: schema, validateConfig: validateConfig, parseJson: parseJson }

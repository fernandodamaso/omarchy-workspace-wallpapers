// UI-only state. Workspace keys are already validated by WorkspaceModel;
// never trim names or use row positions as persistent selection identity.
function resolveSelection(rows, selectedKey, focusedKey) {
  var entries = Array.isArray(rows) ? rows : []
  var keys = entries.filter(function(row) {
    return row && typeof row.key === "string" && row.key !== ""
  }).map(function(row) { return row.key })
  if (keys.indexOf(selectedKey) !== -1) return selectedKey
  if (keys.indexOf(focusedKey) !== -1) return focusedKey
  return keys.length ? keys[0] : ""
}

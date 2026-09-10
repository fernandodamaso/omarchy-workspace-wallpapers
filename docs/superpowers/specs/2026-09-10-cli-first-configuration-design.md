# Approved design: JSON-first configuration and agent CLI

Approved by Fernando on 2026-09-10. Parent: [FDM-909](https://linear.app/fdamaso/issue/FDM-909). This supersedes the graphical settings/split-view/folders redesign. It stays inside the existing Workspace Wallpapers product and repository.

## Product boundary

Remove the settings page, image browser, graphical file/folder selectors, optional settings menu example and configuration mouse gestures. Retain the native wallpaper service, background renderer, plugin identity, stock background/theme IPC, per-monitor behavior, exact workspace identity, scratchpad retention, static-image restriction and reversible stock restoration. `WorkspaceWallpaperPanel.qml` is the renderer and must not be deleted.

No replacement TUI, web UI, MCP server, daemon, online catalog, scheduling, animation, SmartDock coupling or automatic user-data cleanup is part of this pivot.

## Desired configuration

Canonical path: `${XDG_CONFIG_HOME:-$HOME/.config}/omarchy/workspace-wallpapers/config.json`. The human or agent owns this file. CLI editing commands update this same file; the service never rewrites it. Saving it does not apply changes.

Target version 1:

```json
{
  "version": 1,
  "assignments": {
    "id:2": "/home/user/Pictures/work.png",
    "name: Work 日本語": "/home/user/Pictures/work.webp"
  }
}
```

Paths above are illustrative. Missing assignment means the current global Omarchy background, not a copied global path. Keys preserve ID-before-name lookup and exact named-workspace spaces/Unicode. Reject special workspaces, noncanonical IDs, control characters, duplicate JSON object properties, invalid types, unsupported versions and unknown properties. Values are absolute PNG/JPEG/WebP source paths, not URLs, relative paths or shell expressions.

Publish `schemas/config.schema.json` using JSON Schema 2020-12. Programmatic and schema structural validation must agree; filesystem/readability/MIME diagnostics form a separate layer. Do not expand environment variables, evaluate shell, fetch URLs or silently sanitize invalid new input into an empty configuration.

## Runtime-owned state and migration

Target applied snapshot: `${XDG_STATE_HOME:-$HOME/.local/state}/omarchy/workspace-wallpapers/applied.json`, with effective owned-image mappings, persisted revision and desired hash. Imports retain the existing XDG_DATA_HOME image location.

Existing assignments, preferences, history and images remain intact. Explicit `config migrate` validates legacy assignments and creates desired config only if no desired config already exists. It does not apply, overwrite legacy files, remove assets or import browser-only preferences into the new public contract. If the applied snapshot does not yet exist, the service can use validated legacy assignments until the first explicit apply establishes the new snapshot.

The first removal slice leaves all legacy storage behavior unchanged. New strict validation, XDG state separation and explicit apply are subsequent implementation slices, not already-delivered behavior.

## CLI and concurrency

Use a Node 22+ executable, `bin/workspace-wallpapers`, with explicit dependency and PATH installation documentation. No execution-time network access, automatic installation or interactive prompts. Use argument-array subprocess invocation with `shell: false`.

Target commands: `config validate`, `config migrate [--dry-run]`, `assign KEY PATH`, `clear KEY`, `config apply [--dry-run]`, `status`, `doctor`, `--help` and `--version`. Configuration commands support a config path override; operational commands support bounded timeout and machine-readable output. Assign/clear edit desired state only and report `applyRequired: true`.

Cooperative CLI writers use an exclusive same-directory lock, read/hash conflict checks, temporary sibling file, durable write handling and atomic rename. Refuse symlink config targets and stale revisions. Never claim a filesystem-wide compare-and-swap guarantee against noncooperating external editors; require coordinated edits and detect changes where possible. Clean up only temporary files owned by the operation.

Dry-run and doctor are genuinely read-only: no lock files, temporary files, directory creation, imports, revision increments or writes. Apply dry-run compares against a read-only runtime snapshot and reports unavailable runtime honestly instead of fabricating a successful diff.

## Transactional apply and truthful completion

The service is the sole writer of applied state. It validates the entire request, stages all imports, and atomically publishes one whole applied snapshot after successful validation/import. Never approximate a transaction by issuing legacy per-workspace assignments in a loop. Failure on the last image must preserve the same last-good applied map as failure on the first.

Requests contain request ID, expected applied revision, desired hash and the complete mapping. Extend IPC with capability discovery, `applyConfig(requestJson: string): string` and `operationStatus(requestId: string): string`. An acceptance receipt is not completion. The CLI queries request-specific status until its deadline; there is no idle service polling and no dependence on an unverified signal-subscription race. Track runtime session/restart identity and bounded result retention. Unknown completion or timeout is not success and must not cause blind retries.

Unchanged configuration plus unchanged source content is idempotent; same-path changed bytes must be detected. Missing files, unsupported images, stale revision, busy state, failed imports, failed save and interrupted application preserve last-good applied state. Successful persistence is distinct from rendered pixels; report render verification as unknown without actual renderer evidence.

Once desired-state mode is active, direct legacy assign/clear/undo IPC should reject mutations with `use-config-cli` guidance instead of creating a competing authority. Keep native background IPC compatible; reload refreshes applied state, not unapplied desired JSON.

## Machine results

Versioned JSON envelope: `schemaVersion`, `ok`, `command`, `requestId`, `phase`, `code`, `message`, `data`. In machine mode stdout contains one JSON value; stderr contains diagnostics. Exit classes: 0 success, 2 usage/config validation, 3 runtime/dependency unavailable, 4 conflict/busy, 5 timeout/unknown completion, 6 import/save/runtime failure. Do not print success placeholders for unimplemented commands.

## Verification and delivery

Three remote slices plus one local gate, detailed in the [plan](../plans/2026-09-10-cli-first-configuration.md). Remote tests include actual spawned CLI output/exit codes, failure injection, concurrent writers, interleaved request IDs, restarts, same-path replacements, atomic rollback and read-only dry runs. Existing renderer/model regressions remain.

The local Omarchy agent qualifies real rendering and lifecycle behavior at the exact complete candidate SHA. Agents own code review, CI inspection, fixes and acceptance; there is no ceremonial user review step. Keep the shared pivot PR draft/unmerged until local qualification. Do not reopen or use abandoned UI PR #5 as the base.

## Primary references

- [Quickshell IPC handler](https://quickshell.org/docs/v0.3.0/types/Quickshell.Io/IpcHandler/) for signatures and return/signal boundaries. Verify actual installed capabilities locally.
- [JSON Schema object reference](https://json-schema.org/understanding-json-schema/reference/object) for structural validation and unknown-property handling.

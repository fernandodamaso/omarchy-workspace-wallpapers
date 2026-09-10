# Workspace Wallpapers for Omarchy

Native per-workspace static wallpapers with JSON-first configuration and a coding-agent CLI. No graphical settings page, image browser, file/folder picker, or wallpaper/theme double-click gesture.

> **Candidate, not a release:** the offline configuration commands, transactional `config apply`, `status`, and `doctor` are implemented on `feat/cli-first-configuration` in [PR #6](https://github.com/fernandodamaso/omarchy-workspace-wallpapers/pull/6). The candidate remains unmerged until [FDM-913](https://linear.app/fdamaso/issue/FDM-913) qualifies its exact SHA in a real Omarchy session. A GitHub commit does not update an installed plugin.

## Desired configuration

The human or agent owns `${XDG_CONFIG_HOME:-$HOME/.config}/omarchy/workspace-wallpapers/config.json`. Saving this file, using `assign`/`clear`, or migrating legacy state does not change running wallpapers. The CLI reads and validates desired JSON; the service receives a complete versioned request only on explicit apply. The service does not watch or rewrite desired JSON.

```json
{
  "version": 1,
  "assignments": {
    "id:2": "/home/user/Pictures/work.png",
    "name: Work 日本語": "/home/user/Pictures/focus.webp"
  }
}
```

Paths above are examples, not existing files. Missing matching mappings follow the current global Omarchy wallpaper. Workspace names retain spaces/Unicode exactly; ID lookup takes precedence over name lookup. Clearing an ID can reveal an existing name mapping rather than global fallback. Special/scratchpad workspaces are not configurable.

The [JSON Schema](schemas/config.schema.json) rejects unknown properties, invalid shapes, noncanonical IDs and unsupported paths. The CLI additionally rejects duplicate decoded JSON keys and checks readable image bytes, MIME signatures and static containers. It does not expand `$HOME`, `~`, shell syntax, or URLs inside JSON. Shell metacharacters in literal absolute filenames remain data.

## CLI setup

**Dependency: Node 22 or newer, both on the CLI's PATH and on the running shell service's PATH.** Live commands also require `omarchy-shell` and the matching enabled service. No npm packages, runtime network access or automatic dependency installation are required. Keep the candidate repository directory intact: the executable and service helper load sibling modules, model code and manifest.

From that persistent repository directory, inspect the installed interface:

```bash
node --version
./bin/workspace-wallpapers --help
./bin/workspace-wallpapers --version --json
```

Optional PATH registration: run `mkdir -p "$HOME/.local/bin"`, then `ln -s "$PWD/bin/workspace-wallpapers" "$HOME/.local/bin/workspace-wallpapers"`. This deliberately fails rather than overwriting an existing command. Ensure `$HOME/.local/bin` is already on PATH, or use the executable's absolute path. Do not copy only the executable away from its modules. Shell service dependency/PATH changes are explicit host setup, not an automatic CLI repair.

## Edit, preview, apply

For an existing installation without desired JSON, first preview migration with `./bin/workspace-wallpapers config migrate --dry-run --json`, then explicitly run `./bin/workspace-wallpapers config migrate --json`. Migration refuses an existing desired config, preserves legacy files, and never applies changes. Migrate before editing an existing installation so unrelated mappings are not omitted from the new whole-map configuration.

Run each step separately and inspect its result before continuing:

```bash
./bin/workspace-wallpapers assign 'id:2' '/absolute/path/to/work.png' --json
./bin/workspace-wallpapers config validate --json
./bin/workspace-wallpapers config apply --dry-run --json
./bin/workspace-wallpapers config apply --json
./bin/workspace-wallpapers status --json
```

Replace the example image path with a real readable file. `clear 'id:2'` removes only that desired mapping; it also requires explicit apply. Configuration commands and `doctor` accept `--config /absolute/path/to/desired.json`; use the same selected file throughout a change. `status` reports the running service's applied state, not a selected desired file, and does not accept `--config`.

Dry-run reports added, changed and removed keys against a read-only runtime snapshot. It creates no directories, locks, imports or state files and never delivers an apply request. An unavailable runtime is an error, not a fabricated preview. Ordinary desired edits report `applyRequired: true`.

Actual apply validates every source and submits one complete map, never a loop of partially successful legacy mutations. The service's private worker stages content-addressed images and atomically publishes one applied snapshot. Repeated unchanged configuration/content keeps the applied revision unchanged; changed bytes at the same source path are detected. A source/import/precommit-save failure retains the previous applied map. Unreferenced staged assets can remain after a failed attempt; there is no automatic data deletion or garbage collection.

The CLI waits for its own request/session completion. A receipt marked `accepted` is not completion. Final `applied` or `unchanged` confirms the persisted configuration, not rendered pixels; `renderVerification` remains `unknown` without separate compositor evidence.

## Status, diagnostics and recovery

```bash
./bin/workspace-wallpapers status --json
./bin/workspace-wallpapers doctor --json
```

Both commands are read-only. Status includes service readiness, busy state, revision, desired hash, last request/session identifiers, maps and storage paths. It reports the service's current in-memory snapshot; it does not silently reload files or apply desired edits. Doctor checks desired configuration/images, runtime compatibility/readiness and writer locks without changing the host.

Live commands accept `--timeout MS` from 1 through 120000, default 10000, for their shared IPC/completion deadline. The service has a separate 30-second active-apply watchdog and 5-second inspection watchdog. Increasing the CLI timeout does not extend the service watchdog. Neither introduces idle service polling.

On timeout, lost receipt, restart, or post-commit durability uncertainty, inspect status and establish worker liveness before another operation. **Never blindly repeat apply or assume rollback.** If persisted state must be re-inspected after recovery, the retained `omarchy-shell workspace-wallpapers reload` refreshes applied state only. Its invocation returning is not proof of completion: inspect status again and require readiness and the expected revision/hash. Reload never reads unapplied desired JSON.

Rollback is a targeted desired-state edit followed by validation, dry-run and explicit apply, not a direct edit of applied files. Reconcile with newer changes first. Reusing a source path does not restore old pixels if its bytes changed; retain verified assets when exact restoration matters.

## Storage, migration and concurrency

| Owner | Location |
| --- | --- |
| Human/agent desired JSON | `${XDG_CONFIG_HOME:-$HOME/.config}/omarchy/workspace-wallpapers/config.json` |
| Service-owned applied snapshot | `${XDG_STATE_HOME:-$HOME/.local/state}/omarchy/workspace-wallpapers/applied.json` |
| Content-addressed image copies | `${XDG_DATA_HOME:-$HOME/.local/share}/omarchy/workspace-wallpapers/images` |
| Preserved legacy metadata | `~/.config/omarchy/workspace-wallpapers/assignments.json`, `preferences.json`, `history.json` |

The old service used HOME rather than XDG_CONFIG_HOME: migration intentionally reads that original location even with a desired-config XDG override. It copies only validated mappings, not browser-only preferences. On startup without an applied snapshot, the service reads validated legacy assignments without rewriting them. The first explicit apply establishes the new applied snapshot, including an explicitly empty map. A malformed existing applied snapshot is not silently replaced with legacy data.

The running service's environment determines its state and image locations. Changing XDG variables in the CLI process does not reconfigure that service. Inspect returned `statePath`/`imageDirectory` and verify both environments when diagnosing nondefault paths.

No offline command creates imported images or runtime applied state. Desired overrides cannot use reserved legacy/applied filenames. Configuration symlink targets, including dangling links, are refused; source-image symlinks may point to readable regular files. Corrupted or unsafe existing owned images are rejected rather than silently overwritten.

Cooperative desired edits and private runtime writes use separate exclusive `.lock` files, content-revision checks, private temporary files, fsync and atomic publication. Creation/migration uses no-replace publication. New config/applied files use mode 0600; newly created storage directories request 0700. A stale revision or live lock is an error, not permission to overwrite another writer. Coordinate with external editors: hash checks cannot provide a filesystem-wide compare-and-swap against noncooperating writers.

A killed writer can leave a lock or private temporary file. Establish that no writer is still active before removing only abandoned lock/temp files. Never delete desired/applied configuration, legacy data or the image store to clear a lock. A durability error after replacement reports `committed: true` and an unknown outcome; inspect actual state before retrying.

Limits: 1 MiB UTF-8 config, 64 JSON nesting levels, 1024 mappings, canonical positive IDs through JavaScript's maximum safe integer, 128 MiB per source image, and 64 KiB serialized apply requests. Long maps/paths can reach the IPC limit before the config limit. Completed service receipts retain at most 64 operations and do not survive a service restart. MIME/container validation is not proof that Qt decoded or rendered an image.

## Machine output

With `--json`, stdout contains exactly one result with `schemaVersion`, `ok`, `command`, `requestId`, `phase`, `code`, `message`, and `data`. Failures also write diagnostics to stderr. Commands never prompt.

Exit classes: **0** command success; **2** usage/validation; **3** missing dependency/runtime; **4** conflict/busy; **5** timeout/unknown completion; **6** confirmed I/O/import/save/runtime failure. Unknown outcomes include `retrySafe: false`; inspect the phase as well as the process status. A successful desired edit is still not an applied configuration.

## Native runtime and compatibility cutover

The service replaces `omarchy.background` via `omarchy.clonedFrom`, preserves the stock native background/theme IPC bridge, and renders independently for each monitor's active workspace. Generation-tagged image loading, one-shot global fallback, same-path invalidation, scratchpad retention, and reversible disable/stock restore remain in the renderer.

Legacy `omarchy-shell workspace-wallpapers assign/clear/undo` signatures are retained, but mutations now return `use-config-cli` guidance through completion notifications. They do not mutate state, even before the first new apply. Update old scripts to the desired-edit/explicit-apply workflow; do not edit legacy JSON as a shortcut. Read-only status and applied-state reload remain available. Legacy preferences/history are readable metadata and are never rewritten by the new runtime.

The plugin does not uninstall Zenity or alter global Omarchy menus. Any custom settings menu entry copied from an older example is user-owned and is not automatically removed.

## Agent instructions and qualification

[Agent skill](skills/workspace-wallpapers/SKILL.md) · [customization and recovery recipes](docs/agent-configuration.md) · [repository instructions](AGENTS.md) · [approved design](docs/superpowers/specs/2026-09-10-cli-first-configuration-design.md) · [implementation plan](docs/superpowers/plans/2026-09-10-cli-first-configuration.md) · [local CLI/renderer gate](docs/cli-pivot-local-gate.md).

Keep PR #6 draft until the complete pivot passes its exact-SHA local gate. The default-branch command `omarchy plugin add https://github.com/fernandodamaso/omarchy-workspace-wallpapers.git --enable` installs main, not this candidate branch. Candidate installation and rollback belong to the local agent using the host's actual lifecycle tools. Do not replace a dirty checkout, delete images or edit packaged Omarchy files.

```bash
node --test tests/*.test.cjs
bash -n bin/import-image
git diff --check
git diff --check origin/main...HEAD
```

Tests cover spawned offline/live CLI behavior, real service-helper subprocesses, injected write failures, correlated completion, timeouts/conflicts, data retention, no-UI boundaries, and retained model/rendering contracts. Headless checks do not establish real QML loading, pixels, hotplug, lock/unlock or stock renderer restoration. Historical picker/focus instructions in earlier runbooks are superseded by the new local gate. Agents own review and acceptance; no ceremonial user code-review step is required.

PNG, JPEG and static WebP only. No video, playlists, scheduling, randomization, TUI, web UI, MCP server or runtime network daemon. See [compatibility](docs/compatibility.md) for the pinned native reference, not blanket certification for all Omarchy versions.

MIT. See [LICENSE](LICENSE) and [third-party notices](docs/third-party-notices.md).

# Workspace Wallpapers for Omarchy

Native per-workspace static wallpapers with JSON-first configuration and a coding-agent CLI. No graphical settings page, image browser, file/folder picker, or wallpaper/theme double-click gesture.

> **Development checkpoint:** the offline CLI and schema are implemented on `feat/cli-first-configuration`. Transactional live `config apply`, `status`, and `doctor` are the next slice (FDM-912). This partial pivot is not a release and remains unmerged until the complete candidate passes FDM-913 on a real Omarchy session.

## Desired configuration

The human or agent owns `${XDG_CONFIG_HOME:-$HOME/.config}/omarchy/workspace-wallpapers/config.json`. Saving this file, using `assign`/`clear`, or migrating legacy state does not change running wallpapers. The service does not read this new file at this checkpoint.

```json
{
  "version": 1,
  "assignments": {
    "id:2": "/home/user/Pictures/work.png",
    "name: Work 日本語": "/home/user/Pictures/focus.webp"
  }
}
```

Paths above are examples, not existing files. Missing mappings use the current global Omarchy wallpaper. Workspace names retain spaces/Unicode exactly; ID lookup takes precedence over name lookup. Special/scratchpad workspaces are not configurable.

The [JSON Schema](schemas/config.schema.json) rejects unknown properties, invalid shapes, noncanonical IDs and unsupported paths. The CLI additionally rejects duplicate decoded JSON keys and checks readable image bytes, MIME signatures and static containers. It does not expand `$HOME`, `~`, shell syntax, or URLs inside JSON. Shell metacharacters in literal absolute filenames remain data.

## Offline CLI

**Dependency: Node 22 or newer.** No npm packages, runtime network access or automatic dependency installation. After fetching the complete candidate, keep its repository directory intact: the executable loads sibling modules, schema/model code and manifest.

From that repository directory:

```bash
node --version
./bin/workspace-wallpapers --help
./bin/workspace-wallpapers config migrate --dry-run --json
./bin/workspace-wallpapers config migrate --json
./bin/workspace-wallpapers assign 'id:2' '/absolute/path/to/work.png' --json
./bin/workspace-wallpapers config validate --json
```

These are separate operations. Migration is only needed for an existing installation and refuses an existing desired config. All configuration commands accept `--config /absolute/path/to/desired.json`. `clear 'id:2'` removes that desired mapping only. Edit commands report `applyRequired: true`; no live apply is implemented yet.

Optional PATH registration: from the persistent repository directory, run `mkdir -p "$HOME/.local/bin"`, then `ln -s "$PWD/bin/workspace-wallpapers" "$HOME/.local/bin/workspace-wallpapers"`. This deliberately fails rather than overwriting an existing command. Ensure `$HOME/.local/bin` is already on PATH, or use the executable's absolute path. Do not copy only the executable away from its modules.

## Safety, state and concurrency

Legacy files remain at `~/.config/omarchy/workspace-wallpapers/assignments.json`, `preferences.json` and `history.json`. The old service used HOME rather than XDG_CONFIG_HOME: migration intentionally reads that original location, even when desired config uses an XDG override. It copies only validated mappings; it never deletes/rewrites legacy files or migrates browser-only preferences.

Images remain under `${XDG_DATA_HOME:-$HOME/.local/share}/omarchy/workspace-wallpapers/images`. No offline command creates imported images or runtime applied state. Desired overrides cannot use reserved legacy/applied filenames. Configuration symlink targets, including dangling links, are refused; image symlinks may point to readable regular files.

Cooperative edits use a same-directory exclusive `.lock`, content-revision checks, a private temporary file, fsync and atomic replacement. Creation/migration uses atomic no-replace publication. New config files use mode 0600; newly created config directories request 0700. A stale revision or live lock is an error, not permission to overwrite another writer. Coordinate with external editors: hash checks cannot provide a filesystem-wide compare-and-swap against noncooperating writers.

A killed writer can leave its lock or private temp file. The agent must establish that no writer is still active before removing only the abandoned lock/temp files. Never delete the desired config, legacy data or image store to clear a lock. A durability error after replacement reports `committed: true` and an unknown outcome; inspect the file before retrying.

Limits: 1 MiB UTF-8 config, 64 JSON nesting levels, 1024 mappings, canonical positive IDs through JavaScript's maximum safe integer, and 128 MiB per source image. MIME/container validation is not proof that Qt successfully decoded or rendered an image.

## Machine output

With `--json`, stdout contains exactly one result with `schemaVersion`, `ok`, `command`, `requestId`, `phase`, `code`, `message`, and `data`. Failures also write diagnostics to stderr. Exit classes: 0 success; 2 usage/validation; 3 missing dependency/runtime; 4 conflict/busy; 5 timeout/unknown completion; 6 I/O/import/save/runtime failure. Commands never prompt.

## Retained native runtime

The service still replaces `omarchy.background` via `omarchy.clonedFrom`, preserves the stock native background/theme IPC bridge, and renders independently for each monitor's active workspace. Generation-tagged image loading, one-shot global fallback, same-path invalidation, scratchpad retention, and reversible disable/stock restore remain intact.

Existing low-level `omarchy-shell workspace-wallpapers` IPC commands `assign`, `clear`, `undo`, `reload`, and `status` remain transitional. They are not the new offline CLI: legacy mutations change applied assignments and complete asynchronously via `operationFinished`. Delivery is not proof of persistence or rendered pixels. Direct legacy-file watching is not the new desired-config contract.

The plugin does not uninstall Zenity or alter global Omarchy menus. Any custom settings menu entry copied from an older example is user-owned and is not automatically removed.

## Qualification and release

[Approved design](docs/superpowers/specs/2026-09-10-cli-first-configuration-design.md) · [implementation plan](docs/superpowers/plans/2026-09-10-cli-first-configuration.md) · [local CLI/renderer gate](docs/cli-pivot-local-gate.md).

Keep PR #6 draft until the complete pivot passes its exact-SHA local gate. The default-branch command `omarchy plugin add https://github.com/fernandodamaso/omarchy-workspace-wallpapers.git --enable` installs main, not this in-development branch. Candidate installation and rollback belong to the local agent using the host's actual lifecycle tools. Do not replace a dirty checkout, delete images or edit packaged Omarchy files.

```bash
node --test tests/*.test.cjs
bash -n bin/import-image
git diff --check
git diff --check origin/main...HEAD
```

CI covers executable offline CLI behavior, injected write failures, conflicts, data retention, no-UI boundaries, and retained model/rendering contracts. Headless checks do not establish real QML loading, pixels, hotplug, lock/unlock or stock renderer restoration. Historical picker/focus instructions in earlier runbooks are superseded by the new local gate.

## Compatibility and license

PNG, JPEG and static WebP only. No video, playlists, scheduling, randomization, TUI, web UI, MCP server or runtime network daemon. See [compatibility](docs/compatibility.md) for the pinned native reference, not blanket certification for all Omarchy versions.

MIT. See [LICENSE](LICENSE) and [third-party notices](docs/third-party-notices.md).

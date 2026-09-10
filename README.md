# Workspace Wallpapers for Omarchy

Native per-workspace static wallpapers for Omarchy Quattro.

> **v0.1 static images only.** PNG, JPEG, and WebP are supported. Video, playlists, scheduling, and randomization are out of scope.

## Current implementation

- Replaces the stock `omarchy.background` service through `omarchy.clonedFrom` while keeping the stock `background` IPC methods.
- Resolves a wallpaper independently for every screen from that monitor's active Hyprland workspace.
- Uses workspace keys `id:<positive integer>` first and `name:<exact name>` as a fallback. Name spaces and Unicode are preserved; `special` and `special:*` are excluded.
- Retains the last normal workspace wallpaper while a `special:*` scratchpad is active.
- Uses generation-tagged asynchronous image loads so stale completions cannot overwrite a newer workspace request.
- Falls back once to the current global Omarchy background when an assigned image cannot decode, without deleting the assignment.
- Invalidates renderer generations on state reload and background refresh so same-path replacements can be decoded again.
- Imports assigned images into `${XDG_DATA_HOME:-$HOME/.local/share}/omarchy/workspace-wallpapers/images` after MIME validation.
- Persists assignments in `~/.config/omarchy/workspace-wallpapers/assignments.json`.
- Persists image-source preferences separately in `~/.config/omarchy/workspace-wallpapers/preferences.json` and recent/Undo history in `history.json`.
- Exposes `workspace-wallpapers` IPC operations: `assign`, `clear`, `undo`, `reload`, `status`, plus the `operationFinished(string)` completion signal.

## Install

For a normal install after the candidate is merged:

```bash
omarchy plugin add https://github.com/fernandodamaso/omarchy-workspace-wallpapers.git --enable
```

The original WP-01 qualification flow remains in [`docs/local-smoke.md`](docs/local-smoke.md). WP-03 compositor/reliability qualification is handed off in [`docs/wp03-local-gate.md`](docs/wp03-local-gate.md).

## IPC examples

Use a normal positive workspace id:

```bash
SOURCE="/absolute/path/to/wallpaper.png"
omarchy-shell workspace-wallpapers assign "id:2" "$SOURCE"
omarchy-shell workspace-wallpapers status
omarchy-shell workspace-wallpapers reload
omarchy-shell workspace-wallpapers clear "id:2"
```

Assignments are asynchronous because `assign` validates and imports the image first. `operationFinished` reports completion as a single JSON string.

## Native settings panel

Open the panel through the native shell summon path:

```bash
omarchy-shell shell summon io.github.fernandodamaso.workspace-wallpapers '{}'
```

The panel lists current normal workspaces and saved assignments whose workspaces are absent. Each row has a clickable 16:9 preview and a `Change…` action. Change opens a visual browser for the captured workspace with thumbnail previews, filename search, name or modification-time sorting, adjustable thumbnail size, a larger crop preview, and an explicit `Use this wallpaper` confirmation. Sources include the current theme, saved folders, recently used images, and all sources. The browser also accepts a dropped folder; a workspace row accepts a single dropped PNG, JPEG, or WebP image.

`Image sources…` manages remembered folders without requiring path entry. `Add folder…` and `Browse files…` use `zenity` graphical dialogs; `Open in Files` uses `xdg-open`. The full folder path is available as a tooltip, while the main list uses friendly folder names. `Enter image path…` remains available as a secondary fallback. Use `Use global background` to clear an assignment, and `Undo` to restore the previous explicit assignment or global fallback when the workspace has not changed again. The optional Style-menu entry is documented in [`examples/omarchy-menu.jsonc`](examples/omarchy-menu.jsonc); it is not installed automatically.

The graphical file and folder actions require `zenity`; the thumbnail browser itself does not. The panel owns no assignment or preference file writes directly: it calls the plugin service and waits for atomic save completion.

The panel owns no assignment file writes: it reads the plugin's scoped service and waits for `operationFinished` before showing a changed mapping. Picker cancellation, unsupported input, failed import, and failed save leave the previous assignment unchanged. Real picker focus, keyboard feel, compositor rendering, and error presentation remain part of the FDM-867 local gate.

## Headless checks

GitHub CI runs only checks that are meaningful without an Omarchy compositor session:

```bash
node --test tests/*.test.cjs
bash -n bin/import-image
git diff --check
```

The remote regressions cover workspace/key normalization, persistence sanitization, latest-request-wins ordering, one-shot decode fallback, retired-screen invalidation, scratchpad retention, and source-level renderer contracts. Passing CI still does **not** establish real Quickshell rendering, monitor hotplug behavior, focus/picker behavior, or theme-transition visuals; FDM-867 owns those local checks.

## Compatibility

The service bridge is pinned to the Omarchy `quattro` reference inspected on 2026-09-08. See [`docs/compatibility.md`](docs/compatibility.md) for the exact commit and compatibility boundary.

## License

MIT. See [`LICENSE`](LICENSE) and [`docs/third-party-notices.md`](docs/third-party-notices.md).

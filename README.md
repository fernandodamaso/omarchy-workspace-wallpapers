# Workspace Wallpapers for Omarchy

Native per-workspace static wallpapers for Omarchy Quattro, moving to JSON-first configuration and a coding-agent-friendly CLI.

> **CLI pivot checkpoint (FDM-910):** graphical configuration has been removed on this feature branch. The new `workspace-wallpapers` CLI, `config.json` schema, migration and explicit-apply engine are not implemented yet. This partial pivot is not a release and must not be merged or installed as the completed CLI product. The existing low-level IPC remains available during development.

PNG, JPEG and static WebP remain the supported image formats. Video, playlists, scheduling and randomization are outside this version's scope.

## Configuration direction

The approved workflow is **edit desired JSON → validate → dry-run → explicit apply → inspect structured status**. Saving the new desired configuration alone will not change wallpapers. The runtime will not rewrite that configuration, and agent commands will report request-specific completion rather than equating command delivery with success.

See the [approved design](docs/superpowers/specs/2026-09-10-cli-first-configuration-design.md) and [implementation plan](docs/superpowers/plans/2026-09-10-cli-first-configuration.md). These describe target interfaces, not commands available at this checkpoint.

There is no settings page, visual image browser, graphical file/folder picker, or wallpaper/theme configuration double-click gesture in this branch. `WorkspaceWallpaperPanel.qml` remains because it renders the desktop background; it is not a settings screen. No TUI, web UI or MCP server replaces the removed page.

## Retained runtime

- Replaces the stock `omarchy.background` service through `omarchy.clonedFrom`, preserving the stock `background` IPC methods.
- Resolves each screen's wallpaper from that monitor's active Hyprland workspace, preferring `id:<positive integer>` and then `name:<exact name>`.
- Preserves exact workspace names, including spaces and Unicode, and retains the last normal wallpaper while a `special:*` scratchpad is active.
- Uses generation-tagged asynchronous image loads so stale completions cannot replace a newer workspace request. An assigned image that cannot decode falls back once to the current global background without deleting the assignment.
- Invalidates renderer generations on state reload and native background refresh, including same-path replacements.
- Validates imported image MIME types and copies images into `${XDG_DATA_HOME:-$HOME/.local/share}/omarchy/workspace-wallpapers/images`.

The removal does not migrate, reset or delete `~/.config/omarchy/workspace-wallpapers/assignments.json`, `preferences.json`, `history.json`, or imported images. Their existing paths and service behavior remain unchanged in this first slice. Legacy file watching is not the future desired-config explicit-apply contract; do not use direct legacy-file edits as a substitute for that planned interface.

The plugin no longer invokes `zenity` or graphical wallpaper/theme selectors. It does not uninstall those applications or alter the global Omarchy menus. A custom menu entry copied from an older example is user-owned and is not automatically removed from host configuration.

## Existing low-level IPC (transitional)

With this service running in Omarchy, individual operations remain available:

```bash
omarchy-shell workspace-wallpapers assign "id:2" "/absolute/path/to/wallpaper.png"
omarchy-shell workspace-wallpapers status
omarchy-shell workspace-wallpapers reload
omarchy-shell workspace-wallpapers clear "id:2"
omarchy-shell workspace-wallpapers undo "id:2"
```

These are separate operations, not a batch script. Assignment imports and saves are asynchronous. Observe the `operationFinished` JSON result before issuing another mutation; the invocation returning is not proof of a successful save or rendered pixels. Undo is only available for its eligible workspace/revision. The planned CLI will handle correlated completion and timeouts explicitly.

## Installation and qualification

The default-branch installation command below installs whichever code is on `main`; it does **not** select the in-development CLI pivot:

```bash
omarchy plugin add https://github.com/fernandodamaso/omarchy-workspace-wallpapers.git --enable
```

The complete pivot must pass the [local CLI/renderer gate](docs/cli-pivot-local-gate.md) before integration. Candidate installation and rollback belong to the local agent using the exact handoff SHA and the actual host's plugin lifecycle tools. Do not replace a dirty checkout, delete user images, or edit packaged Omarchy files.

The future CLI requires Node 22 or newer; it is a separate, explicit dependency to verify and document when that executable is delivered. This UI-removal slice adds no runtime dependency.

## Headless checks

```bash
node --test tests/*.test.cjs
bash -n bin/import-image
git diff --check
git diff --check origin/main...HEAD
```

CI uses Node 22. Tests cover the no-UI registration boundary, retained service contracts, workspace/key normalization, persistence sanitization, render request ordering, decode fallback, screen retirement and scratchpad retention. Source contracts are not proof that QML loads or renders in a compositor.

`docs/local-smoke.md` and `docs/wp03-local-gate.md` retain historical service/UI qualification instructions. Their picker/focus requirements do not apply to this pivot; the new local gate is authoritative. Earlier UI implementation plans are historical, not authorization to restore graphical configuration.

## Compatibility and license

The native bridge remains pinned to the Omarchy `quattro` reference inspected on 2026-09-08. See [compatibility](docs/compatibility.md) for the exact reference and limitations; this is not certification for every Omarchy version.

MIT. See [LICENSE](LICENSE) and [third-party notices](docs/third-party-notices.md).

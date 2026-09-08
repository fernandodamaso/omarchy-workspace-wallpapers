# Workspace Wallpapers for Omarchy

Native per-workspace static wallpapers for Omarchy Quattro.

> **WP-01 / v0.1 only.** This baseline supports PNG, JPEG, and WebP. It does not implement video, playlists, scheduling, randomization, or any WP-02/WP-03 behavior.

## What WP-01 provides

- Replaces the stock `omarchy.background` service through `omarchy.clonedFrom` while keeping the stock `background` IPC methods.
- Resolves a wallpaper independently for every screen from that monitor's active Hyprland workspace.
- Uses workspace keys `id:<positive integer>` first and `name:<exact name>` as a fallback. Name spaces and Unicode are preserved; `special` and `special:*` are excluded.
- Imports assigned images into `${XDG_DATA_HOME:-$HOME/.local/share}/omarchy/workspace-wallpapers/images` after MIME validation.
- Persists assignments in `~/.config/omarchy/workspace-wallpapers/assignments.json`.
- Exposes `workspace-wallpapers` IPC operations: `assign`, `clear`, `reload`, `status`, plus the `operationFinished(string)` completion signal.

## Install

For a normal install after this branch is merged:

```bash
omarchy plugin add https://github.com/fernandodamaso/omarchy-workspace-wallpapers.git --enable
```

For the exact Draft-PR local qualification flow, use [`docs/local-smoke.md`](docs/local-smoke.md). It installs the focused FDM-863 branch without depending on `main`.

## IPC examples

Use a normal positive workspace id:

```bash
SOURCE="/absolute/path/to/wallpaper.png"
omarchy-shell workspace-wallpapers assign "id:2" "$SOURCE"
omarchy-shell workspace-wallpapers status
omarchy-shell workspace-wallpapers reload
omarchy-shell workspace-wallpapers clear "id:2"
```

Assignments are asynchronous because `assign` validates and imports the image first. `operationFinished` reports completion as a single JSON string. See the second-terminal listener command in `docs/local-smoke.md`.

## Headless checks

GitHub CI runs only checks that do not require an Omarchy compositor session:

```bash
node --test tests/*.test.cjs
bash -n bin/import-image
git diff --check
```

Passing CI does **not** prove Quickshell/Hyprland rendering, workspace switching, multi-monitor behavior, picker focus, lock/unlock behavior, or stock renderer restoration. Those remain FDM-864 local gates.

## Compatibility

The WP-01 bridge is pinned to the Omarchy `quattro` reference inspected for FDM-863. See [`docs/compatibility.md`](docs/compatibility.md) for the exact commit and known limitations.

## License

MIT. See [`LICENSE`](LICENSE) and [`docs/third-party-notices.md`](docs/third-party-notices.md).

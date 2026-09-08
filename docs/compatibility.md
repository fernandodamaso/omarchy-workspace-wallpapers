# Compatibility

## Reference snapshot

FDM-863 was implemented against Omarchy `quattro` commit:

```text
5b91db503c904bbfc5f34bdaaa9c708814958f3d
```

Reference inspected on 2026-09-08:

- `shell/plugins/background/Background.qml`
- `shell/plugins/background/manifest.json`
- `manual/32-shell-plugins.md`
- `bin/omarchy-shell`

The plugin manifest uses schema version 1, id `io.github.fernandodamaso.workspace-wallpapers`, kind `service`, and `omarchy.clonedFrom: "omarchy.background"`.

## Native background compatibility surface

`NativeBackgroundBridge.qml` keeps the current stock `background` IPC target and these exact method signatures:

```text
refresh(): void
set(path: string): void
setInstant(path: string): void
transition(fromPath: string, path: string): void
themeTransition(fromPath: string, path: string, finalPath: string, colorsB64: string, shellB64: string): void
```

`themeTransition` applies the supplied Omarchy color and shell payloads before scheduling a style refresh. The v0.1 renderer intentionally applies wallpaper changes immediately instead of reproducing the stock reveal animation.

## Workspace model

Normal workspace lookup order is:

1. `id:<positive integer>`
2. `name:<exact name>`

Workspace names are not trimmed or ASCII-normalized; spaces and Unicode remain part of the key. A workspace named exactly `special` or beginning with `special:` is excluded even if Hyprland exposes an id for it.

Each Quickshell screen resolves its own Hyprland monitor with `Hyprland.monitorFor(screen)` and reads that monitor's `activeWorkspace`. This mirrors the current stock background's per-output Hyprland lookup pattern, but real multi-monitor behavior is still a local gate.

## Static-only boundary

WP-01 accepts only files whose imported MIME type is one of:

- `image/png`
- `image/jpeg`
- `image/webp`

The QML renderer uses `Image` with `Image.PreserveAspectCrop`. No video/media renderer is included in v0.1.

This also means the stock global-background fallback must resolve to PNG, JPEG, or WebP for WP-01 to display it. A global video background is unsupported and may render as the panel's black fallback until a static background is selected or the plugin is disabled.

## Persistence

Assignments are stored at:

```text
~/.config/omarchy/workspace-wallpapers/assignments.json
```

Imported files are stored at:

```text
${XDG_DATA_HOME:-$HOME/.local/share}/omarchy/workspace-wallpapers/images/<sha256>.<ext>
```

The import helper validates MIME before copying and uses a content-addressed filename. The state parser discards invalid workspace keys and unsupported image paths rather than loading them.

## What GitHub CI does not establish

Headless CI validates JavaScript model behavior, repository contracts, Bash syntax, and whitespace only. It does not establish:

- real Quickshell/Hyprland rendering;
- workspace switching behavior;
- monitor behavior;
- picker focus;
- lock/unlock behavior;
- stock renderer restoration after disabling the clone.

Those checks are explicitly delegated to FDM-864 in `docs/local-smoke.md`.

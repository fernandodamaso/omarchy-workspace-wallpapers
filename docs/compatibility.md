# Compatibility

## Reference snapshot

FDM-863 and the FDM-866 source review use Omarchy `quattro` commit:

```text
5b91db503c904bbfc5f34bdaaa9c708814958f3d
```

Reference inspected on 2026-09-08:

- `shell/plugins/background/Background.qml`
- `shell/plugins/background/manifest.json`
- `manual/32-shell-plugins.md`
- `docs/omarchy-shell.md`
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

The stock service remains screen-variant based and advances `backgroundVersion` when a background transition is accepted. FDM-866 adds its own event-driven `renderRevision` because a reliability refresh must invalidate a same-path image even when the logical path has not changed.

`themeTransition` keeps accepting the native colors/shell payload. The v0.1 clone applies those theme payloads independently from per-workspace image decoding so a broken assigned wallpaper cannot block shell recoloring. The clone intentionally does not reproduce the stock reveal animation.

## Workspace model

Normal workspace lookup order is:

1. `id:<positive integer>`
2. `name:<exact name>`

Workspace names are not trimmed or ASCII-normalized; spaces and Unicode remain part of the key. A workspace named exactly `special` or beginning with `special:` is excluded even if Hyprland exposes an id for it.

Each screen resolves its Hyprland monitor with `Hyprland.monitorFor(screen)` and reads that monitor's `activeWorkspace`. FDM-866 also retains the last normal workspace per screen while a `special:*` workspace is active. Real monitor movement/hotplug behavior remains a local FDM-867 gate.

## Reliability model

Each screen owns a render generation. A new workspace/background request increments that generation, and an asynchronous completion must match both the current generation and requested path before it can become displayed. Destroying a screen invalidates its pending generation.

An assigned image decode failure tries the current global Omarchy background once. If that fallback also fails, the panel clears instead of entering a retry loop. The assignment model is not mutated by decode failure.

Renderer URLs are generation-tagged and use `cache: false`; state/background reloads increment `renderRevision`, allowing same-path replacements to be decoded again without polling.

## Static-only boundary

v0.1 accepts only files whose imported MIME type is one of:

- `image/png`
- `image/jpeg`
- `image/webp`

The QML renderer uses `Image` with `Image.PreserveAspectCrop`. No video/media renderer is included in v0.1.

This also means the stock global-background fallback must resolve to PNG, JPEG, or WebP. A global video background is unsupported and may render as the panel's black fallback until a static background is selected or the plugin is disabled.

## Persistence

Assignments are stored at:

```text
~/.config/omarchy/workspace-wallpapers/assignments.json
```

Imported files are stored at:

```text
${XDG_DATA_HOME:-$HOME/.local/share}/omarchy/workspace-wallpapers/images/<sha256>.<ext>
```

The import helper validates MIME before copying and uses a content-addressed filename. The state parser discards invalid workspace keys and unsupported image paths rather than loading them. Missing/corrupt state is handled in memory and is not rewritten merely because loading failed.

## What GitHub CI does not establish

Headless CI validates JavaScript model behavior, source contracts, Bash syntax, and whitespace. It does not establish real Quickshell/Hyprland rendering, workspace movement, monitor hotplug/remap behavior, theme-transition visuals, picker focus, or lock/unlock behavior.

WP-01's original qualification is recorded in `docs/local-smoke.md`. WP-03 compositor/reliability qualification is delegated to FDM-867 via `docs/wp03-local-gate.md`.

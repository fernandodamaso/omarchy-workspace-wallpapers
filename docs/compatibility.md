# Compatibility

## v0.1 qualification evidence

The CLI/runtime candidate `4df6f3204c70a5daa58d0664dbac1b6cbce0f667` passed the broad FDM-913 local qualification on 2026-09-11. The release-preparation SHA `0819599e3fe1c315deb645258783b06fee1e7ec7` then passed the final FDM-869 real-Omarchy release smoke on the same day. Changes after that smoke in the v0.1 publication path are documentation, agent-instruction, or merge-only changes; the runtime QML/CLI/model implementation is unchanged.

| Component | Qualified version/evidence |
| --- | --- |
| Omarchy | `4.0.3-1` |
| Quickshell | `0.3.1` |
| Qt / QML runtime | `6.11.2` |
| Hyprland | `0.56.2` |
| Node | `v26.7.0` locally; repository requirement remains Node 22+ |
| Displays | DP-1 + HDMI-A-1, both 1920×1080 scale 1 |

The remote candidate CI was also run on Node `22.23.2` and passed 112 tests with zero failures/skips plus import-helper syntax and whitespace checks. These records establish evidence for the versions above; they are not blanket certification for arbitrary future Omarchy, Quickshell, Hyprland, Qt, or Node revisions.

FDM-913 exercised desired configuration, migration, validation, dry-run, explicit apply, status/doctor, concurrency/failure paths, real rendering, rapid workspace switching, a Unicode named workspace, absent/global fallback, id-over-name precedence, workspace movement between monitors, same-path image replacement, decode-failure fallback, native background/theme refresh, and disable/re-enable stock-renderer restoration.

FDM-869 closed the final release gaps on `0819599e3fe1c315deb645258783b06fee1e7ec7`: assigned and global workspaces, rapid switching, shell restart, lock/unlock, disable/re-enable stock restoration, update behavior, remove/reinstall recovery, data retention, and restoration of the pre-test desired configuration all passed. Scratchpad and monitor hotplug remain outside the recorded physical-test evidence.

## Reference snapshot

FDM-863 and the FDM-866 source review used Omarchy `quattro` commit:

```text
5b91db503c904bbfc5f34bdaaa9c708814958f3d
```

Reference inspected on 2026-09-08:

- `shell/plugins/background/Background.qml`
- `shell/plugins/background/manifest.json`
- `manual/32-shell-plugins.md`
- `docs/omarchy-shell.md`
- `bin/omarchy-shell`

The v0.1 manifest uses schema version 1, id `io.github.fernandodamaso.workspace-wallpapers`, kind `service`, and `omarchy.clonedFrom: "omarchy.background"`. Graphical configuration/panel registration was removed by the approved CLI/JSON-first pivot; `WorkspaceWallpaperPanel.qml` remains only because it is the native per-monitor wallpaper renderer.

## Native background compatibility surface

`NativeBackgroundBridge.qml` keeps the current stock `background` IPC target and these exact method signatures:

```text
refresh(): void
set(path: string): void
setInstant(path: string): void
transition(fromPath: string, path: string): void
themeTransition(fromPath: string, path: string, finalPath: string, colorsB64: string, shellB64: string): void
```

The stock service remains screen-variant based and advances `backgroundVersion` when a background transition is accepted. The plugin adds its own event-driven `renderRevision` because a reliability refresh must invalidate a same-path image even when the logical path has not changed.

`themeTransition` keeps accepting the native colors/shell payload. The v0.1 clone applies those theme payloads independently from per-workspace image decoding so a broken assigned wallpaper cannot block shell recoloring. The clone intentionally does not reproduce the stock reveal animation.

## Workspace model

Normal workspace lookup order is:

1. `id:<positive integer>`
2. `name:<exact name>`

Workspace names are not trimmed or ASCII-normalized; spaces and Unicode remain part of the key. A workspace named exactly `special` or beginning with `special:` is excluded even if Hyprland exposes an id for it.

Each screen resolves its Hyprland monitor with `Hyprland.monitorFor(screen)` and reads that monitor's `activeWorkspace`. The renderer retains the last normal workspace per screen while a `special:*` workspace is active. FDM-913 qualified workspace movement between the two available monitors; monitor hotplug itself remains outside that evidence.

## Reliability model

Each screen owns a render generation. A new workspace/background request increments that generation, and an asynchronous completion must match both the current generation and requested path before it can become displayed. Destroying a screen invalidates its pending generation.

An assigned image decode failure tries the current global Omarchy background once. If that fallback also fails, the panel clears instead of entering a retry loop. The assignment model is not mutated by decode failure.

Renderer URLs are generation-tagged and use `cache: false`; state/background reloads increment `renderRevision`, allowing same-path replacements to be decoded again without polling.

The CLI/runtime apply model is separate from pixels: successful `applied`/`unchanged` completion establishes persisted state, not rendered verification. Timeout/restart/unknown completion is reported explicitly and must be reconciled with status rather than blindly retried.

## Static-only boundary

v0.1 accepts only static files whose imported MIME type is one of:

- `image/png`
- `image/jpeg`
- `image/webp`

The QML renderer uses `Image` with `Image.PreserveAspectCrop`. No video/media renderer, playlist, scheduler, randomizer, online catalog, or external wallpaper daemon is included in v0.1.

This also means the stock global-background fallback must resolve to PNG, JPEG, or static WebP. A global video background is unsupported and may render as the panel's black fallback until a static background is selected or the plugin is disabled.

## Persistence and data retention

Desired configuration is human/agent-owned at:

```text
${XDG_CONFIG_HOME:-$HOME/.config}/omarchy/workspace-wallpapers/config.json
```

The service-owned applied snapshot is stored at:

```text
${XDG_STATE_HOME:-$HOME/.local/state}/omarchy/workspace-wallpapers/applied.json
```

Content-addressed imported files are stored at:

```text
${XDG_DATA_HOME:-$HOME/.local/share}/omarchy/workspace-wallpapers/images/<sha256>.<ext>
```

Legacy metadata remains under:

```text
~/.config/omarchy/workspace-wallpapers/assignments.json
~/.config/omarchy/workspace-wallpapers/preferences.json
~/.config/omarchy/workspace-wallpapers/history.json
```

Migration creates desired configuration only when explicitly requested and never overwrites an existing desired file. The first explicit apply establishes the applied snapshot; invalid new input preserves last-good state. Runtime writes use private locks/temp files and atomic publication. Cleanup removes only owned temporary/lock files. There is no automatic user-data deletion or image garbage collection.

Disabling/re-enabling the plugin leaves all of these files intact. Native Omarchy plugin removal deletes or unlinks the plugin checkout, not these external config/state/data locations, so mappings/assets remain available for reinstall/recovery unless the user explicitly deletes them separately.

## Release and recovery boundary

The immediate reversible recovery is:

```bash
omarchy plugin disable io.github.fernandodamaso.workspace-wallpapers
```

Disabling restores the stock `omarchy.background` owner without deleting saved state. Re-enabling restores the plugin against retained desired/applied state and managed images.

The locally qualified runtime baseline is `4df6f3204c70a5daa58d0664dbac1b6cbce0f667`, and the final release smoke passed on documentation-preparation SHA `0819599e3fe1c315deb645258783b06fee1e7ec7`. A code rollback may pin the plugin checkout to the qualified runtime revision, validate it, and re-enable it while preserving desired/applied/legacy state and images.

Any future change to runtime QML, CLI/model behavior, service ownership, or rendering must requalify the affected local scenario before release. Documentation-only changes do not require repeating the compositor qualification.

## What GitHub CI does not establish

Headless CI validates JavaScript/CLI behavior, subprocess/runtime-helper contracts, source/model behavior, Bash syntax, retention/no-UI boundaries, and whitespace. It does not establish real Quickshell/Hyprland pixels, monitor hotplug/remap behavior, lock/unlock behavior, or stock renderer restoration on a new runtime revision.

WP-01's original qualification is recorded in `docs/local-smoke.md`. WP-03 compositor/reliability qualification is recorded through FDM-867/FDM-913 evidence, with the final publication smoke recorded in FDM-869. Historical graphical picker/panel checks are superseded by the approved CLI/JSON-first plan.

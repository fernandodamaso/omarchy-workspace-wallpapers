# FDM-867 local handoff — WP-03 reliability

This document hands the remote FDM-866 candidate to the combined FDM-867 Omarchy gate. It does not claim compositor-level success.

## Candidate

- Repository: `fernandodamaso/omarchy-workspace-wallpapers`
- WP-03 branch: `feat/fdm-866-wp03-reliability`
- Draft PR: `#2`
- Base: the Gate-1-qualified WP-01 `main`

FDM-867 is intentionally a combined WP-02/WP-03 pass. Combine this candidate with the eventual FDM-865 settings-panel candidate before closing the local gate.

Record the exact tested commit plus Omarchy, Quickshell, Hyprland, GPU, and monitor details before testing.

## WP-03 scenarios

1. **Rapid switching:** exercise A → B → C workspace changes while images are still loading. C must remain the final wallpaper; an older completion must never overwrite it.
2. **Monitors:** focus another display without changing workspaces, move a workspace between displays, then remove/reconnect a display if the hardware allows it. Focus alone must not change wallpaper; the wallpaper must follow the workspace; removed surfaces must not reappear stale.
3. **Named and special workspaces:** verify exact names containing spaces and Unicode. Open a `special:*` scratchpad over a normal workspace and confirm the underlying normal workspace wallpaper remains visible.
4. **Theme and global fallback:** switch themes while visible workspaces have assignments, then with a deliberately broken assigned image. Shell colors must still apply. Change the global fallback and confirm assigned workspaces remain assigned while unassigned workspaces update.
5. **Same-path reload:** replace a static image without changing its path, trigger the relevant `background refresh` or `workspace-wallpapers reload`, and confirm the new bytes render instead of a cached image.
6. **Recovery:** test a missing assigned asset and malformed assignment JSON. The service must fall back or sanitize in memory without deleting unrelated assignments, repeatedly rewriting state, or spawning a recurring recovery process.
7. **Restart/idle:** restart the Omarchy shell and observe an idle period. Persisted mappings must return and the service must stay quiet when nothing changes.

## Remote behavior already covered

Headless regressions establish the pure/model side of latest-request-wins ordering, one-shot decode fallback, removed-screen generation invalidation, exact workspace classification, and scratchpad retention. Source contracts also require generation-tagged per-screen loads, cache bypass on reload, event-driven render revisions, and the native theme payload call path.

These checks intentionally do not fake Quickshell, Hyprland, monitor hotplug, or Wayland surface behavior. Any failure demonstrated here should be fixed narrowly on the candidate branch and rerun through both the affected local scenario and GitHub CI.

## FDM-867 local run — 2026-09-09

This run used the combined WP-02/WP-03 candidate with the following environment:

- Candidate: `0229bf8b5da2dca247c4acf6fe65a4f18ccf3bca` on `fix/fdm867-fileview-save-retry` (PR #4)
- Base: `d741808` on `main` (merged PR #3)
- Omarchy: `4.0.3-1`
- Quickshell: `0.3.1`
- Hyprland: `0.56.2`, commit `efb50993780079460b0cbed1363e2166a2de1d9f`
- Monitors at cleanup: `DP-1` ASUS VP249 at `(0,0)`, workspace `1`; `HDMI-A-1` LG E2350 at `(1920,0)`, workspace `2`
- Plugin: enabled, cloned from `omarchy.background`; `omarchy plugin validate` passed

| Check | Result | Evidence |
| --- | --- | --- |
| Native panel rows and rendering | PASS | Live rows 1–3 plus saved-absent row 4 rendered; panel status/error states were visible |
| Escape, keyboard navigation, picker cancellation | PASS | Escape dismissed the panel; keyboard reached Choose; picker cancellation returned `Selection cancelled` without mutation |
| Direct valid assignment | PASS | JPEG import produced a managed path and `Wallpaper saved` |
| Invalid and unsupported input | PASS | Unsupported input emitted `unsupported-image-path` and preserved the prior mapping |
| Save failure preservation and retry | PASS | Read-only state directory preserved the mapping; retry succeeded on `0229bf8` without an external reload |
| Captured target | PASS | Picker was open while HDMI-A-1 changed from workspace 2 to 3; only `id:2` changed after selection |
| `operationFinished` IPC | PASS | `assign`, `reload`, `status`, and `clear` each emitted one successful JSON completion |
| Named and special workspace keys | PASS | `name:Design Ω` persisted; `name:special`, `name:special:scratchpad`, and `id:0` were rejected |
| Reset and global fallback state | PASS | Clearing `id:4` removed only that assignment and retained the global fallback path |
| Missing asset and malformed state recovery | PASS | Missing `id:4` asset visibly showed the configured global fallback without removing its mapping; the original image returned after restoration; malformed JSON sanitized to empty in memory with no repeated recovery events |
| Idle behavior | PASS | 16-second idle listener window emitted zero operation events |
| Restart persistence | PASS | Shell restart during candidate validation returned persisted mappings |
| Workspace movement and monitor-following visuals | PARTIAL | Workspace/monitor dispatch and cleanup completed; full wallpaper visual assertion was deferred while a user Steam game was active |
| Rapid A → B → C visual switching | NOT RUN | Deferred to avoid stealing focus from the active user application; model/CI coverage remains green |
| Same-path replacement and reload | PASS | Replaced `id:4` image bytes in place; the wallpaper visibly changed after reload while its assignment path stayed unchanged, then the original bytes were restored |
| Theme/global visual transition | NOT RUN | Deferred to avoid changing the user's active desktop theme |
| Physical monitor unplug/reconnect | SKIPPED | Deliberately excluded per execution scope |

The original assignment file was restored byte-for-byte after testing. State and backup both hash to `1bd0069eeccf37ecfaaa1a4d5fb2ccc34ff1541dcbe1e8f44c10a63b997d9aea`.

The retry failure found during this run is fixed by reloading `FileView` after a failed atomic save. The fix is pushed as PR #4; it is mergeable with passing CI but remains open pending review.

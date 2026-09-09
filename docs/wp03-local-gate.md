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

# LOCAL GATE: complete CLI pivot and retained renderer

Owner: [FDM-913](https://linear.app/fdamaso/issue/FDM-913), a coding agent in the actual Omarchy session. Parent: [FDM-909](https://linear.app/fdamaso/issue/FDM-909).

This runbook is the authoritative pivot gate, replacing settings/browser/picker-focus qualification. `docs/local-smoke.md` and `docs/wp03-local-gate.md` remain historical. Headless checks do not prove QML loading or Quickshell/Hyprland rendering.

## Start only with the complete candidate

Require completed remote issues FDM-910, FDM-911 and FDM-912, the shared draft PR URL, its exact head SHA and inspected successful CI logs. The first UI-removal checkpoint is not the completed CLI product and is not ready for this gate.

Use an isolated worktree or equivalent safe candidate checkout. Record the installed plugin location and current revision, protect dirty/local work, and use the actual host's documented plugin install/disable/restore procedures. Do not hard-reset personal work, edit packaged Omarchy files or delete images. Capture commands and outputs; never invent successful installation evidence.

## Five qualification steps

1. **Prepare and record.** Record exact candidate SHA, Omarchy/Quickshell/Qt/Hyprland/Node versions, monitor layout and scale. Back up desired/applied/legacy configuration and record image hashes/inventory. Verify service-only registration: no settings page, image browser, graphical folder/file picker or configuration double-click gesture. Check that the wallpaper renderer still loads.
2. **Exercise the agent workflow.** Run help, read-only doctor, strict validation and explicit non-overwriting migration. Edit desired JSON, validate, inspect a side-effect-free dry run, perform explicit apply, then inspect structured status. Verify that edits, validation and dry-run do not change wallpapers or write applied state. Verify default and nondefault XDG paths, exact names and path metacharacters. Retain all legacy data and images.
3. **Exercise failure and concurrency.** Use disposable test data/profiles for malformed/duplicate JSON, invalid images, unavailable IPC, stale revisions, concurrent requests, timeouts, restart and save/import failures. Confirm no partial map is published, last-good state survives, same-path changed bytes are noticed, and repeated unchanged apply is a no-op. Record stdout/stderr/exit codes. Do not chmod or corrupt real user configuration to simulate failures; timeouts mean unknown completion, not permission to blindly retry.
4. **Qualify actual rendering and lifecycle.** Verify Quickshell/Hyprland rendering, rapid workspace switching, named/absent workspaces, ID precedence, scratchpad retention, monitor behavior including moved workspaces and available monitor hotplug scenarios, global/theme fallback, decode failure, same-path refresh, lock/unlock and native background IPC. Test disable/re-enable and stock renderer restoration without deleting data. Configuration applied is not proof of rendered pixels; record observable evidence separately.
5. **Fix and integrate on evidence.** Fix only reproduced candidate defects, push narrow fixes to the shared branch, rerun affected remote checks and local scenarios at the new head. Record pass/fail/not-tested cases and reasons, final SHA, logs and actual observations. Required failures keep the gate open. Once the final candidate and CI pass, the agent may integrate through the repository's normal merge workflow and complete the gate/parent. No ceremonial user code-review or acceptance step.

## Handoff and recovery record

The remote handoff must supply actual PR/head/CI links, not placeholders. The local evidence must supply actual installed paths, previous revision and backup locations before mutations. Restore tested personal settings using the verified backups and service lifecycle; never restore by clearing the image store. Any unavailable physical/session action is recorded rather than silently certified.

Future CLI command names are documented in the approved design; run this gate only once those commands are implemented. The existing low-level `omarchy-shell workspace-wallpapers status` is useful during preparation but is not a substitute for validating the new agent CLI.

Release preparation is next: [FDM-868](https://linear.app/fdamaso/issue/FDM-868), then the short final exact-SHA smoke FDM-869 and publication FDM-874. This gate does not publish a release.

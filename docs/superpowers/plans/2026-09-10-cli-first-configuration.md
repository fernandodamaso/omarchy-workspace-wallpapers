# CLI/JSON-first pivot implementation plan

Approved direction: [design](../specs/2026-09-10-cli-first-configuration-design.md). Parent outcome: [FDM-909](https://linear.app/fdamaso/issue/FDM-909).

## Execution contract

Use shared branch `feat/cli-first-configuration`, initially based on verified main `530129c99f8c94bc986d3d165baab5257423d1de`. Preserve newer unrelated commits when rebasing; do not reuse abandoned UI branch/PR #5. Keep one shared draft PR and independently evidenced commits per remote slice. Do not merge the partial pivot to main.

All routine implementation, tests, review, CI-log inspection and fixes belong to the remote agent. The local agent consumes the complete exact-SHA candidate rather than rebuilding it. No ceremonial user review or acceptance gate.

## 1. FDM-910: remove graphical configuration

[Issue](https://linear.app/fdamaso/issue/FDM-910).

Delete `Settings.qml`, `WallpaperBrowser.qml`, `components/PickerController.qml`, `components/WorkspaceRow.qml`, and `examples/omarchy-menu.jsonc`. Remove manifest panel kind/entrypoint. Remove the two configuration TapHandlers from `WorkspaceWallpaperPanel.qml`, retaining all render logic. Remove unreachable picker/theme-switcher methods, state and processes from `WorkspaceWallpapers.qml`.

Retain existing IPC, native bridge, preferences/history persistence, importer, model and renderer behavior. Do not migrate or delete any user data. Keep old pure-model checks even where their UI helpers are no longer used; do not mix model cleanup into removal.

Add failing `tests/cli-boundaries.test.cjs` checks first, inspect expected failures, then remove UI. Replace retired UI assertions in `tests/contracts.test.cjs` with no-UI/direct-IPC and retained-state checks. Update README truthfully and add this design/plan plus `docs/cli-pivot-local-gate.md`.

Baseline: fresh Node 22 CI at main SHA, 40 passing tests, import-helper syntax and both whitespace checks. Red characterization commit `836576b41fb579680ab781072a20daf590fcc0e6`: 45 tests, 41 pass and four expected no-UI failures. Do not equate either result with QML runtime validation.

Review the entire diff and verify unchanged bridge/model/importer blobs. Run the full suite and record exact green commit/CI evidence in the issue. Complete this remote slice on evidence; next is FDM-911.

## 2. FDM-911: desired config and offline CLI

[Issue](https://linear.app/fdamaso/issue/FDM-911), blocked by FDM-910.

Create `bin/workspace-wallpapers`, `cli/config.cjs`, `cli/result.cjs`, `schemas/config.schema.json`, `examples/config.json`, `tests/config.test.cjs` and `tests/cli.test.cjs`. Keep interfaces small and isolate filesystem/subprocess boundaries for tests. Node 22+ is an explicit runtime dependency, not an assumed Omarchy capability.

Implement strict versioned desired JSON, schema parity, validation, migration, assign/clear edits, help and version. No live apply or IPC calls in this slice. Reject duplicate properties, bad IDs/paths/types/versions, special workspaces and unknown properties. Preserve Unicode and treat shell metacharacters as data.

Tests must cover missing/wrong-MIME images, malformed/duplicate JSON, prototype-like properties, symlink targets, existing-config migration, permission failures, concurrent cooperative CLI writers and external-edit conflicts. Exercise spawned CLI stdout/stderr/exit codes. Dry-run must create no files, directories, locks or imports. Preserve legacy bytes and image inventory. Never overwrite desired config during migration.

Inspect the final diff and exact-SHA CI logs, fix remotely and complete on evidence. Next is FDM-912; leave unimplemented apply absent rather than returning a success stub.

## 3. FDM-912: transactional apply and agent workflow

[Issue](https://linear.app/fdamaso/issue/FDM-912), blocked by FDM-911.

Create pure `ApplyModel.js`, `cli/ipc.cjs`, focused command modules, `tests/apply.test.cjs` and fake-IPC spawned-process integration tests. Extend service IPC with capabilities, apply acceptance and request-specific completion queries. Add the runtime-owned applied snapshot and non-destructive legacy fallback transition.

Implement whole-map staged import and atomic applied-state commit, expected revision checks, session/restart identity, bounded result retention, idempotency including source-content hashes and no partial publication. The CLI waits only for its request with a bounded deadline. Distinguish accepted, applied and render-verified states. Test interleaved IDs, busy/conflict, timeout, restart, last-import failure, failed save, malformed requests and no shell injection.

Complete apply/dry-run/status/doctor, command help, dependency/PATH installation docs and `skills/workspace-wallpapers/SKILL.md`. Retire competing legacy mutation authority after desired-state mode begins. No implicit apply on edit or file watch.

Run the complete suite, inspect the full diff and final CI logs, then attach the exact candidate and runbook to FDM-913. Complete this remote issue without claiming compositor evidence.

## 4. FDM-913: one local complete-candidate qualification

[Issue](https://linear.app/fdamaso/issue/FDM-913), blocked by FDM-912. Use [local runbook](../../cli-pivot-local-gate.md).

The local Omarchy agent verifies real CLI/config application and Quickshell/Hyprland rendering at the exact remote candidate SHA. Preserve local work/data, record versions and evidence, make only narrow reproduced fixes, and push/retest any changed SHA. Merge only after required cases and remote CI pass at the final candidate. Mark the parent outcome complete when all children are evidenced.

Then resume [FDM-868 release preparation](https://linear.app/fdamaso/issue/FDM-868) → [FDM-869 short final smoke](https://linear.app/fdamaso/issue/FDM-869) → [FDM-874 publication](https://linear.app/fdamaso/issue/FDM-874). Canceled UI gate FDM-908 is not a release blocker.

## Commands for each remote slice

```bash
node --test tests/*.test.cjs
bash -n bin/import-image
git diff --check
git diff --check origin/main...HEAD
```

Record actual outputs and exact-SHA CI logs in Linear. Do not mark checks passed merely because the PR badge is green, and do not ask the user to review AI-generated work as a queue step.

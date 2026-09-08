# FDM-863 WP-01 Native Workspace Wallpapers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use test-driven development and verification-before-completion. This plan is intentionally limited to WP-01.

**Goal:** Build the v0.1 native Omarchy workspace wallpaper service for FDM-863 without depending on a live Omarchy machine.

**Architecture:** A cloned `omarchy.background` service owns one background `PanelWindow` per screen. Each panel resolves the monitor's active Hyprland workspace to `id:<positive integer>` then `name:<exact name>`, ignores special workspaces, and renders either the persisted static assignment or the stock global background fallback. A separate native bridge preserves Omarchy's five background IPC methods while a `workspace-wallpapers` IPC target owns assignment operations and completion reporting.

**Tech stack:** QML/Quickshell, JavaScript helpers shared with Node's test runner, Bash import helper, GitHub Actions.

**Spec:** FDM-863 / FDM-859 umbrella as supplied in the implementation request.

## Global constraints

- Plugin id: `io.github.fernandodamaso.workspace-wallpapers`.
- Manifest metadata: `omarchy.clonedFrom = "omarchy.background"`.
- WP-01 supports PNG, JPEG, and WebP only.
- Workspace keys are `id:<positive integer>` and `name:<exact name>`; spaces and Unicode in names are preserved.
- `special` and `special:*` workspaces are never assigned.
- Workspace IPC target is `workspace-wallpapers` with `assign`, `clear`, `reload`, `status`, and `operationFinished` completion reporting.
- Stock IPC target `background` keeps `refresh`, `set`, `setInstant`, `transition`, and `themeTransition` signatures.
- No WP-02/WP-03 scheduling, playlists, randomization, or video support.
- GitHub checks do not establish live Quickshell/Hyprland behavior.

---

### Task 1: Lock the headless contract

**Files:**
- Create: `tests/model.test.cjs`
- Create: `tests/contracts.test.cjs`
- Create: `.github/workflows/ci.yml`

- [ ] Write tests for workspace key normalization, special-workspace exclusion, static path validation, state parsing, assignment lookup, and status serialization.
- [ ] Write structural contract tests for manifest id/clone metadata, stock background IPC signatures, WP-01 IPC operations, per-screen active-workspace lookup, static-only rendering, and local-gate documentation.
- [ ] Push this test-only commit and confirm GitHub Actions fails because the implementation files do not exist.

### Task 2: Implement the model, import path, and persistence

**Files:**
- Create: `WorkspaceModel.js`
- Create: `bin/import-image`
- Create: `WorkspaceWallpapers.qml`

**Interfaces:**
- `normalizeWorkspaceKey(string) -> string`
- `workspaceKeyCandidates(workspace) -> string[]`
- `preferredWorkspaceKey(workspace) -> string`
- `normalizeImagePath(string) -> string`
- `parseState(string) -> {version, assignments}`
- `assignmentForWorkspace(state, workspace) -> string`
- `withAssignment(state, key, path) -> state`
- `withoutAssignment(state, key) -> state`
- `statusPayload(state, fallback, statePath) -> object`

- [ ] Implement only behavior demanded by the tests.
- [ ] Persist assignments at `~/.config/omarchy/workspace-wallpapers/assignments.json` with `FileView`.
- [ ] Import selected assets into `${XDG_DATA_HOME:-$HOME/.local/share}/omarchy/workspace-wallpapers/images` using content-addressed filenames and MIME validation.

### Task 3: Add native background bridge and per-screen renderer

**Files:**
- Create: `NativeBackgroundBridge.qml`
- Create: `WorkspaceWallpaperPanel.qml`
- Create: `manifest.json`

- [ ] Forward the five stock `background` IPC methods to the controller with the current Omarchy signatures.
- [ ] Render one background-layer `PanelWindow` per `Quickshell.screens` entry.
- [ ] Resolve each panel's wallpaper from `Hyprland.monitorFor(modelData).activeWorkspace`; fall back to the stock global background.
- [ ] Keep rendering static-image only in v0.1.

### Task 4: Document compatibility and FDM-864 local handoff

**Files:**
- Modify: `README.md`
- Create: `LICENSE`
- Create: `docs/compatibility.md`
- Create: `docs/local-smoke.md`
- Create: `docs/third-party-notices.md`

- [ ] Pin the reference contract to Omarchy `quattro` commit `5b91db503c904bbfc5f34bdaaa9c708814958f3d` inspected on 2026-09-08.
- [ ] Record exact install/enable/IPC commands for local FDM-864 execution.
- [ ] Mark real Quickshell/Hyprland rendering, workspace switching, monitor behavior, picker focus, lock/unlock, and stock renderer restoration as **LOCAL GATE** checks.
- [ ] Document static-only limitations and avoid claiming compositor behavior from CI.

### Task 5: Verify and review

- [ ] Confirm GitHub Actions runs `node --test tests/*.test.cjs`, `bash -n bin/import-image`, `git diff --check`, and `git diff --check origin/main...HEAD` successfully on the implementation head.
- [ ] Review the PR diff for scope leakage, unsafe path handling, contract mismatches, and unsupported compositor claims.
- [ ] Open one Draft PR to `main` with the exact tested head SHA, commands/results, FDM-864 handoff, and known limitations.

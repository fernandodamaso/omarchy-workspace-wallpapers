# Workspace Wallpapers: agent instructions

This repository configures **workspace wallpapers**, not SmartDock. Preserve the native Omarchy wallpaper renderer; do not rebuild a settings page, picker, TUI, web UI or MCP server.

## Configure an installed plugin

1. Run `workspace-wallpapers --help` and `workspace-wallpapers --version --json`. Discover the installed commands instead of assuming the candidate branch has been installed. Node 22+ is required. Do not install dependencies, change PATH or enable plugins silently.
2. Inspect the selected desired file and available runtime status. Desired JSON lives at `${XDG_CONFIG_HOME:-$HOME/.config}/omarchy/workspace-wallpapers/config.json`. Existing installations can use `config migrate --dry-run --json`, then explicit migration only when desired config is absent. Preserve legacy files and all images.
3. Make the smallest requested desired-map change using `assign KEY PATH`, `clear KEY`, or an atomic/conflict-checked JSON edit. Never write service-owned applied state. Preserve unrelated assignments. Quote exact keys and absolute paths; never evaluate config values as shell code.
4. Run `config validate --json`, then `config apply --dry-run --json` and inspect its changes before explicit `config apply --json`. Apply commands are available only after the transactional runtime slice is installed. Do not substitute legacy IPC when those commands are absent.
5. Inspect the request-specific completion and resulting status. Report separately what was edited, what was applied/persisted, and what was actually rendered. An accepted request or a zero exit from raw IPC is not proof of persistence. On timeout/restart/unknown completion, inspect status before any retry; do not blindly apply again.

No ceremonial user acceptance is required for a configuration change the user already requested. Ask only for genuinely missing intent, credentials, destructive permission or physical/local actions unavailable to the agent.

## Configuration boundaries

- Version 1 desired JSON has exactly `version` and `assignments`. Use `schemas/config.schema.json`; do not invent settings. Paths are absolute PNG/JPEG/static-WebP source files. No URL downloads, environment substitution or executable configuration.
- Keys are canonical positive `id:<integer>` or `name:<exact name>`. Spaces and Unicode in names are significant. `special` and `special:*` are excluded. ID mappings take precedence over name mappings.
- Clearing an ID mapping can reveal a name mapping for the same workspace. To use the global background, inspect and remove the relevant explicit mappings rather than saving the current global image as a fixed assignment.
- Choosing a theme image by path is a fixed source assignment, not automatic following of future themes. Absent mappings follow Omarchy's global background.
- Legacy `~/.config/omarchy/workspace-wallpapers/assignments.json`, `preferences.json`, `history.json` and imported images are preserved. Desired migration never overwrites an existing desired file. Applied state belongs to the service under XDG_STATE_HOME, not to the configuration agent.
- `doctor`, validation and dry-run are read-only. Never delete config/history/images to recover a lock or failure. Never remove an active writer's lock. Coordinate with noncooperating external editors.
- Wallpaper assignment is this plugin's scope. Dock layout, application themes, lock screens, animations and video wallpapers are not configuration options in this version.

## Implement and verify changes

Read the current Linear issue plus `docs/superpowers/specs/2026-09-10-cli-first-configuration-design.md` and `docs/superpowers/plans/2026-09-10-cli-first-configuration.md`. Recheck the remote branch head before every write. Preserve concurrent work and use fast-forward updates only.

Keep `WorkspaceWallpaperPanel.qml`: despite its name, it renders the wallpaper. Keep the plugin ID, `omarchy.clonedFrom`, native background/theme IPC, per-monitor resolution, exact workspace keys, scratchpad retention, generation-safe image loading and global fallback.

Routine code, behavior tests, diff review, CI-log inspection and fixes belong to ChatGPT/GitHub. Use actual spawned CLI and state/failure tests, not source regexes alone. Run:

```bash
node --test tests/*.test.cjs
bash -n bin/import-image
git diff --check
git diff --check origin/main...HEAD
```

Record exact commit, commands and results. Agents own review and issue completion; do not ask the user to approve AI-generated code as a queue step. Headless tests do not prove QML loading, rendered pixels, monitor hotplug, lock/unlock or stock renderer restoration.

Continue the shared `feat/cli-first-configuration` / PR #6; never reopen abandoned UI PR #5. Keep the candidate draft/unmerged until FDM-913 qualifies the complete exact SHA in the actual Omarchy session. Local agents consume the remote implementation and fix only reproduced runtime defects, rather than rebuilding it locally. When completing an issue, name and link the next executable issue with its continuation instructions.

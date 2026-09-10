---
name: workspace-wallpapers
description: Use when a user requests per-workspace wallpaper assignments, global-background fallback, legacy wallpaper migration, or diagnostics for the Workspace Wallpapers plugin in an Omarchy session.
---

# Workspace Wallpapers

Configure workspace wallpapers through the installed `workspace-wallpapers` CLI and desired JSON. This is not a settings-page, dock, theme, video or slideshow tool. A repository branch existing on GitHub does not mean that version is installed locally.

## Discover the installed interface

Run `workspace-wallpapers --help` and `workspace-wallpapers --version --json`. Use an absolute executable path when it is not on PATH. Keep the repository intact: copying only its executable loses required sibling modules. Node 22+ must be available both to the CLI and to the running Omarchy service. Never silently install dependencies, change PATH, enable the plugin, restart the shell or upgrade the host.

Read the repository's `AGENTS.md` and inspect `workspace-wallpapers status --json`. Use only commands exposed by the installed version. Missing or incompatible live commands are a diagnostic, not permission to fall back to legacy `assign`/`clear`/`undo` IPC or edit applied state directly.

## Five-step change workflow

1. Inspect the selected desired configuration and runtime status. On an existing installation without desired JSON, run `workspace-wallpapers config migrate --dry-run --json`, then explicitly migrate before editing to preserve unrelated legacy mappings. Migration refuses an existing desired file and never applies changes.
2. Edit only the requested mappings using `assign KEY /absolute/image/path --json`, `clear KEY --json`, or a coordinated JSON edit. Preserve unrelated entries and retain enough information for a targeted rollback. Saving JSON and these edit commands do not change the desktop.
3. Run `workspace-wallpapers config validate --json`, then `workspace-wallpapers config apply --dry-run --json`. Inspect added, changed and removed keys against the user's request. Stop and resolve unexpected differences or errors before continuing; this review belongs to the agent.
4. Run `workspace-wallpapers config apply --json` once. Require a correlated final `applied` or `unchanged` result, not merely `accepted`. A timeout, lost receipt or unknown completion must never trigger a blind retry.
5. Inspect `workspace-wallpapers status --json` and report the actual persisted revision, affected keys and remaining rendering uncertainty. Verify visible pixels only with real local runtime evidence; `renderVerification: "unknown"` is not a visual success claim.

Use the same `--config /absolute/path/desired.json` override for every configuration operation in a change. The default desired file is `${XDG_CONFIG_HOME:-$HOME/.config}/omarchy/workspace-wallpapers/config.json`; JSON paths are literal absolute filenames, without environment-variable or tilde expansion.

## Workspace and image rules

Canonical numbered keys are `id:2`; named keys are `name:` followed by the exact nonempty name. Preserve spaces, case and Unicode. An ID mapping takes precedence over a name mapping for the same workspace. Clearing an ID can reveal a name mapping rather than global fallback; clear the matching name only when that is part of the requested change. Scratchpads and special workspaces are excluded.

An absent matching mapping follows the current global Omarchy wallpaper. Assigning a file from a theme directory instead selects that fixed source; it does not follow future themes. Version 1 has exactly `version: 1` and `assignments`; do not invent transition, folder, monitor, animation or scheduling fields.

Only readable PNG, JPEG and static WebP sources are supported. Quote literal filenames when invoking commands and use argument arrays from code. Do not evaluate shell syntax contained in filenames. Do not download new assets or change application themes unless separately authorized.

## Failures and recovery

| Exit | Meaning | Agent action |
| --- | --- | --- |
| 0 | Command completed | Inspect the phase; saved desired state is not applied state. |
| 2 | Usage or validation | Correct arguments/configuration or the source image; preserve unrelated mappings. |
| 3 | Runtime/dependency unavailable | Inspect `doctor --json`, installed commands and the service environment. No automatic installation or enablement. |
| 4 | Conflict or busy | Inspect the current writer and newest state; reconcile before preparing a new operation. |
| 5 | Timeout/unknown completion | Inspect status and request/session identifiers. The service may still commit; never assume rollback or retry automatically. |
| 6 | Confirmed import/save/runtime failure | Read the error and retain the previous applied map. A reported committed/unknown outcome still requires inspection. |

`doctor --json` is read-only and does not repair the host. A killed writer can leave a private lock/temp file. Establish that its owner is no longer active before removing only an abandoned lock/temp file; never delete configuration or the image store to clear a lock.

For an uncertain or stale service snapshot, first inspect status and establish worker liveness. The retained low-level `omarchy-shell workspace-wallpapers reload` refreshes applied state, not desired JSON; its return alone is not completion evidence. Inspect status again and require readiness before another apply. Never use reload as a substitute for explicit apply.

Rollback is another reviewed desired-state edit followed by validation, dry-run and explicit apply. Do not directly modify service-owned `applied.json`, legacy `assignments.json`, preferences, history or imported assets. Source bytes may have changed at the same path; use verified retained images when exact restoration matters.

## Development boundary

Agents own implementation review, CI inspection and fixes. Do not ask the user to ceremonially approve generated code. For this transition, complete local Omarchy qualification on the exact shared PR candidate before merging or releasing; headless tests do not prove QML loading, hotplug, lock/unlock, theme behavior or stock renderer restoration.

The repository's `docs/agent-configuration.md` contains longer customization recipes. `docs/cli-pivot-local-gate.md` defines the real-session qualification and reversible install/restore checks.

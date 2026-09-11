<div align="center">

# Workspace Wallpapers for Omarchy

**Give every workspace its own atmosphere.**

Native per-workspace wallpapers for Omarchy, with a small CLI designed to be just as comfortable for coding agents as it is for humans.

[![CI](https://github.com/fernandodamaso/omarchy-workspace-wallpapers/actions/workflows/ci.yml/badge.svg)](https://github.com/fernandodamaso/omarchy-workspace-wallpapers/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

---

Your coding workspace can look like coding. Your chat workspace can feel quieter. Your creative workspace can be completely different.

| Workspace | Example use | Wallpaper behavior |
| --- | --- | --- |
| `1` | Browser / general | Follows your normal Omarchy background |
| `2` | Coding | `coding.png` |
| `3` | Communication | `city-night.webp` |
| `4` | Design | `abstract.jpg` |

Unassigned workspaces keep following Omarchy's global background, so you only configure the workspaces you actually want to make different.

## Install

Install and enable the plugin directly from GitHub:

```bash
omarchy plugin add https://github.com/fernandodamaso/omarchy-workspace-wallpapers.git --enable
```

Omarchy installs third-party plugins under `~/.config/omarchy/plugins/<plugin-id>/`. This plugin's CLI is therefore available at:

```bash
WW="$HOME/.config/omarchy/plugins/io.github.fernandodamaso.workspace-wallpapers/bin/workspace-wallpapers"
"$WW" --version --json
```

> [!IMPORTANT]
> **Node.js 22 or newer** must be available both to the CLI and to the running Omarchy shell service.

Omarchy plugins run as user-level code inside `omarchy-shell`. Review third-party plugins before enabling them; see the [official Omarchy shell plugin documentation](https://omarchy.org/manual/shell-plugins/).

## Quick start

Assign an image to workspace 2, preview the exact change, then apply it:

```bash
WW="$HOME/.config/omarchy/plugins/io.github.fernandodamaso.workspace-wallpapers/bin/workspace-wallpapers"

"$WW" assign 'id:2' '/absolute/path/to/coding.png' --json
"$WW" config validate --json
"$WW" config apply --dry-run --json
"$WW" config apply --json
"$WW" status --json
```

That's the core workflow:

1. **Assign** the image you want.
2. **Validate and preview** the resulting configuration.
3. **Apply once** and inspect the resulting status.

Nothing is applied just because the JSON file was edited. Desired configuration and running state stay deliberately separate.

### Optional: put the CLI on your PATH

```bash
mkdir -p "$HOME/.local/bin"
ln -s \
  "$HOME/.config/omarchy/plugins/io.github.fernandodamaso.workspace-wallpapers/bin/workspace-wallpapers" \
  "$HOME/.local/bin/workspace-wallpapers"
```

The command intentionally does not overwrite an existing file. Make sure `$HOME/.local/bin` is already on your `PATH`.

## 🤖 Or just tell your coding agent

The repository includes [`AGENTS.md`](AGENTS.md), a reusable [`workspace-wallpapers` agent skill](skills/workspace-wallpapers/SKILL.md), and [configuration/recovery recipes](docs/agent-configuration.md).

So instead of learning the CLI first, you can give a local coding agent the outcome you want and let it inspect, validate, preview, apply, and verify the change for you.

Copy this prompt into Codex, Claude Code, OpenCode, Kimi, or another terminal coding agent running on your Omarchy machine:

```text
Install and configure Workspace Wallpapers for Omarchy:
https://github.com/fernandodamaso/omarchy-workspace-wallpapers

Read AGENTS.md and skills/workspace-wallpapers/SKILL.md before making changes.

Assign workspace 2 to:
/absolute/path/to/my-wallpaper.png

Preserve all unrelated wallpaper mappings.
Validate the desired configuration, preview the apply, inspect the preview yourself,
apply it once, and verify the resulting status.

Do not edit service-owned applied state or legacy files directly.
If anything is ambiguous or fails, diagnose it before retrying.
```

If the plugin is already installed, the request can be much shorter:

```text
Use the Workspace Wallpapers agent instructions in this repository.
Set workspace 2 to /absolute/path/to/coding.png and verify the result.
```

The CLI provides stable `--json` output, explicit dry-runs, diagnostics, request-specific completion, and deterministic exit classes specifically so automated tools do not need to scrape human-oriented output or guess whether a change succeeded.

## Why Workspace Wallpapers?

- **Per-workspace identity** — assign a static wallpaper by workspace ID or exact workspace name.
- **Native Omarchy fallback** — unassigned workspaces continue using the current global Omarchy background.
- **Agent-ready** — machine-readable CLI output plus repository-level instructions and recovery rules.
- **Preview before apply** — see added, changed, and removed mappings before changing the running configuration.
- **Whole-map apply** — updates are validated and published as one configuration instead of partially mutating workspaces one at a time.
- **Safe migration** — older plugin state can be migrated without silently overwriting the new desired configuration.
- **No extra settings app** — configuration stays portable, inspectable, and automation-friendly.

## Example setup

```bash
workspace-wallpapers assign 'id:2' '/home/user/Pictures/wallpapers/coding.png' --json
workspace-wallpapers assign 'id:3' '/home/user/Pictures/wallpapers/city-night.webp' --json
workspace-wallpapers assign 'name:Design' '/home/user/Pictures/wallpapers/abstract.jpg' --json

workspace-wallpapers config validate --json
workspace-wallpapers config apply --dry-run --json
workspace-wallpapers config apply --json
workspace-wallpapers status --json
```

Workspace 1 is not mapped, so it continues following the global Omarchy wallpaper.

### Workspace keys

Numbered workspaces use canonical positive IDs:

```text
id:2
id:7
```

Named workspaces use their exact name:

```text
name:Design
name: Work 日本語
```

Spaces, case, and Unicode are significant. ID mappings take precedence over name mappings for the same live workspace. Special/scratchpad workspaces are not configurable.

## Configuration

Desired configuration lives at:

```text
${XDG_CONFIG_HOME:-$HOME/.config}/omarchy/workspace-wallpapers/config.json
```

A minimal configuration looks like this:

```json
{
  "version": 1,
  "assignments": {
    "id:2": "/home/user/Pictures/work.png",
    "name:Design": "/home/user/Pictures/focus.webp"
  }
}
```

The human or coding agent owns this file. The service does **not** watch it or rewrite it automatically. Editing it, running `assign`, running `clear`, or migrating legacy state changes desired configuration only; an explicit `config apply` changes the running configuration.

The [JSON Schema](schemas/config.schema.json) rejects unknown properties, invalid shapes, noncanonical IDs, and unsupported paths. The CLI also checks duplicate JSON keys, readable image bytes, MIME signatures, and supported static containers.

Configuration values are literal data. `$HOME`, `~`, URLs, and shell expressions are not expanded inside JSON; use real absolute paths.

## Global fallback

The plugin only overrides workspaces that have an explicit mapping.

If a workspace has no matching assignment, it follows Omarchy's current global background. This means you can keep most workspaces theme-driven while pinning only a few to specific images.

Clearing an ID mapping can reveal an existing name mapping for the same workspace rather than the global fallback. Inspect both mappings before clearing if you want the workspace to fully return to the global background.

Choosing a file from an Omarchy theme directory is still a **fixed file assignment**. It does not automatically follow future theme changes.

## CLI reference

```bash
workspace-wallpapers --help
workspace-wallpapers --version --json

workspace-wallpapers assign 'id:2' '/absolute/path/to/image.png' --json
workspace-wallpapers clear 'id:2' --json

workspace-wallpapers config validate --json
workspace-wallpapers config migrate --dry-run --json
workspace-wallpapers config migrate --json
workspace-wallpapers config apply --dry-run --json
workspace-wallpapers config apply --json

workspace-wallpapers status --json
workspace-wallpapers doctor --json
```

Configuration commands and `doctor` can use an alternate desired file with:

```bash
--config /absolute/path/to/config.json
```

Use the same selected file throughout one change. `status` always reports the running service state and does not accept `--config`.

## Existing installations and migration

If you used an earlier version of Workspace Wallpapers and do not yet have the new desired JSON file, preview migration first:

```bash
workspace-wallpapers config migrate --dry-run --json
```

Then migrate explicitly:

```bash
workspace-wallpapers config migrate --json
```

Migration refuses to overwrite an existing desired configuration, preserves legacy files, and does not apply anything automatically. After migration, use the normal validate → dry-run → apply workflow.

## Status and diagnostics

Both of these commands are read-only:

```bash
workspace-wallpapers status --json
workspace-wallpapers doctor --json
```

`status` reports the current service snapshot, including readiness, busy state, revision, desired hash, request/session information, mappings, and storage paths.

`doctor` checks desired configuration, source images, runtime compatibility/readiness, and writer locks without repairing or deleting anything.

> [!WARNING]
> On a timeout, restart, lost receipt, or unknown completion, **inspect status before retrying**. Do not blindly repeat `config apply` and do not assume the previous operation rolled back.

A final `applied` or `unchanged` result confirms persisted configuration. It does not by itself prove that pixels rendered correctly on screen; live compositor verification is a separate concern.

## Supported images

- PNG
- JPEG
- Static WebP
- Up to 128 MiB per source image

Workspace Wallpapers intentionally does **not** provide video wallpapers, playlists, scheduling, randomization, a TUI, a web UI, or a runtime network daemon.

## How the runtime works

Workspace Wallpapers replaces `omarchy.background` through Omarchy's `clonedFrom` plugin mechanism while preserving the native background/theme IPC bridge.

The renderer resolves the active workspace independently for each monitor. Assigned workspaces use the plugin-managed image; unassigned workspaces use Omarchy's normal global background.

An apply operation validates all source images, stages content-addressed copies, and atomically publishes one applied snapshot. If a confirmed source/import/precommit persistence failure occurs, the previous applied map remains in place.

Repeated unchanged configuration and unchanged source bytes do not create a new applied revision. If the bytes at an existing source path change, the change is detected.

<details>
<summary><strong>Storage, concurrency, and recovery details</strong></summary>

### Storage locations

| Owner | Location |
| --- | --- |
| Human/agent desired JSON | `${XDG_CONFIG_HOME:-$HOME/.config}/omarchy/workspace-wallpapers/config.json` |
| Service-owned applied snapshot | `${XDG_STATE_HOME:-$HOME/.local/state}/omarchy/workspace-wallpapers/applied.json` |
| Content-addressed image copies | `${XDG_DATA_HOME:-$HOME/.local/share}/omarchy/workspace-wallpapers/images` |
| Preserved legacy metadata | `~/.config/omarchy/workspace-wallpapers/assignments.json`, `preferences.json`, `history.json` |

The running service's environment determines its state and image locations. Changing XDG variables only in the CLI process does not relocate the running service.

Desired edits and private runtime writes use separate exclusive lock files, content-revision checks, private temporary files, `fsync`, and atomic publication. A stale revision or live lock is an error, not permission to overwrite another writer.

A killed writer can leave a lock or private temporary file. Establish that no writer is active before removing only abandoned lock/temp files. Never delete desired/applied configuration, legacy data, or the image store just to clear a lock.

`omarchy-shell workspace-wallpapers reload` reloads **applied state only**. It does not read or apply unapplied desired JSON. Inspect `status` again after using it.

Rollback is another reviewed desired-state edit followed by validation, dry-run, and explicit apply. Do not directly edit service-owned `applied.json`.

### Limits

- 1 MiB UTF-8 desired config
- 64 JSON nesting levels
- 1024 mappings
- Canonical positive IDs through JavaScript's maximum safe integer
- 128 MiB per source image
- 64 KiB serialized apply requests
- Up to 64 retained completed service receipts

Long paths or very large maps can hit the IPC request limit before the config-file limit.

</details>

## Machine-readable behavior

With `--json`, stdout contains exactly one result object with stable fields including:

```text
schemaVersion
ok
command
requestId
phase
code
message
data
```

Commands never prompt. Failures can also write diagnostics to stderr.

Exit classes:

| Exit | Meaning |
| --- | --- |
| `0` | Command completed successfully |
| `2` | Usage or validation error |
| `3` | Dependency or runtime unavailable |
| `4` | Conflict or runtime busy |
| `5` | Timeout / completion unknown |
| `6` | Confirmed I/O, import, save, or runtime failure |

A successful desired edit still does not mean the configuration has been applied. Agents should inspect the returned phase and status instead of relying on process exit alone.

## Agent documentation

Workspace Wallpapers is intentionally documented for local coding agents as a first-class configuration path:

- [`AGENTS.md`](AGENTS.md) — repository-level rules and safe change workflow
- [`skills/workspace-wallpapers/SKILL.md`](skills/workspace-wallpapers/SKILL.md) — reusable agent skill
- [`docs/agent-configuration.md`](docs/agent-configuration.md) — configuration and recovery recipes
- [`docs/cli-pivot-local-gate.md`](docs/cli-pivot-local-gate.md) — real-session qualification and reversible install checks
- [`docs/compatibility.md`](docs/compatibility.md) — native Omarchy compatibility reference

The intended agent workflow is simple:

```text
inspect → edit desired state → validate → dry-run → review → apply once → verify status
```

Agents own routine inspection and verification. User interaction is only necessary when intent is genuinely missing, credentials are required, destructive permission is needed, or visible/local behavior cannot be established by the available tools.

## Development

Run the local verification suite with:

```bash
node --test tests/*.test.cjs
bash -n bin/import-image
git diff --check
```

Headless tests cover CLI behavior, state transitions, failure handling, concurrency boundaries, legacy retention, and renderer/model contracts. They do not prove live QML loading, rendered pixels, monitor hotplug, lock/unlock behavior, or stock-renderer restoration in a real Omarchy session.

## License

MIT. See [LICENSE](LICENSE) and [third-party notices](docs/third-party-notices.md).

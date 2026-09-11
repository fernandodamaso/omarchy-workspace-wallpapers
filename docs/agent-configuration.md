# Configure wallpapers from a user request

This guide is for a coding agent running in the user's Omarchy session. The repository's remote implementation work does not imply this branch is installed on that machine. This plugin changes workspace wallpapers, not dock settings or application themes.

## Discover before changing anything

Run the installed `workspace-wallpapers --help` and `--version --json`. Use only commands actually present. Node 22+ and the running Omarchy service are explicit dependencies; do not silently install, enable, restart or upgrade them. The approved CLI flow below requires the transactional apply implementation (validate, dry-run, explicit apply, status), not ad-hoc IPC calls.

Read `AGENTS.md`, then inspect the selected desired JSON and structured runtime status. When desired configuration is absent on an existing installation, preview `config migrate --dry-run --json` and explicitly migrate before editing so unrelated legacy mappings are retained. Migration refuses an existing desired file and never applies changes.

Desired file: `${XDG_CONFIG_HOME:-$HOME/.config}/omarchy/workspace-wallpapers/config.json`. All configuration commands can select the same alternative file with `--config /absolute/path/desired.json`. Never mix default and override files in one change. Never edit `assignments.json`, `history.json`, `preferences.json`, imported assets or service-owned `applied.json` as a configuration shortcut.

## Recipe: “Give workspace 2 this image”

Use the real, readable absolute image path supplied by the user or discovered on the host. The source below is an example, not an existing asset.

```bash
workspace-wallpapers assign 'id:2' '/absolute/path/to/blue.png' --json
workspace-wallpapers config validate --json
workspace-wallpapers config apply --dry-run --json
workspace-wallpapers config apply --json
workspace-wallpapers status --json
```

Run these as separate steps and inspect each result before continuing. Confirm the dry-run changes only the requested mapping and preserves unrelated assignments. `assign` edits desired JSON; it does not apply. Do not automatically continue after any validation, conflict, import, persistence or runtime failure.

An instruction such as “make it blue” does not authorize downloading an image, changing the system theme, applying an overlay effect, or overwriting unrelated workspace assignments. Use an existing suitable image and describe that choice. Only ask for a choice when the intended workspace/image genuinely cannot be determined from the request and available state.

## Recipe: exact named workspace

```bash
workspace-wallpapers assign 'name: Work 日本語 ' '/absolute/path/to/design.webp' --json
```

The leading/trailing spaces after `name:` above are part of the workspace name. Do not trim, lowercase, ASCII-normalize or invent aliases. IDs take precedence over name mappings for the same live workspace. Inspect existing mappings first: a new name assignment will not override an existing ID assignment. Special/scratchpad workspaces cannot be assigned.

Continue through validation, dry-run, explicit apply and status, as in the first recipe. No live workspace switch is required just to edit a mapping for an absent workspace.

## Recipe: “Use the global background again”

```bash
workspace-wallpapers clear 'id:2' --json
```

Inspect whether the same workspace also has a name assignment. Clearing its ID may reveal that name assignment, rather than global fallback. Clear the relevant name key only when it belongs to the requested workspace, then validate, preview, apply and inspect status. Do not replace an assignment with the current global image path: that creates a fixed image assignment instead of following global changes.

Choosing an image from a theme folder also creates a fixed source assignment. It does not mean “follow the next theme.” Global fallback is represented by the absence of a matching explicit assignment.

## Recipe: several requested changes

Preserve a copy of the prior desired map for a possible targeted rollback, respecting existing filesystem permissions and private paths. Edit only requested mappings using sequential CLI commands or one validated, atomic/conflict-checked JSON edit. Do not run concurrent writers against the same file. Validate and dry-run the complete result, then apply once: the runtime transaction must publish the whole map, not partially succeed workspace by workspace.

Version 1 configuration has exactly `version` and `assignments`. The schema does not include source folders, search preferences, thumbnail size, transition duration, video, playlists, scheduling, monitor-specific overrides or dock appearance. Do not invent fields to satisfy an unsupported request.

## Failures and recovery

Use the process exit code together with the JSON result. Exit 2 is usage/validation; 3 is dependency/runtime unavailable; 4 is conflict/busy; 5 is timeout/unknown completion; 6 is import/save/runtime failure. Keep stdout JSON distinct from stderr diagnostics.

On an edit conflict, read the latest desired file and preserve the other writer's changes before retrying the minimal edit. On an apply timeout or session restart, do not blindly repeat the apply: inspect current status and any request-specific result supported by the installed interface. An accepted request might subsequently succeed even if the caller timed out.

A post-rename durability error can mean a file was replaced but durability was not confirmed. Inspect actual state before retrying; do not report that the old file was necessarily restored. A corrupt or missing image is not authorization to delete mappings or image history. `doctor` reports problems without repairing the host or deleting user data.

Rollback is another explicit desired-state change and apply, not direct editing of runtime files. Compare with current state first so rollback does not erase later unrelated changes. Reusing a previous source path is not a guarantee of the same pixels if its bytes changed; use retained verified assets when exact visual restoration is needed.

## Report completion truthfully

Keep the report short: requested workspace/key, selected source, actual command outcome, whether the applied snapshot was verified, and any remaining local rendering uncertainty. Never equate “desired JSON saved,” “request accepted,” “configuration persisted,” and “pixels rendered.” The CLI may establish persistence while reporting render verification as unknown.

Agent inspection and verification are part of the work, not a user approval ritual. For development, the shared candidate remains unmerged until FDM-913 verifies the complete exact SHA in Omarchy. Only physical/session actions, credentials or destructive decisions genuinely unavailable to the agent require user participation.

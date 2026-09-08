# FDM-864 local smoke handoff

FDM-863 is intentionally qualified headlessly in GitHub. Run this handoff on a real Omarchy Quattro session for FDM-864 before treating compositor integration as complete.

## 1. Install the exact FDM-863 branch

```bash
set -euo pipefail

PLUGIN_ID=io.github.fernandodamaso.workspace-wallpapers
PLUGIN_DIR="$HOME/.config/omarchy/plugins/$PLUGIN_ID"
REPO=https://github.com/fernandodamaso/omarchy-workspace-wallpapers.git
BRANCH=feat/fdm-863-wp01-native-workspace-wallpapers

mkdir -p "$HOME/.config/omarchy/plugins"
if [[ -e "$PLUGIN_DIR" ]]; then
  BACKUP="$PLUGIN_DIR.fdm864-backup-$(date +%s)"
  mv "$PLUGIN_DIR" "$BACKUP"
  printf 'Previous plugin checkout moved to %s\n' "$BACKUP"
fi

git clone --branch "$BRANCH" --single-branch "$REPO" "$PLUGIN_DIR"
cd "$PLUGIN_DIR"
printf 'HEAD=%s\n' "$(git rev-parse HEAD)"
omarchy plugin validate "$PLUGIN_DIR"
omarchy plugin enable "$PLUGIN_ID"
omarchy plugin list --json | jq -e --arg id "$PLUGIN_ID" '.[] | select(.id == $id and .enabled == true and .clonedFrom == "omarchy.background")'
```

Expected observations:

- `omarchy plugin validate` exits successfully.
- The printed `HEAD` matches the Draft PR head being qualified.
- The final `jq` expression prints the enabled plugin entry with `clonedFrom` equal to `omarchy.background`.
- Do not infer rendering success from these observations.

## 2. Observe `operationFinished`

In a second terminal inside the same graphical session:

```bash
qs ipc -n -p "$OMARCHY_PATH/shell" listen workspace-wallpapers operationFinished
```

Leave it running during the IPC tests below.

Expected observation: each `assign`, `clear`, `reload`, and `status` operation emits one JSON string containing at least `operation`, `ok`, `key`, `path`, and `reason`.

## 3. Assign a real static image to the current workspace

In the first terminal:

```bash
set -euo pipefail

PLUGIN_ID=io.github.fernandodamaso.workspace-wallpapers
PLUGIN_DIR="$HOME/.config/omarchy/plugins/$PLUGIN_ID"
SOURCE="$(find /usr/share/omarchy/themes "$HOME/.config/omarchy/themes" -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' \) -print -quit 2>/dev/null)"
test -n "$SOURCE"
WS_ID="$(hyprctl activeworkspace -j | jq -r '.id')"
test "$WS_ID" -gt 0
KEY="id:$WS_ID"

printf 'SOURCE=%s\nKEY=%s\n' "$SOURCE" "$KEY"
omarchy-shell workspace-wallpapers assign "$KEY" "$SOURCE"
sleep 1
omarchy-shell workspace-wallpapers status | jq .
jq . "$HOME/.config/omarchy/workspace-wallpapers/assignments.json"
```

Expected observations:

- The signal listener reports an `assign` completion with `ok: true`.
- `status` contains `"$KEY"` and a managed path under `${XDG_DATA_HOME:-$HOME/.local/share}/omarchy/workspace-wallpapers/images/`.
- `assignments.json` contains the same managed path, not the original theme source path.

## 4. Exercise reload and clear

```bash
omarchy-shell workspace-wallpapers reload
sleep 1
omarchy-shell workspace-wallpapers status | jq .
omarchy-shell workspace-wallpapers clear "$KEY"
sleep 1
omarchy-shell workspace-wallpapers status | jq .
```

Expected observations:

- The listener reports successful `reload` and `clear` completions.
- Reload preserves the assignment before it is cleared.
- After clear, the current workspace no longer has an explicit assignment and uses the static global fallback.

Re-run the `assign` command from step 3 before the visual gates below.

## 5. Required local gates

These are **LOCAL GATE** checks. Record PASS/FAIL plus the observed monitor/workspace names in FDM-864. GitHub CI cannot substitute for them.

### LOCAL GATE — Quickshell/Hyprland rendering

With the current positive-id workspace assigned, confirm the selected static image fills that monitor with preserve-aspect crop and no foreground/input layer appears above normal windows.

Expected: the assigned PNG/JPEG/WebP is visible as the desktop background on that monitor.

### LOCAL GATE — workspace switching

```bash
CURRENT="$(hyprctl activeworkspace -j | jq -r '.id')"
OTHER=$([[ "$CURRENT" == "9" ]] && echo 8 || echo 9)
hyprctl dispatch workspace "$OTHER"
sleep 1
hyprctl dispatch workspace "$CURRENT"
```

Expected: the unassigned test workspace shows the static global fallback; returning to the assigned workspace restores its image without changing the persisted assignment.

Also verify a named normal workspace manually if one exists. Names with spaces or Unicode must be addressable exactly as `name:<exact name>`. Do not assign `name:special` or `name:special:*`; those keys must be rejected.

### LOCAL GATE — monitor behavior

```bash
hyprctl monitors -j | jq -r '.[] | [.name, .activeWorkspace.id, .activeWorkspace.name] | @tsv'
```

On a multi-monitor setup, put different normal workspaces on at least two monitors and assign different static images to their positive ids with the step-3 `assign` command.

Expected: each screen follows the active workspace of its own monitor. Switching a workspace on one monitor must not change the other monitor's wallpaper.

If only one monitor is available, record this gate as **SKIPPED — requires multi-monitor local hardware**, not PASS.

### LOCAL GATE — picker focus

Double-left-click an empty area of the desktop on a normal workspace.

Expected: `omarchy-theme-bg-switcher` opens with keyboard focus. Selecting a PNG/JPEG/WebP imports and assigns it to the workspace under the pointer's monitor; cancelling leaves the assignment unchanged. Double-right-click should retain the stock theme-switcher behavior.

### LOCAL GATE — lock/unlock

```bash
omarchy-shell lock lock
```

Unlock normally through the Omarchy lock screen.

Expected: lock succeeds, unlock returns to the assigned workspace wallpaper, and the desktop background is neither black nor stale after the session-lock round trip.

### LOCAL GATE — stock renderer restoration

```bash
omarchy plugin disable io.github.fernandodamaso.workspace-wallpapers
omarchy plugin list --json | jq -e '.[] | select(.id == "io.github.fernandodamaso.workspace-wallpapers" and .enabled == false)'
```

Expected: the cloned replacement unloads and the built-in `omarchy.background` renderer resumes ownership without restarting the compositor. Confirm the stock global background and stock background interactions render again.

If more qualification is needed afterward:

```bash
omarchy plugin enable io.github.fernandodamaso.workspace-wallpapers
```

## 6. FDM-864 evidence to capture

Record:

- tested plugin `git rev-parse HEAD`;
- Omarchy commit/version;
- monitor list and active workspace ids/names;
- PASS/FAIL/SKIPPED for every **LOCAL GATE** above;
- one successful `operationFinished` JSON payload for `assign`, `reload`, `status`, and `clear`;
- any Quickshell journal/runtime errors observed while enabling, switching workspaces, picking, locking, unlocking, or disabling the plugin.

Do not promote a headless CI result to a local-gate PASS.

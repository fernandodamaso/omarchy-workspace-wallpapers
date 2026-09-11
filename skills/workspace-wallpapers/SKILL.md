---
name: workspace-wallpapers
description: Use when a user requests per-workspace wallpaper assignments, global-background fallback, legacy wallpaper migration, or diagnostics for the Workspace Wallpapers plugin in an Omarchy session.
---

# Workspace Wallpapers

Carry out a wallpaper change the user asked for, through the installed `workspace-wallpapers` CLI. This plugin only assigns static wallpapers to workspaces. It has no settings page, picker, themes, videos, or slideshows. A branch on GitHub is not proof of what is installed here — always check the installed version first.

## 1. Look before touching

```bash
workspace-wallpapers --help
workspace-wallpapers --version --json
workspace-wallpapers status --json
```

Use only commands the installed version actually has. If the command is not on PATH, use its absolute path inside the installed plugin folder; never copy the executable out alone, it needs its sibling modules. Node 22+ must be available to both the CLI and the running shell service. Never silently install tools, change PATH, enable the plugin, restart the shell, or upgrade the host.

## 2. Change, check, then apply

```bash
workspace-wallpapers assign 'id:2' '/absolute/path/to/blue.png' --json
workspace-wallpapers config validate --json
workspace-wallpapers config apply --dry-run --json
workspace-wallpapers config apply --json
workspace-wallpapers status --json
```

Run each line separately and read the result before the next one. Editing only writes the desired file; the desktop changes solely on explicit `config apply`. If dry-run shows anything beyond the requested change, stop and ask. `clear 'id:2'` removes one mapping — follow it with the same validate, dry-run, and apply. Never retry blindly after a timeout or unknown result; inspect `status` first.

## 3. Keys, images, fallback

- A numbered workspace is `id:2`. A named workspace is `name:` plus the exact name: spaces, case, and Unicode matter, so never trim or normalize. An ID mapping beats a name mapping for the same workspace. Special and scratchpad workspaces cannot be assigned.
- A workspace with no mapping shows the current global Omarchy background. Picking an image from a theme folder pins that file; it will not follow future theme changes.
- Images must be readable absolute paths (`/home/...`, no `~`, no variables) in PNG, JPEG, or static WebP. Never download images or change themes unless the user explicitly asked for it.
- "Make it blue" is not permission to fetch files, restyle themes, add effects, or touch other workspaces. Use a suitable existing image and say which one you chose. Ask the user only when the workspace or the image genuinely cannot be decided from the request.

## 4. Hands off

Never edit service-owned `applied.json`, legacy `assignments.json` / `history.json` / `preferences.json`, or the managed image store. A rollback is just another assign or clear followed by validate, dry-run, and apply. Never delete configuration, history, or images to fix a lock or an error.

## 5. When it fails

| Exit | Meaning | Do this |
| --- | --- | --- |
| 0 | Command completed | Read the phase; a saved desired edit is still not an applied desktop. |
| 2 | Usage or validation | Fix the arguments, key, or image; keep unrelated mappings. |
| 3 | Runtime unavailable | Inspect `doctor --json` and the service environment; do not auto-install or enable. |
| 4 | Conflict or busy | Read the newest state first; reconcile before a new operation. |
| 5 | Timeout or unknown | Inspect `status` and the request/session ids; the service may still commit, so never auto-retry. |
| 6 | Import or save failure | Read the error; the previous applied map is retained. |

`doctor --json` only diagnoses; it repairs nothing.

Longer customization recipes live in `docs/agent-configuration.md` in this repository.

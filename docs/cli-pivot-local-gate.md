# LOCAL GATE: complete CLI pivot and retained renderer

Owner: [FDM-913](https://linear.app/fdamaso/issue/FDM-913), a coding agent in the actual Omarchy session. Parent: [FDM-909](https://linear.app/fdamaso/issue/FDM-909). Shared candidate: [PR #6](https://github.com/fernandodamaso/omarchy-workspace-wallpapers/pull/6), branch `feat/cli-first-configuration`.

This runbook replaces settings/browser/picker-focus qualification. `docs/local-smoke.md` and `docs/wp03-local-gate.md` remain historical. Headless checks do not prove QML loading or Quickshell/Hyprland rendering. Agents own inspection, fixes and acceptance; Fernando is not a ceremonial code reviewer.

The required workflow is **edit desired JSON → validate → dry-run → explicit apply → inspect status**. Prove that saving JSON does not apply changes and that only explicit apply publishes the complete wallpaper map.

## Exact candidate and reversible setup

Read the latest FDM-912 completion evidence and FDM-913 handoff for the **full candidate SHA and successful CI run**. Require completed remote issues FDM-910/FDM-911/FDM-912. Record that SHA before fetching; do not silently substitute a newer branch head. A documentation file cannot identify its own future commit, so Linear's exact-SHA handoff is authoritative.

Inspect the existing checkout, installed plugin path and revision, dirty files, enabled plugin state, command resolution and host lifecycle help before changing anything. Use an isolated worktree or equivalent clean candidate checkout; verify its `git rev-parse HEAD` matches the handoff. Never hard-reset a dirty checkout or overwrite local work. The README's default-branch `omarchy plugin add` command installs main, not this candidate; use the actual host's documented local-candidate lifecycle rather than inventing branch flags.

Keep the complete repository available: the executable and private service helper require sibling modules. Record Node 22+ availability on both the terminal and running shell service PATH, plus Omarchy, Quickshell, Qt and Hyprland versions. Record the CLI and service HOME/XDG environments and returned runtime `statePath`/`imageDirectory`; changing the CLI's environment alone does not relocate the running service.

Before installation/migration/apply, record a backup of any existing desired/applied/legacy files, their original existence and permissions, and the owned-image inventory/hashes. Record the previous plugin revision and the actual disable/re-enable/stock-restore commands from the host's lifecycle tools. Keep backup paths private. Do not edit packaged Omarchy files, remove personal images, or delete whole storage directories. Preserve backups throughout qualification.

## Five qualification steps

1. **Load the candidate safely.** Install/select the exact checkout through the inspected host lifecycle. Verify service-only registration and actual QML loading: no settings page, image browser, graphical file/folder picker or wallpaper/theme double-click configuration gesture. Inspect service logs and confirm Node dependency discovery. Keep the original data intact; a missing dependency or invalid state must produce diagnostics rather than an empty success claim.
2. **Exercise the agent workflow.** Use the command sequence below with disposable image fixtures and a backed-up or isolated desired profile. Verify migration never overwrites desired JSON and preserves every legacy byte. Verify edits, validation and dry-run do not change desktop wallpapers or applied state. Check default/nondefault paths, literal shell metacharacters, exact named workspaces and a complete multi-workspace apply. Inspect the actual request/session, revision and resulting effective image map.
3. **Exercise failure and concurrency.** Use disposable profiles/harnesses for malformed/duplicate JSON, invalid/missing images, stale revisions, concurrent requests, blocked/unavailable IPC, timeout/restart and injected pre/post-commit save failures. Confirm no partial map is published, unchanged apply is a no-op, changed bytes at the same path are noticed, and unknown outcomes return exit 5 with no blind retry. Never chmod or corrupt real user files to simulate failure. Record stdout, stderr and exit codes, not just a screenshot or invocation return.
4. **Qualify actual rendering and lifecycle.** Observe Quickshell/Hyprland rendering, rapid workspace switching, named/saved-but-absent workspaces, ID-before-name precedence, scratchpad retention, per-monitor behavior, moved workspaces and available hotplug scenarios. Check same-path replacement, global/theme fallback, decode failure, lock/unlock and native background/theme IPC. Disable/re-enable and prove stock renderer restoration without deleting data. Persistence success alone does not prove rendered pixels.
5. **Fix, restore and integrate on evidence.** Fix only reproduced candidate defects, push narrow changes to the same branch, run remote checks and retest affected local scenarios on the new exact SHA. Restore personal desired mappings and desktop state without erasing later unrelated edits. Record pass/fail/not-tested with reasons, final SHA and evidence. Required failures keep this gate open. Once required cases and exact-head CI pass, the agent may merge through the repository's normal workflow, verify resulting main, and complete FDM-913/FDM-909. No release is published here.

## Installed command exercise

Use the executable from the verified candidate, or a command on PATH that resolves to that same checkout. First run `./bin/workspace-wallpapers --help` and `./bin/workspace-wallpapers --version --json`. Do not copy just the executable away from its modules.

For an existing installation without desired JSON, inspect `./bin/workspace-wallpapers config migrate --dry-run --json`, then explicitly migrate with `./bin/workspace-wallpapers config migrate --json`. Do not migrate over an existing desired file. On a fresh profile without legacy data, create the requested desired mappings instead.

Run these separately, substituting a real safe fixture path:

```bash
./bin/workspace-wallpapers assign 'id:2' '/absolute/path/to/fixture.png' --json
./bin/workspace-wallpapers config validate --json
./bin/workspace-wallpapers config apply --dry-run --json
./bin/workspace-wallpapers config apply --json
./bin/workspace-wallpapers status --json
./bin/workspace-wallpapers doctor --json
```

Configuration operations and doctor accept the same optional `--config /absolute/path/to/desired.json`; status reports the running service and does not accept that override. An alternative desired file still applies a whole map to the same service: it is not desktop isolation. Confirm its complete contents and backups before applying it.

Check `clear 'id:2'` followed by validate/dry-run/apply, including an ID/name overlap: clearing only the ID can reveal a name mapping instead of global fallback. Verify an explicitly empty first apply establishes the new applied-state authority without deleting legacy data.

Check that legacy `omarchy-shell workspace-wallpapers assign/clear/undo` calls return `use-config-cli` completion guidance and leave state unchanged. There is no remaining legacy writer. Read-only low-level status and asynchronous applied-state reload remain available.

## Timeout and recovery expectations

The CLI defaults to a 10000 ms live IPC/completion deadline, configurable from 1 to 120000 ms. The service worker separately has a 30000 ms apply watchdog and 5000 ms inspection watchdog. Increasing the CLI timeout does not increase the worker watchdog. Verify these request-only timers do not become idle polling.

After unknown completion, inspect status and establish worker liveness before any retry. A caller timing out does not imply the service canceled or rolled back. When recovery requires a fresh persisted snapshot, `omarchy-shell workspace-wallpapers reload` re-inspects applied state only; then inspect status again and require readiness plus the expected revision/hash. A raw reload invocation returning is not completion evidence. Do not run the private runtime helper directly as a configuration shortcut.

A killed writer can leave a lock/temp file. Remove only proven-abandoned operation-owned files after establishing no writer remains; never clear desired/applied JSON or the image store to remove a lock. A post-rename durability error can report `committed: true` with unknown outcome. Preserve evidence and inspect reality before changing anything further.

## Required evidence and completion boundary

Record the exact final SHA, PR/CI links, installed paths and previous revision, actual platform versions, both environments, monitor layout/scaling, relevant logs and observed pixels, and expected/actual results for every required scenario. Record unavailable hardware/session actions explicitly rather than certifying them. Do not treat headless assertions as proof of compositor behavior.

Re-run the remote commands on the candidate as needed:

```bash
node --test tests/*.test.cjs
bash -n bin/import-image
git diff --check
git diff --check origin/main...HEAD
```

Use [the agent skill](../skills/workspace-wallpapers/SKILL.md) and [configuration recipes](agent-configuration.md) for ordinary customization. Restore personal state using the recorded backup and inspected lifecycle. Returning to a previous plugin revision is not authorization to delete the new desired/applied files or assets.

**Next after this gate:** [FDM-868 — Release preparation](https://linear.app/fdamaso/issue/FDM-868), then [FDM-869 — Short exact-SHA release smoke](https://linear.app/fdamaso/issue/FDM-869), then [FDM-874 — Publication](https://linear.app/fdamaso/issue/FDM-874).

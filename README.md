# QManager-RM520N-zepret-addon

Traffic Engine add-on for [QManager-RM520N](https://github.com/dr-dolomite/QManager-RM520N) — DPI bypass for throttled video/streaming traffic via zapret's `tpws`.

**This add-on targets QManager v0.1.13 exactly.** It refuses to install on any other version. When Traffic Engine ships in an official QManager release, this add-on is obsolete.

## Installation

**Step 1 — Install QManager v0.1.13 first.** ADB or SSH into the modem and run:

```sh
curl -fsSL -o /tmp/qmanager-installer.sh \
  https://github.com/dr-dolomite/QManager-RM520N/raw/refs/heads/main/qmanager-installer.sh && \
  bash /tmp/qmanager-installer.sh
```

**Step 2 — Install the Traffic Engine add-on.** ADB or SSH into the modem and run:

```sh
curl -fsSL -o /tmp/zepret-installer.sh \
  https://github.com/carp4/QManager-RM520N-zepret-addon/raw/refs/heads/main/zepret-installer.sh && \
  sh /tmp/zepret-installer.sh
```

Then open the QManager web UI → **Local Network → Traffic Engine** (hard-refresh with Ctrl+F5) → **Install engine binary**, and follow the onboarding cards.

> **Non-interactive / scripted installs:** append `--yes` (or `-y`) to skip the confirmation prompt — plain `ssh host sh installer.sh` has no terminal to ask on and aborts cleanly without it.

> **Installing over an older version:** your current Video domains list will be preserved (installing over the top never overwrites a list you've already configured). To restore the default Video domain list, uninstall the older version first with `sh /usrdata/qmanager/zepret-addon-backup/uninstall-zepret.sh`, then run the installer again.

## Uninstall

ADB or SSH into the modem:

```sh
sh /usrdata/qmanager/zepret-addon-backup/uninstall-zepret.sh
```

Scripted runs can pass `--yes`; piping `echo 1 |` also works. Expect LAN web connections to hiccup for about 5 seconds while the engine drains.
Restores the original v0.1.13 UI and backend from the backup taken at install time.

> **Heads-up:** while the Traffic Engine is active, all LAN web traffic flows
> through the proxy on the modem — so uninstalling (or upgrading) it makes LAN
> web connections hiccup for about 5 seconds while the teardown drains.
> Everything is removed: engine binary, persisted enable state, hostlist file.

Upgrading over an existing install is safe and preserves your engine state:
an active Traffic Engine is stopped gracefully, files are replaced, and the
engine restarts automatically on the new version with the same mode/settings.
Backups taken at first install are never overwritten by upgrades, so rollback
to stock v0.1.13 stays possible at any time.

## Troubleshooting

**"Install engine binary" fails** — the message under the button names the cause. The common ones:

| Message | Cause | Remedy |
|---|---|---|
| `Install timed out…` | Download still running; the UI stops waiting before curl does | Wait a few minutes and refresh — if the binary landed, the card disappears on its own |
| `GitHub API rate-limited` | Your carrier's shared IP hit GitHub's hourly limit (60 req/hr) | Retry up to an hour later |
| `Failed to query zapret releases` | Modem can't reach github.com (blocked/filtered network) | Check modem WAN reachability to github.com |
| `Download failed` | Tarball fetch dropped mid-transfer | Press install again |
| `Checksum mismatch` | Downloaded binary doesn't match zapret's published manifest | Press install again; persistent → report it |
| `Installer exited unexpectedly` | Installer died before recording status | Re-run; persistent → grab `/tmp/qmanager_dpi_install.json` and report |
| `sudo unavailable` | The sudoers rule this addon installs isn't effective on your build | Report your exact model + firmware |

Enable state, hostlist edits, and an existing engine binary all survive reinstalling or upgrading the addon.

## Status

**v0.1.13-zepret.3 — installer observability release**: every install failure now names its cause (GitHub rate limits, unreachable network, missing curl, dead installer, sudo misconfiguration) instead of a blank "Install failed:"; live progress text under the button; liveness-aware polling so a slow download is never mistaken for a hang, and a dead one never idles to a blind timeout. Validated on RM520N-GL (T-Mobile/Verizon/AT&T test units).

**v0.1.13-zepret.2** — validated on live hardware (RM520N-GL on T-Mobile/Verizon): install, engine binary download, Masquerade and Video Optimizer modes all verified end-to-end; measured bypass uplift 9.9 → 23 Mbps throttled-link, larger on clean links.

## Development workflow

Changes land in this order — never straight to `main`:

1. **Local build + validation** (syntax checks, on-device test units)
2. **Push to `development`** — install from the branch for testing:
   `curl -fsSL .../raw/refs/heads/development/zepret-installer.sh | sh` (or `--yes`)
3. **Human sign-off** on the dev branch
4. **Merge to `main` + tag a release** — `main` always tracks the latest published version; releases are cut from it only after step 3

## Credits

The Traffic Engine is a port of [carp4's PR #11](https://github.com/dr-dolomite/QManager-RM520N/pull/11) against upstream [QManager-RM520N](https://github.com/dr-dolomite/QManager-RM520N) by [dr-dolomite](https://github.com/dr-dolomite), which this add-on layers onto. The engine itself uses [zapret](https://github.com/bol-van/zapret)'s `tpws`.

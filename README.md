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

## Uninstall

ADB or SSH into the modem:

```sh
sh /usrdata/qmanager/zepret-addon-backup/uninstall-zepret.sh
```

Restores the original v0.1.13 UI and backend from the backup taken at install time.

## Status

**v0.1.13-zepret.1 — validated on live hardware** (RM520N-GL on T-Mobile/Verizon): install, engine binary download, Masquerade and Video Optimizer modes all verified end-to-end; measured bypass uplift 9.9 → 23 Mbps throttled-link, larger on clean links.

## Credits

The Traffic Engine is a port of [carp4's PR #11](https://github.com/dr-dolomite/QManager-RM520N/pull/11) against upstream [QManager-RM520N](https://github.com/dr-dolomite/QManager-RM520N) by [dr-dolomite](https://github.com/dr-dolomite), which this add-on layers onto. The engine itself uses [zapret](https://github.com/bol-van/zapret)'s `tpws`.

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
# one-click installer — coming soon
```

Then open the QManager web UI → **Traffic Engine** in the sidebar → **Install engine binary**.

## Status

Work in progress.

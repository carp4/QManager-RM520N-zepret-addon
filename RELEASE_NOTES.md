# 🚀 QManager RM520N BETA v0.1.7

A reliability and polish release. New visibility into poller health and daemon liveness, automatic recovery for modems that boot with the radio off, a leaner curl-only HTTP transport, and a refreshed Discord Bot card with a first-class setup flow.

> One-click OTA from **System Settings → Software Update** if you're on v0.1.5 or newer. SSH/ADB is not required.

## ✨ New Features

- **SSH ready out of the box on fresh installs.** Dropbear is now installed, started, and pre-configured with a temporary root password (`qmanager`) automatically during fresh installs — so you can `ssh root@192.168.225.1` immediately without finishing web onboarding first. Your real password takes over the moment you complete first-time setup in the UI. OTA upgrades and devices that already have SSH running are left alone.
- **Auto-recovery for modems that boot with the radio off.** A new boot-time service issues `AT+CFUN=1` once at startup, so modems that occasionally come up in `CFUN=0` (radio off, no signal even though the OS is alive) recover automatically without any manual intervention. Harmless no-op for healthy boots — runs after permission setup and before the poller, so the radio is guaranteed on by the time data collection starts.
- **Cycle-budget watchdog.** The background poller now records each cycle's wall-clock time and logs a warning when one exceeds the 10-second budget. Stuck cycles that don't actually crash the daemon are now visible to anyone tailing the logs.
- **Ping-daemon liveness event.** When the ping daemon goes silent for 60+ seconds the poller now surfaces a `ping_daemon_stale` event in the activity feed instead of failing silently. Also auto-recovers when the daemon resumes.
- **Discord Bot setup is now visible at a glance.** The Discord Bot card shows onboarding progress through a four-step indicator (Token → User ID → Online → Authorized) and surfaces a distinct **Awaiting Authorization** badge when the bot is online but you haven't yet added it to your Discord account via OAuth. A successful test DM flips the badge green and confirms the bot can actually reach you — the gap between "configured" and "actually working" is no longer guesswork.

## 🛠️ Improvements

- **curl-only HTTP transport.** Removed wget from the installer, OTA updater, and runtime CGIs — QManager now uses curl exclusively. This makes installs reliable on Quectel x5x/x6x firmwares that lack wget, and avoids pulling the ~5 MB Entware wget package that previous fallbacks would have required.
- **Discord Bot card redesigned.** Adopts the standard page header and form pattern used elsewhere in the app, with skeleton loading, validation on the Discord User ID, dirty-state save gating, save/test toasts, an eye-toggle for the bot token, a refresh button in the card header, and a cleaner collapsible setup-help layout in place of the prior nested panel.
- **Alerts no longer block the poller.** Email and SMS notifications dispatch in the background, so a slow SMTP server, a stuck registration retry, or a 30-second TCP timeout can't pause data collection any more. Status reflects this within a couple of cycles either way.
- **Accurate traffic rate after slow cycles.** The bytes-per-second math now uses elapsed wall time rather than a fixed 2-second divisor, so the false 30× spikes that used to appear after a long-running scan or AT-command stall are gone.
- **Self-healing scan-in-progress flag.** The "long-running operation" marker now expires automatically after 5 minutes, so a CGI script that crashed mid-scan can no longer wedge the poller into a permanent `scan_in_progress` state.
- **Stale "optimal" no longer bleeds across cycles.** The connection status is now reset on every poll, so a transient registration loss can't leave a misleading "optimal" badge behind.
- **Faster, cheaper polling.** Carrier-aggregation parsing no longer fork-spams `cut`/`sed` for every QCAINFO line, SIM-state reads use a single `jq` call per file, and `AT+CFUN?` runs every 30 seconds instead of every 2. On slow ARM hardware this trims around 50 ms off most cycles and keeps the daemon comfortably inside its 2-second budget under CA-heavy 5G-NSA conditions.
- **No more lost events on poller restart.** Network-type, band, PCI, and CA state are now persisted to `/tmp` and restored on the next start, so a crash, OOM, or deploy no longer silently drops events that happened during the restart window. A real reboot still starts cold (events suppressed), as before.
- **Cleaner cold boots.** The poller's systemd unit now waits up to 30 seconds for `/dev/smd11` to appear before failing, ending the noisy "AT device not found" entries on the very first boot after a flash.
- **Build-time test gate.** Workstation tests, shell-syntax checks, and line-ending detection now run before every tarball is assembled, so backend regressions are caught at build time instead of after install.
- **More reliable Tailscale connect across modem variants.** The connect flow now passes `--reset` alongside `--accept-dns=false`, matching the long-standing rgmii-toolkit/SimpleAdmin convention that's been validated across PRAIRE-platform modems (RM501Q) and SDXLEMUR (RM520N-GL). Prevents flags from a previous `tailscale up` lingering into the next connect attempt and silently changing behavior.

## 📥 Installation

### Upgrading from v0.1.6

**System Settings → Software Update.** Click Download, then Install. No SSH/ADB needed. All settings preserved.

### Fresh Install

ADB or SSH into the modem and run:

```sh
curl -fsSL -o /tmp/qmanager-installer.sh \
  https://github.com/dr-dolomite/QManager-RM520N/raw/refs/heads/main/qmanager-installer.sh && \
  bash /tmp/qmanager-installer.sh
```

## 💙 Thank You

Bug reports and feature requests welcome on [GitHub Issues](https://github.com/dr-dolomite/QManager-RM520N/issues).

If QManager saves you time, consider [sponsoring on GitHub](https://github.com/sponsors/dr-dolomite) or sending GCash via Remitly to **Russel Yasol** (+639544817486).

**License:** MIT + Commons Clause — **Happy connecting!**

---

# 🚀 QManager RM520N BETA v0.1.6

A focused hotfix for **TTL & Hop Limit Configuration** on RM520N-GL. Saving TTL/HL now reflects correctly in the UI and survives a page refresh — and disabling actually disables.

> One-click OTA from **System Settings → Software Update** if you're on v0.1.5. SSH/ADB is no longer required.

## 🛠️ Fixes

- **TTL/HL save no longer resets to disabled after refresh.** The live-state reader was passing a duplicate flag that legacy iptables on RM520N-GL rejects, so the form mistakenly reported "disabled" right after a successful save. The form now mirrors the actual kernel state.
- **TTL/HL disable now fully clears the rules.** The apply path used to remove only one rule per save, so duplicate or stale rules from past changes could survive a disable and silently re-appear in the UI. The chain is now drained completely on every apply, with a hard cap to prevent runaway loops.

## 📥 Installation

### Upgrading from v0.1.5

**System Settings → Software Update.** Click Download, then Install. No SSH/ADB needed. All settings preserved.

### Fresh Install

ADB or SSH into the modem and run:

```sh
curl -fsSL -o /tmp/qmanager-installer.sh \
  https://github.com/dr-dolomite/QManager-RM520N/raw/refs/heads/main/qmanager-installer.sh && \
  bash /tmp/qmanager-installer.sh
```

### Upgrading from v0.1.4

**This one-time hop requires ADB or SSH** — the v0.1.4 update CGI lacks the sudo elevation needed to install v0.1.5+ cleanly. Run the same fresh-install command above; your settings, profiles, and password are preserved.

## 💙 Thank You

Bug reports and feature requests welcome on [GitHub Issues](https://github.com/dr-dolomite/QManager-RM520N/issues).

If QManager saves you time, consider [sponsoring on GitHub](https://github.com/sponsors/dr-dolomite) or sending GCash via Remitly to **Russel Yasol** (+639544817486).

**License:** MIT + Commons Clause — **Happy connecting!**

---

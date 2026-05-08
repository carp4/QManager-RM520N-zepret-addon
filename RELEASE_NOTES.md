# 🚀 QManager RM520N BETA v0.1.7 Draft

A reliability and polish release. Fresh installs now ship with SSH pre-configured, the poller gains a cycle-budget watchdog and ping-daemon liveness tracking, modems that boot with the radio off recover automatically, and HTTP transport is now curl-only throughout. A brand-new Discord Bot lets you check and control your modem from your phone, antenna alignment recordings now survive page reloads and reboots, and a new live System Health card surfaces CPU, memory, storage, and modem-subsystem telemetry at a glance.

> One-click OTA from **System Settings → Software Update** if you're on v0.1.5 or newer. SSH/ADB is not required.

## ✨ New Features

- **SSH ready out of the box on fresh installs.** Dropbear is now installed, started, and pre-configured with a temporary root password (`qmanager`) automatically during fresh installs — so you can `ssh root@192.168.225.1` immediately without finishing web onboarding first. Your real password takes over the moment you complete first-time setup in the UI. OTA upgrades and devices that already have SSH running are left alone.
- **Auto-recovery for modems that boot with the radio off.** A new boot-time service issues `AT+CFUN=1` once at startup, so modems that occasionally come up in `CFUN=0` (radio off, no signal even though the OS is alive) recover automatically without any manual intervention. Harmless no-op for healthy boots — runs after permission setup and before the poller, so the radio is guaranteed on by the time data collection starts.
- **Cycle-budget watchdog.** The background poller now records each cycle's wall-clock time and logs a warning when one exceeds the 10-second budget. Stuck cycles that don't actually crash the daemon are now visible to anyone tailing the logs.
- **Ping-daemon liveness event.** When the ping daemon goes silent for 60+ seconds the poller now surfaces a `ping_daemon_stale` event in the activity feed instead of failing silently. Also auto-recovers when the daemon resumes.
- **Brand-new Discord Bot.** QManager now ships with a personal Discord bot that puts modem status and control directly in your pocket. Use `/status`, `/signal`, `/bands`, `/device`, `/sim`, `/events`, and `/watchcat` to check your modem from anywhere, and `/lock-band` and `/network-mode` to reconfigure it — all from a Discord DM, no VPN required. The Bot card in Settings walks you through a four-step setup (Token → User ID → Online → Authorized), surfaces an **Awaiting Authorization** badge when the bot is running but hasn't been added to your account yet, and confirms end-to-end delivery with a test DM.
- **Antenna alignment recordings now persist across reloads and modem reboots.** Recorded angles and positions are saved locally in your browser, so you can move the modem to a new spot, reboot it, and still see your prior reference values when you come back. Each recorded slot also has a small trash icon to clear it individually without resetting the whole comparison.
- **Live System Health card.** A new card under System Settings shows the modem subsystem state, crash count, last-crashed time, CPU frequency and live utilization, memory, and `/usrdata` storage in one place — refreshing every two seconds without adding any extra load on the device. CPU and memory render as familiar percent-of-capacity gauges (matching what Activity Monitor and Task Manager show), so high load on a single-core modem is now obvious at a glance. All telemetry is sourced from the existing background poller's shared cache, so the card is essentially free to keep open.

## 🛠️ Improvements

- **Support tip link and QR code fixed.** The Support page now uses the corrected tip link target and the QR code points to the right destination, so both tap/click and scan flows work reliably.
- **curl-only HTTP transport.** Removed wget from the installer, OTA updater, and runtime CGIs — QManager now uses curl exclusively. This makes installs reliable on Quectel x5x/x6x firmwares that lack wget, and avoids pulling the ~5 MB Entware wget package that previous fallbacks would have required.
- **Documented fallback for modems without curl.** Quectel x5x/x6x firmwares (RM502/RM520/RM521) often ship without `curl` in their base image. The README's Quick Install section now shows a one-line `opkg install curl` fallback that uses the absolute `/opt/bin/curl` path to bypass the BusyBox shell's default `PATH` (which excludes `/opt/bin`). The installer also creates a `/usr/bin/curl` symlink during install so subsequent commands and OTA updates work without manual `PATH` exports.
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

If your modem has `wget` but not `curl` (common on x5x/x6x firmwares like RM502/RM520/RM521), just use `wget` to fetch the installer — preflight auto-installs `curl` from Entware so future OTA updates work (Entware must already be bootstrapped):

```sh
wget -O /tmp/qmanager-installer.sh \
  https://github.com/dr-dolomite/QManager-RM520N/raw/refs/heads/main/qmanager-installer.sh && \
  bash /tmp/qmanager-installer.sh
```

## 💙 Thank You!

Bug reports and feature requests welcome on [GitHub Issues](https://github.com/dr-dolomite/QManager-RM520N/issues).

If QManager saves you time, consider tipping with [GitHub](https://github.com/sponsors/dr-dolomite) or [PayPal](https://paypal.me/iamrusss).

<div align="center">
  <a href="https://github.com/sponsors/dr-dolomite" target="_blank">
    <img height="40" src="https://img.shields.io/badge/GitHub%20Tip-%E2%9D%A4-EA4AAA?style=for-the-badge&logo=githubsponsors&logoColor=white" alt="Tip on GitHub" />
  </a>
  <a href="https://paypal.me/iamrusss" target="_blank">
    <img height="40" src="https://img.shields.io/badge/PayPal%20Tip-00457C?style=for-the-badge&logo=paypal&logoColor=white" alt="Tip via PayPal" />
  </a>
</div>

GCash via Remitly remains available to **Russel Yasol** (+639544817486).

**License:** MIT + Commons Clause — **Happy connecting!**

---

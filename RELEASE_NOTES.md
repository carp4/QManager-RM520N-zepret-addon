# 🚀 QManager RM520N BETA v0.1.7 Draft

A reliability and polish release. Fresh installs are now SSH-ready out of the box, modems that boot with the radio off self-recover, and the poller gains a cycle-budget watchdog plus ping-daemon liveness tracking. A new **Discord Bot** puts modem status and control in your pocket, antenna alignment recordings persist across reloads and reboots, and a live **System Health** card surfaces CPU, memory, storage, and modem-subsystem telemetry at a glance. Under the hood, HTTP transport is now curl-only and the ping daemon is a Rust binary with persistent connections — typically 50–60% lower latency readings on cellular.

> One-click OTA from **System Settings → Software Update** if you're on v0.1.5 or newer. SSH/ADB is not required.

## ✨ New Features

- **New Connection Quality settings page.** A dedicated page under System Settings consolidates probe sensitivity and event thresholds in one place, so you can tune how the modem watches your link without digging through the rest of System Settings.
- **Tunable Connectivity Sensitivity.** Pick how aggressively the ping daemon checks your link: `Sensitive` (1 s probes, 6 s to fail), `Regular` (the new balanced default), `Relaxed` (previous QManager behavior), or `Quiet` (10 s probes) for battery- and data-conscious setups. The card shows live probe/fail/recover values and warns if the daemon hasn't applied your change after 30 seconds.
- **Configurable Latency & Loss Thresholds.** Recent Activities no longer floods with `High Latency` events on average cellular signal. Pick `Standard / Tolerant / Very Tolerant` per row for both latency and loss, with a "Current" readout next to each preset so you can choose by seeing where you sit. **Defaults change from 90 ms / 20 % to 250 ms / 30 %** — pick `Standard` for stricter thresholds.
- **SSH ready out of the box on fresh installs.** Dropbear is installed, started, and seeded with a temporary root password (`qmanager`) so you can `ssh root@192.168.225.1` immediately — no need to finish web onboarding first. Your real password takes over once you complete first-time setup. OTA upgrades and devices already running SSH are left alone.
- **Auto-recovery for modems that boot with the radio off.** A new boot-time service issues `AT+CFUN=1` at startup, so modems that occasionally come up in `CFUN=0` (radio off, OS alive) recover on their own. Harmless no-op for healthy boots; runs before the poller so data collection always sees the radio on.
- **Cycle-budget watchdog.** The poller now logs a warning whenever a cycle's wall-clock time exceeds the 10-second budget — stuck cycles that don't crash the daemon are finally visible.
- **Ping-daemon liveness event.** If the ping daemon goes silent for 60+ seconds, the poller surfaces a `ping_daemon_stale` event in the activity feed (and auto-clears when it resumes) instead of failing silently.
- **Brand-new Discord Bot.** A personal Discord bot puts modem status and control in your pocket. Use `/status`, `/signal`, `/bands`, `/device`, `/sim`, `/events`, and `/watchcat` to check your modem from anywhere, plus `/lock-band` and `/network-mode` to reconfigure it — all from a Discord DM, no VPN required. The Bot card in Settings walks you through a four-step setup (Token → User ID → Online → Authorized) and confirms end-to-end delivery with a test DM.
- **Antenna alignment recordings persist across reloads and reboots.** Recorded angles and positions are saved locally in your browser, so you can move the modem, reboot, and still see your reference values when you come back. Each slot also gets a trash icon to clear it individually.
- **Live System Health card.** A new card shows modem subsystem state, crash count, last-crashed time, CPU frequency and utilization, memory, and `/usrdata` storage — refreshing every two seconds with no extra load. CPU and memory render as percent-of-capacity gauges (à la Activity Monitor / Task Manager), and all data comes from the existing poller's shared cache, so it's essentially free to keep open.
- **Data Used totals and 1-second Live Traffic.** The Device Metrics card gets a new **Data Used** row showing cumulative cellular download/upload since boot. Live Traffic now ticks once per second (up from every two), driven by a tiny daemon that reads `/proc/net/dev` directly — real-time feel with zero AT-command load. The active interface is picked automatically (`rmnet_ipa0` preferred, `rmnet_data0` fallback), and totals reset cleanly when the modem subsystem restarts.

## 🛠️ Improvements

- **Support tip link and QR code fixed.** The Support page now uses the corrected tip link target and the QR code points to the right destination, so both tap/click and scan flows work reliably.
- **curl-only HTTP transport.** Removed wget from the installer, OTA updater, and runtime CGIs — QManager now uses curl exclusively. This makes installs reliable on Quectel x5x/x6x firmwares that lack wget, and avoids pulling the ~5 MB Entware wget package that previous fallbacks would have required.
- **Documented fallback for modems without curl.** Quectel x5x/x6x base images (RM502/RM520/RM521) often ship without `curl`. The README now includes a one-line `opkg install curl` fallback using the absolute `/opt/bin/curl` path (BusyBox's default `PATH` excludes `/opt/bin`), and the installer drops a `/usr/bin/curl` symlink so future commands and OTA updates Just Work.
- **Alerts no longer block the poller.** Email and SMS notifications dispatch in the background, so a slow SMTP server, a stuck registration retry, or a 30-second TCP timeout can't pause data collection any more. Status reflects this within a couple of cycles either way.
- **Accurate traffic rate after slow cycles.** The bytes-per-second math now uses elapsed wall time rather than a fixed 2-second divisor, so the false 30× spikes that used to appear after a long-running scan or AT-command stall are gone.
- **Self-healing scan-in-progress flag.** The "long-running operation" marker now expires automatically after 5 minutes, so a CGI script that crashed mid-scan can no longer wedge the poller into a permanent `scan_in_progress` state.
- **Stale "optimal" no longer bleeds across cycles.** The connection status is now reset on every poll, so a transient registration loss can't leave a misleading "optimal" badge behind.
- **Faster, cheaper polling.** Carrier-aggregation parsing no longer fork-spams `cut`/`sed` for every QCAINFO line, SIM-state reads use a single `jq` call per file, and `AT+CFUN?` runs every 30 seconds instead of every 2. On slow ARM hardware this trims around 50 ms off most cycles and keeps the daemon comfortably inside its 2-second budget under CA-heavy 5G-NSA conditions.
- **No more lost events on poller restart.** Network-type, band, PCI, and CA state are now persisted to `/tmp` and restored on the next start, so a crash, OOM, or deploy no longer silently drops events that happened during the restart window. A real reboot still starts cold (events suppressed), as before.
- **Cleaner cold boots.** The poller's systemd unit now waits up to 30 seconds for `/dev/smd11` to appear before failing, ending the noisy "AT device not found" entries on the very first boot after a flash.
- **Build-time test gate.** Workstation tests, shell-syntax checks, and line-ending detection now run before every tarball is assembled, so backend regressions are caught at build time instead of after install.
- **More reliable Tailscale connect across modem variants.** The connect flow now passes `--reset` alongside `--accept-dns=false`, matching the long-standing rgmii-toolkit/SimpleAdmin convention that's been validated across PRAIRE-platform modems (RM501Q) and SDXLEMUR (RM520N-GL). Prevents flags from a previous `tailscale up` lingering into the next connect attempt and silently changing behavior.
- **Self-cleaning web-UI firewall.** The web-UI port firewall (80/443) now lives in a dedicated `QMANAGER_FW` chain with atomic start/stop, so restarts and upgrades can't accumulate stale rules. Devices upgrading from earlier versions auto-drain leftover INPUT-direct rules on the next start — inspect with `iptables -L QMANAGER_FW -n -v`.
- **Faster, more honest ping latency.** The internet-reachability daemon is now a static Rust binary that holds one TCP connection open per probe target across cycles, so dashboard latency reflects real round-trip time instead of per-probe TCP handshake overhead (typically 50–60% lower on cellular). Also detects a new `limited` state when the carrier intercepts HTTP for billing/data-cap/activation pages, paving the way for a "Limited by carrier" badge.
- **Home dashboard 5G-SA card order fixed.** On 5G Standalone with carrier aggregation, the Secondary Carriers card now sits to the right of 5G Primary Status — matching the LTE layout. Previously the two cards were swapped, putting Secondary on the left of Primary, which broke the at-a-glance reading users were used to from 4G.
- **Sidebar dashboard layout activates earlier on tablets.** On iPad-class landscape viewports and small laptops, Device Information now docks to the right of the cellular cards as a sidebar panel from around 900 px wide (down from ~1024 px). Narrower viewports keep the clean single-column stack, so iPad Pro 11" portrait and phones are unaffected.
- **Tighter Device Information card.** The hide/show toggle for private fields (IMEI, IMSI, ICCID, phone number) moved into the card header beside the title, reclaiming a row of vertical space. Loading and live states now share the same row dividers, so the card no longer shifts when data arrives.
- **Responsive Network Events page.** Adapts cleanly across phones, tablets, and foldables: long messages wrap inside the table instead of triggering sideways scroll, the toolbar wraps to a second row when controls outgrow the card, headings scale down on narrow viewports, and tab touch targets meet the 44 px minimum. On desktop the card sits in a single column matching the rest of the layout. "Last updated" now reflects every successful poll — empty refreshes no longer leave it stuck on the previous value.

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

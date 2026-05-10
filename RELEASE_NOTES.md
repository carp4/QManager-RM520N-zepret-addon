# 🚀 QManager RM520N BETA v0.1.9-draft

> One-click OTA from **System Settings → Software Update** if you're on v0.1.5 or newer. SSH/ADB is not required.

## ✨ New Features

- **Data Used counter now survives modem reboots and rmnet driver reloads.** The previous Data Used display read directly from the kernel's `rmnet_ipa0` byte counter, which silently zeroed every time the modem subsystem reset or the data session re-attached — making the displayed total unreliable for tracking usage over days. QManager now maintains its own persistent total at `/usrdata/qmanager/data_used.json`, accumulated from the modem's own `AT+QGDCNT` (LTE) or `AT+QGDNRCNT` (5G SA / NSA) byte counters depending on the current network mode. The counter is cross-validated against the kernel counter every poll cycle and tolerates modem-side counter resets (e.g. carrier-initiated session refreshes) without losing your accumulated total. A new **Reset** button on the Device Metrics card lets you zero the counter on demand — useful for tracking usage within a specific billing window — and the dashboard surfaces both the counter source (QGDCNT vs QGDNRCNT) and the time of the last reset for transparency.

## 🛠️ Improvements

- **Live Traffic now works correctly on x5x-class modems (RM501, RM502, RG502Q).** The traffic daemon previously assumed `rmnet_ipa0` as primary and hardcoded `rmnet_data0` as the only fallback — but on devices where the active data bearer is `rmnet_data1` or higher (which varies by platform, carrier, and PDP context state), the daemon either fell back to the wrong interface or showed zeroed counters. The active interface is now auto-detected per tick by scanning `/proc/net/route` for the first `rmnet_data*` entry with a live route, cached for steady-state efficiency, and re-detected only when the cache invalidates (interface vanishes, or 5+ consecutive idle ticks). Detection is fork-free pure shell, so the per-tick cost is unchanged.

- **Connectivity status no longer gets stuck on "Offline" when internet is working.** The ping daemon was gating every probe on a hardcoded sysfs carrier file (`rmnet_data0`) — on devices where the active data bearer is `rmnet_data1` or higher, the carrier read always returned empty and the daemon skipped probing entirely, locking the UI on disconnected indefinitely. The carrier sysfs check has been removed; the daemon now relies solely on the HTTP probes to Cloudflare and Google, which is the correct and portable signal. The installer automatically cleans up any stale `CARRIER_FILE` setting left in `/etc/qmanager/environment` on upgrade.

- **OTA upgrades no longer abort on variant devices.** Users on v0.1.7 upgrading to v0.1.8 with a non-`RM520N-GL` device ID (e.g. `RM520FGL_VA`) hit a hard failure during install — the new device-compatibility prompt tried to read `/dev/tty` from a context with no controlling terminal, the read crashed, and the installer aborted with "Installation aborted by user." The installer now properly detects when no terminal is available and proceeds non-interactively with a warning, instead of dying. Headless installs (OTA worker, `curl|bash`, ADB without `-t`) work cleanly across device variants.

- **LAN Gateway now shows up on all modem variants.** Earlier builds queried the modem live on every About Device load with a compound AT command — when one half was unsupported (notably on RM501-class firmwares), the other half would silently drop too, and the LAN Gateway field stuck on `-`. The gateway is now read once at boot by the poller, cached, and reused by both the Home page Device Information card and the About Device page. Loads are instant, and the value renders correctly on RM501 alongside RM520N-GL.

- **`/dev/smd11` permissions now hold across the X55 / sdxprairie family (RM502Q-AE, RG502Q).** On these older Quectel platforms, the installer's silent `addgroup www-data dialout` failed because the local `addgroup`/`usermod` variants don't accept the "add user to group" syntax — leaving `www-data` unable to reach the modem through the `dialout` group. The CGI only worked by coincidence because something else (rgmii-toolkit or a legacy upstream fix) was leaving the device file owned by `www-data` directly. The installer now tries `addgroup`, `usermod`, and `gpasswd` in turn, verifies the result, and falls back to a direct `/etc/group` edit if every helper failed silently — and aborts loudly if even that doesn't take. It also strips any pre-existing third-party `smd11` entries from Quectel's `data_udev_rules.rules` and `data_udev_script.sh` (with one-time `.qmanager.bak` snapshots), so QManager's own udev rule is the sole writer of the device's permissions and there's no race for ownership at boot.

## 📥 Installation

### Upgrading from v0.1.8

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

Like what's new? QManager is built and maintained for free — if these updates have made your setup a little better, you can show your support via [Wise](https://wise.com/pay/business/blackcatdev?currency=USD). Every bit helps keep this project alive and growing. [GitHub Sponsors](https://github.com/sponsors/dr-dolomite) is also an option if that works better for you.

<div align="center">
  <a href="https://wise.com/pay/business/blackcatdev?currency=USD" target="_blank">
    <img height="40" src="https://img.shields.io/badge/Send%20a%20Tip%20%C2%B7%20Wise-163300?style=for-the-badge&logo=wise&logoColor=white" alt="Send a Tip · Wise" />
  </a>
</div>

**License:** MIT + Commons Clause — **Happy connecting!**

---

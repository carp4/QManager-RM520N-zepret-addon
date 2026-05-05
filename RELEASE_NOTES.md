# 🚀 QManager RM520N BETA v0.1.7

A reliability release for the modem poller — five hardening fixes that prevent the dashboard from freezing during alert delivery, eliminate misleading traffic numbers, and surface previously-silent failure modes.

> One-click OTA from **System Settings → Software Update** if you're on v0.1.5 or newer. SSH/ADB is not required.

## 🛠️ Improvements

- **Alert delivery no longer freezes the dashboard.** Email and SMS recovery notifications are now sent in the background, so a slow SMTP server or a busy modem can no longer stall modem polling for 30–90 seconds at a time.
- **Traffic rates are accurate after long or blocked cycles.** Bytes-per-second values are now calculated from real elapsed time, eliminating the false spikes that previously appeared right after any cycle that took longer than expected.
- **Stuck "scan in progress" clears itself after 5 minutes.** A stale flag left behind by a crashed scan no longer requires a reboot — the poller detects and clears it automatically.
- **Silent connectivity-monitor outages are now visible.** If the connectivity daemon stops reporting for 60 seconds while the poller is running, an event appears in the activity feed so you know alerts may have been missed rather than silently dropped.
- **Connection status is always fresh each cycle.** The dashboard's connection status is recomputed from scratch on every pass, preventing a momentarily empty sample from leaving yesterday's connection state displayed indefinitely.

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

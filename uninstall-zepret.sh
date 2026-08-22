#!/bin/sh
# =============================================================================
# QManager Traffic Engine Add-on — Uninstaller (zepret)
# -----------------------------------------------------------------------------
# Reverses zepret-installer.sh: restores the original v0.1.13 frontend and
# backend files from the backup made at install time, removes every file the
# add-on added, stops the engine.
#
# Run on the modem:  sh /usrdata/qmanager/zepret-addon-backup/uninstall-zepret.sh
# =============================================================================

set -u

BACKUP="/usrdata/qmanager/zepret-addon-backup"
WWW_DIR="/usrdata/qmanager/www"

log()  { echo "[$(date '+%H:%M:%S')] $*"; }

echo ""
echo "This removes the Traffic Engine add-on and restores your original"
echo "QManager v0.1.13 state from the install-time backup."
printf "Proceed? 1 = yes, 0 = exit\n> "
if [ -t 0 ]; then read -r A; else read -r A < /dev/tty; fi
[ "$A" = "1" ] || { echo "Aborted."; exit 0; }

# --- 1. Stop + disarm the engine ----------------------------------------------
log "Stopping engine..."
iptables -t nat -D OUTPUT -p tcp --dport 443 -m set --match-set dpi_bypass dst -j REDIRECT --to-ports 989 2>/dev/null
for i in 1 2 3; do iptables -t nat -D OUTPUT -p tcp --dport 443 -j REDIRECT --to-ports 989 2>/dev/null && break; done
pkill -f "tpws" 2>/dev/null
systemctl stop qmanager-dpi-ensure.timer qmanager-dpi-ensure.service qmanager-dpi.service 2>/dev/null
rm -f /lib/systemd/system/multi-user.target.wants/qmanager-dpi-ensure.service
rm -f /lib/systemd/system/timers.target.wants/qmanager-dpi-ensure.timer

# --- 2. Remove add-on backend files --------------------------------------------
log "Removing add-on files..."
rm -f /usr/bin/qmanager_dpi_install /usr/bin/qmanager_dpi_run /usr/bin/qmanager_dpi_verify
rm -f /usr/lib/qmanager/dpi_state.sh
rm -f "$WWW_DIR/cgi-bin/quecmanager/network/video_optimizer.sh"
rm -f /lib/systemd/system/qmanager-dpi.service \
      /lib/systemd/system/qmanager-dpi-ensure.service \
      /lib/systemd/system/qmanager-dpi-ensure.timer

# --- 3. Restore originals -------------------------------------------------------
if [ -f "$BACKUP/config.sh.orig" ]; then
    cp -f "$BACKUP/config.sh.orig" /usr/lib/qmanager/config.sh
    log "Restored config.sh"
fi
if [ -f "$BACKUP/qmanager_setup.orig" ]; then
    cp -f "$BACKUP/qmanager_setup.orig" /usr/bin/qmanager_setup
    chmod 755 /usr/bin/qmanager_setup
    log "Restored qmanager_setup"
fi
# Sudoers reversal — covers every layout the installer can produce:
#   - our drop-in /opt/etc/sudoers.d/qmanager-zepret  -> delete it
#   - appended fragment inside a monolith/drop-in     -> restore from backup
rm -f /opt/etc/sudoers.d/qmanager-zepret
if [ -f "$BACKUP/sudoers-target.txt" ]; then
    TARGET="$(cat "$BACKUP/sudoers-target.txt")"
    if [ "$TARGET" = "/opt/etc/sudoers" ] && [ -f "$BACKUP/sudoers.orig" ]; then
        cp -f "$BACKUP/sudoers.orig" /opt/etc/sudoers
        log "Restored /opt/etc/sudoers"
    fi
fi
for f in /etc/sudoers.d/qmanager /usrdata/qmanager/etc/sudoers.d/qmanager; do
    if [ -f "$BACKUP/sudoers.qmanager.orig" ] && [ -f "$f" ] && grep -q qmanager_dpi "$f"; then
        cp -f "$BACKUP/sudoers.qmanager.orig" "$f"
        log "Restored $f"
    fi
done
if [ -f "$BACKUP/www.tar.gz" ]; then
    log "Restoring original web UI (this is the slow part)..."
    rm -rf "$WWW_DIR"
    tar -xzf "$BACKUP/www.tar.gz" -C "$(dirname "$WWW_DIR")" || echo "WARNING: www restore had errors"
fi

systemctl daemon-reload 2>/dev/null
systemctl restart lighttpd 2>/dev/null

echo ""
echo "DONE. Traffic Engine add-on removed; original v0.1.13 UI restored."
echo "Hard-refresh the browser (Ctrl+F5). The backup remains at $BACKUP —"
echo "delete it once you are happy."

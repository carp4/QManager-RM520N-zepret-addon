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
# Read stdin in every context: interactive tty, `echo 1 | sh uninstall...`,
# and plain `ssh host sh ...` (closed stdin -> clean abort instead of the
# old behaviour of blocking forever on a nonexistent /dev/tty).
if [ -t 0 ]; then read -r A; else read -r A || A=""; fi
[ "$A" = "1" ] || { echo "Aborted."; exit 0; }

# --- 1. Stop + disarm the engine ----------------------------------------------
# Canonical teardown — same code path as the UI toggle. Order matters: the
# REDIRECT rule comes out FIRST (new LAN connections go direct immediately),
# then a short grace lets established flows churn to direct routes before
# tpws exits. Killing the proxy while flows are still pinned to it resets
# every proxied connection at once, which reads as "the internet went down".
log "Stopping engine..."
echo "      (LAN web connections will hiccup for about 5 seconds)"
[ -f /usr/lib/qmanager/platform.sh ] && . /usr/lib/qmanager/platform.sh 2>/dev/null || true
[ -f /usr/lib/qmanager/dpi_state.sh ] && . /usr/lib/qmanager/dpi_state.sh 2>/dev/null || true
if command -v dpi_remove_rule >/dev/null 2>&1; then
    dpi_remove_rule 2>/dev/null || true
else
    # Fallbacks cover installs old enough to predate dpi_state.sh, plus any
    # partial states (legacy OUTPUT-era rule, bare catch-all redirect).
    iptables -t nat -D OUTPUT -p tcp --dport 443 -m set --match-set dpi_bypass dst -j REDIRECT --to-ports 989 2>/dev/null
    for i in 1 2 3; do iptables -t nat -D OUTPUT -p tcp --dport 443 -j REDIRECT --to-ports 989 2>/dev/null && break; done
    for i in 1 2 3; do iptables -t nat -D PREROUTING -i bridge0 -p tcp -m multiport --dports 80,443 -j REDIRECT --to-ports 989 2>/dev/null && break; done
fi
sleep 5
if command -v svc_stop >/dev/null 2>&1; then
    svc_stop qmanager-dpi 2>/dev/null || true
fi
systemctl stop qmanager-dpi.service qmanager-dpi-ensure.timer qmanager-dpi-ensure.service 2>/dev/null
# Backstop: exact-name match so we can never kill an innocent process whose
# cmdline merely mentions tpws.
pkill -x tpws 2>/dev/null
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

# The engine binary and its persisted enable-state must go too, or a later
# reinstall silently resurrects a running engine ("already present and
# running"). qm_config_set writes enable flags to this JSON store — NOT to
# /usr/lib/qmanager/config.sh (the shell library restored below).
log "Removing engine binary and persisted state..."
rm -f /usrdata/qmanager/bin/tpws
rm -f /etc/qmanager/video_domains.txt
QM_CONF="/etc/qmanager/qmanager.conf"
if [ -f "$QM_CONF" ] && command -v jq >/dev/null 2>&1; then
    if jq 'del(.video_optimizer, .traffic_masquerade)' "$QM_CONF" > "${QM_CONF}.tmp" 2>/dev/null; then
        mv "${QM_CONF}.tmp" "$QM_CONF"
        log "Scrubbed video_optimizer/masquerade state from qmanager.conf"
    else
        rm -f "${QM_CONF}.tmp"
        echo "WARNING: could not scrub $QM_CONF — check it manually"
    fi
fi

# --- 3. Restore originals -------------------------------------------------------
if [ -f "$BACKUP/config.sh.orig" ]; then
    cp -f "$BACKUP/config.sh.orig" /usr/lib/qmanager/config.sh
    log "Restored shell library /usr/lib/qmanager/config.sh"
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

#!/bin/sh
# =============================================================================
# fix_permissions.sh — Emergency permission fix for QManager scripts
# =============================================================================
# Run this if QManager scripts are not working after a fresh install.
# Sets correct execute permissions on all QManager files.
#
# Usage: sh /tmp/fix_permissions.sh
# =============================================================================

echo "=== QManager Permission Fix ==="
echo ""

# --- CGI scripts (755) -------------------------------------------------------
if [ -d /www/cgi-bin/quecmanager ]; then
    find /www/cgi-bin/quecmanager -name "*.sh" -exec chmod 755 {} \;
    echo "[OK] CGI scripts: 755"
else
    echo "[SKIP] CGI directory not found"
fi

# --- Shared libraries (644) --------------------------------------------------
if [ -d /usr/lib/qmanager ]; then
    find /usr/lib/qmanager -maxdepth 1 -type f -exec chmod 644 {} \;
    echo "[OK] Shared libraries: 644"
else
    echo "[SKIP] Library directory not found"
fi

# --- Daemons and utilities (755) ---------------------------------------------
for f in /usr/bin/qmanager_* /usr/bin/qcmd /usr/bin/bridge_traffic_monitor_*; do
    [ -f "$f" ] && chmod 755 "$f"
done
echo "[OK] Daemons and utilities: 755"

# --- Init.d services (755) ---------------------------------------------------
for f in /etc/init.d/qmanager*; do
    [ -f "$f" ] && chmod 755 "$f"
done
echo "[OK] Init.d services: 755"

# --- Config directory (readable) ---------------------------------------------
if [ -d /etc/qmanager ]; then
    chmod 755 /etc/qmanager
    find /etc/qmanager -type f -exec chmod 644 {} \;
    echo "[OK] Config files: 644"
fi

echo ""
echo "=== Done! Restarting poller... ==="

# Restart the poller so it picks up immediately
if [ -x /etc/init.d/qmanager_poller ]; then
    /etc/init.d/qmanager_poller restart >/dev/null 2>&1
    echo "[OK] Poller restarted"
fi

echo ""
echo "Permissions fixed. Refresh the QManager dashboard."

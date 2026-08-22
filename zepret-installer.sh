#!/bin/sh
# =============================================================================
# QManager-RM520N Traffic Engine Add-on Installer (zepret)
# -----------------------------------------------------------------------------
# Layer the Traffic Engine (zapret/tpws DPI bypass) onto an EXISTING
# QManager-RM520N v0.1.13 installation.
#
# HARD CONTRACT: this add-on targets QManager v0.1.13 EXACTLY. It refuses to
# install on anything else. Once Traffic Engine ships inside an official
# QManager release, this add-on is obsolete.
#
# Run on the modem (ADB or SSH):
#   curl -fsSL -o /tmp/zepret-installer.sh \
#     https://github.com/carp4/QManager-RM520N-zepret-addon/raw/refs/heads/main/zepret-installer.sh && \
#     sh /tmp/zepret-installer.sh
# =============================================================================

set -u

ADDON_VERSION="v0.1.13-zepret.4"
REQUIRED_QMANAGER="v0.1.13"
RELEASE_BASE_DEFAULT="https://github.com/carp4/QManager-RM520N-zepret-addon/releases/download/${ADDON_VERSION}"
RELEASE_BASE="${ZEPRET_RELEASE_BASE:-$RELEASE_BASE_DEFAULT}"
TARBALL="qmanager-zepret-addon-${ADDON_VERSION}.tar.gz"
SHA256="250b7812c1fc536f41bc6864d6789d0f71d59dcb63adb26e6a0af4361878da02"

STAGE="/tmp/zepret_addon_stage"
BACKUP="/usrdata/qmanager/zepret-addon-backup"
WWW_DIR="/usrdata/qmanager/www"

log()  { echo "[$(date '+%H:%M:%S')] $*"; }
fail() { echo "ERROR: $*" >&2; exit 1; }

# --- Step 0: consent ---------------------------------------------------------
# When piped (curl | sh), stdin is the pipe — read the answer from the tty.
echo ""
echo "==============================================================="
echo " QManager Traffic Engine Add-on ${ADDON_VERSION}"
echo "==============================================================="
echo "This add-on is meant for QManager-RM520N ${REQUIRED_QMANAGER}."
echo "It adds the Traffic Engine (DPI bypass) to your existing install."
echo ""
if [ "${1:-}" = "--yes" ] || [ "${1:-}" = "-y" ]; then
    ANSWER=1
elif [ -t 0 ]; then
    printf "Do you wish to proceed?\n  1 = yes\n  0 = exit\n> "
    read -r ANSWER
else
    # Piped invocation (curl ... | sh): stdin carries the script itself, so
    # ask the controlling terminal. With NO terminal (plain `ssh host sh ...`,
    # CI), fail loudly with the escape hatch instead of blocking forever.
    printf "Do you wish to proceed?\n  1 = yes\n  0 = exit\n> "
    if ! read -r ANSWER < /dev/tty 2>/dev/null; then
        fail "cannot prompt for confirmation (no terminal) — rerun with --yes to skip this check"
    fi
fi
[ "$ANSWER" = "1" ] || { echo "Aborted."; exit 0; }

# --- Step 1: version gate ----------------------------------------------------
log "Checking QManager version..."
[ -f /etc/qmanager/VERSION ] || fail "/etc/qmanager/VERSION not found — is QManager installed?"
INSTALLED_VERSION="$(cat /etc/qmanager/VERSION)"
if [ "$INSTALLED_VERSION" != "$REQUIRED_QMANAGER" ]; then
    echo ""
    fail "QManager ${INSTALLED_VERSION} detected, but this add-on only supports ${REQUIRED_QMANAGER}.
If you are on a newer QManager, Traffic Engine may already be built in — check
Local Network in the web UI before trying any add-on."
fi
log "OK: QManager ${INSTALLED_VERSION}"

# --- Step 2: fetch + verify the payload --------------------------------------
rm -rf "$STAGE" && mkdir -p "$STAGE"
if [ -n "${ZEPRET_TARBALL:-}" ] && [ -f "$ZEPRET_TARBALL" ]; then
    # Local payload override (offline installs, testing unreleased builds).
    # The pinned-sha256 check below still applies — an override cannot skip
    # verification, only the download.
    log "Using local payload: $ZEPRET_TARBALL"
    cp -f "$ZEPRET_TARBALL" "$STAGE/$TARBALL" || fail "local payload copy failed"
else
    log "Downloading ${TARBALL}..."
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL -o "$STAGE/$TARBALL" "$RELEASE_BASE/$TARBALL" \
            || fail "download failed (curl)"
    elif command -v wget >/dev/null 2>&1; then
        wget -qO "$STAGE/$TARBALL" "$RELEASE_BASE/$TARBALL" \
            || fail "download failed (wget)"
    else
        fail "neither curl nor wget available"
    fi
fi

if [ -n "$SHA256" ]; then
    echo "$SHA256  $STAGE/$TARBALL" | sha256sum -c - >/dev/null 2>&1 \
        || fail "sha256 mismatch — refusing to install"
    log "OK: sha256 verified"
fi

tar -xzf "$STAGE/$TARBALL" -C "$STAGE" || fail "extract failed"
[ -f "$STAGE/addon/uninstall-zepret.sh" ] || fail "payload incomplete"

# --- Step 3: backup everything we will touch ---------------------------------
log "Backing up current state to $BACKUP ..."
mkdir -p "$BACKUP"
# Pristine-only snapshots: on UPGRADE (installer re-run over an existing
# install) the live files are already add-on modified — copying them again
# would taint the rollback set, and a later uninstall would then "restore"
# add-on state instead of stock v0.1.13.
[ -f "$BACKUP/config.sh.orig" ]      || cp -f /usr/lib/qmanager/config.sh "$BACKUP/config.sh.orig"       2>/dev/null
[ -f "$BACKUP/qmanager_setup.orig" ] || cp -f /usr/bin/qmanager_setup     "$BACKUP/qmanager_setup.orig" 2>/dev/null
for cand in /etc/sudoers.d/qmanager /usrdata/qmanager/etc/sudoers.d/qmanager /opt/etc/sudoers; do
    if [ -f "$cand" ] && [ ! -f "$BACKUP/sudoers.orig" ]; then
        cp -f "$cand" "$BACKUP/sudoers.orig"
    fi
done
if [ ! -f "$BACKUP/www.tar.gz" ]; then
    tar -czf "$BACKUP/www.tar.gz" -C "$(dirname "$WWW_DIR")" "$(basename "$WWW_DIR")" \
        || fail "www backup failed — aborting rather than risk an unrestorable state"
fi
# Ship the rollback tool next to the backups — the DONE banner points here.
cp -f "$STAGE/addon/uninstall-zepret.sh" "$BACKUP/uninstall-zepret.sh"
log "OK: backup complete"

# --- Step 3.5: upgrade path — stop a running engine gracefully -----------------
# A previous install may have the engine active. Overlaying files without
# stopping it leaves the OLD tpws process running stale code under replaced
# units until some arbitrary later restart. Tear down through the canonical
# helpers instead: rule out first (new LAN connections go direct immediately),
# 5s grace for established flows to churn, then stop. Remember whether it was
# active — Step 7 brings it back on the new code.
QM_CONF="/etc/qmanager/qmanager.conf"
WAS_ENGINE=0
if [ -f /usr/lib/qmanager/dpi_state.sh ] && [ -f "$QM_CONF" ]; then
    WAS_ENGINE=$(jq -r '[(.video_optimizer.enabled // 0), (.traffic_masquerade.enabled // 0)] | max' \
        "$QM_CONF" 2>/dev/null || echo 0)
fi
if [ "${WAS_ENGINE:-0}" = "1" ]; then
    # Lib-free teardown, mirroring the uninstaller verbatim. (Sourcing
    # platform.sh/dpi_state.sh here kills the shell on-device — rc=2, silent,
    # unreproducible standalone — so the helpers are inlined instead.)
    log "Running engine detected — stopping it gracefully..."
    echo "      (LAN web connections will hiccup for about 5 seconds)"
    # Rule out FIRST so new LAN connections go direct immediately; existing
    # flows keep their conntrack binding until the engine stops below.
    iptables -t nat -D PREROUTING -i bridge0 -p tcp -m multiport --dports 80,443 -j REDIRECT --to-ports 989 2>/dev/null
    for i in 1 2 3; do iptables -t nat -D OUTPUT -p tcp --dport 443 -j REDIRECT --to-ports 989 2>/dev/null && break; done
    sleep 5
    systemctl stop qmanager-dpi.service qmanager-dpi-ensure.timer qmanager-dpi-ensure.service 2>/dev/null
    pkill -x tpws 2>/dev/null
fi

# --- Step 4: backend overlay --------------------------------------------------
log "Installing backend files..."
A="$STAGE/addon"
cp -f "$A/usr/bin/qmanager_dpi_install"  /usr/bin/ && chmod 755 /usr/bin/qmanager_dpi_install
cp -f "$A/usr/bin/qmanager_dpi_run"      /usr/bin/ && chmod 755 /usr/bin/qmanager_dpi_run
cp -f "$A/usr/bin/qmanager_dpi_verify"   /usr/bin/ && chmod 755 /usr/bin/qmanager_dpi_verify
cp -f "$A/usr/lib/qmanager/dpi_state.sh" /usr/lib/qmanager/ && chmod 644 /usr/lib/qmanager/dpi_state.sh
cp -f "$A/usr/lib/qmanager/config.sh"    /usr/lib/qmanager/config.sh
cp -f "$A/usr/bin/qmanager_setup"        /usr/bin/qmanager_setup && chmod 755 /usr/bin/qmanager_setup

CGI_NET="$WWW_DIR/cgi-bin/quecmanager/network"
mkdir -p "$CGI_NET"
cp -f "$A/www/cgi-bin/quecmanager/network/video_optimizer.sh" "$CGI_NET/" && chmod 755 "$CGI_NET/video_optimizer.sh"

for u in qmanager-dpi.service qmanager-dpi-ensure.service qmanager-dpi-ensure.timer; do
    cp -f "$A/lib/systemd/system/$u" /lib/systemd/system/
done
# Boot persistence: this firmware never scans *.wants re-created by systemctl
# enable — symlink manually into the persistent units directory.
ln -sf /lib/systemd/system/qmanager-dpi-ensure.service /lib/systemd/system/multi-user.target.wants/
ln -sf /lib/systemd/system/qmanager-dpi-ensure.timer   /lib/systemd/system/timers.target.wants/

# Sudoers: locate the active mechanism — and FAIL LOUD if none is found.
# Layouts seen in the wild:
#   a) /etc/sudoers.d/qmanager            (upstream drop-in file)
#   b) Entware sudo, monolithic /opt/etc/sudoers WITH
#      "#includedir /opt/etc/sudoers.d"   -> write our own drop-in there
#   c) Entware sudo, monolithic without includedir -> append fragment
SUDOERS_TARGET=""
if [ -f /etc/sudoers.d/qmanager ]; then
    SUDOERS_TARGET="/etc/sudoers.d/qmanager"
elif [ -f /opt/etc/sudoers ] && grep -q "^#includedir /opt/etc/sudoers.d" /opt/etc/sudoers; then
    mkdir -p /opt/etc/sudoers.d
    SUDOERS_TARGET="/opt/etc/sudoers.d/qmanager-zepret"
    : > "$SUDOERS_TARGET"
elif [ -f /opt/etc/sudoers ]; then
    SUDOERS_TARGET="/opt/etc/sudoers"
fi

if [ -z "$SUDOERS_TARGET" ]; then
    fail "no sudoers mechanism found (looked for /etc/sudoers.d/qmanager and /opt/etc/sudoers).
The Traffic Engine CGI cannot escalate without it — aborting. Nothing was changed."
fi

if ! grep -q "qmanager_dpi_install" "$SUDOERS_TARGET"; then
    cat "$A/etc/sudoers-fragment.txt" >> "$SUDOERS_TARGET"
fi
echo "$SUDOERS_TARGET" > "$BACKUP/sudoers-target.txt"
log "OK: sudoers configured via $SUDOERS_TARGET"

# --- Step 5: frontend overlay -------------------------------------------------
log "Installing frontend (merged UI)..."
cp -rf "$A/out/." "$WWW_DIR/" || fail "frontend copy failed"

# --- Step 6: immediate seeds (don't wait for next boot) -----------------------
log "Seeding hostlist + runtime state files..."
touch /tmp/qmanager_dpi_install.json /tmp/qmanager_dpi_install.pid \
      /tmp/qmanager_dpi_verify.json  /tmp/qmanager_dpi_verify.pid
chown root:root /tmp/qmanager_dpi_install.json /tmp/qmanager_dpi_install.pid \
                /tmp/qmanager_dpi_verify.json  /tmp/qmanager_dpi_verify.pid
chmod 666 /tmp/qmanager_dpi_install.json /tmp/qmanager_dpi_install.pid \
          /tmp/qmanager_dpi_verify.json  /tmp/qmanager_dpi_verify.pid
if [ ! -f /etc/qmanager/video_domains.txt ]; then
    if [ -f "$A/video_domains.txt" ]; then
        cp -f "$A/video_domains.txt" /etc/qmanager/video_domains.txt
        chown www-data:www-data /etc/qmanager/video_domains.txt
        chmod 644 /etc/qmanager/video_domains.txt
    fi
fi
[ -f /etc/qmanager/video_domains_default.txt ] || \
    cp -f /etc/qmanager/video_domains.txt /etc/qmanager/video_domains_default.txt 2>/dev/null

# --- Step 7: activate ----------------------------------------------------------
log "Activating services..."
systemctl daemon-reload 2>/dev/null
# Start BOTH the timer (periodic REDIRECT re-assertion for THIS session —
# the symlink only arms it for future boots) and a first ensure pass.
systemctl start qmanager-dpi-ensure.timer 2>/dev/null
systemctl start qmanager-dpi-ensure.service 2>/dev/null

# Upgrade resume: if the engine was active before Step 3.5 stopped it,
# restart it NOW on the new code rather than waiting for ensure's first
# tick. Enabled-but-never-installed gets its stale flags scrubbed so the
# UI doesn't advertise an engine that cannot run.
if [ "${WAS_ENGINE:-0}" = "1" ]; then
    if [ -x /usrdata/qmanager/bin/tpws ]; then
        log "Restoring Traffic Engine (was active before upgrade)..."
        systemctl start qmanager-dpi.service 2>/dev/null
    else
        log "Engine was enabled but no binary installed — clearing stale flags"
        jq 'del(.video_optimizer, .traffic_masquerade)' "$QM_CONF" > "${QM_CONF}.tmp" 2>/dev/null \
            && mv "${QM_CONF}.tmp" "$QM_CONF"
    fi
fi

systemctl restart lighttpd 2>/dev/null || /etc/init.d/lighttpd restart 2>/dev/null

echo ""
echo "==============================================================="
echo " DONE — Traffic Engine add-on ${ADDON_VERSION} installed"
echo "==============================================================="
echo "Next steps:"
echo "  1. Open the QManager web UI (hard-refresh: Ctrl+F5)"
echo "  2. Local Network -> Traffic Engine"
echo "  3. Click 'Install engine binary' (downloads the pinned zapret"
echo "     release, ~200 KB) and follow the onboarding cards"
echo ""
echo "Rollback any time: sh $BACKUP/uninstall-zepret.sh"
echo "==============================================================="

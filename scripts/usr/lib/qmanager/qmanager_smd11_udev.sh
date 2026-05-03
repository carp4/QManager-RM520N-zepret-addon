#!/bin/sh
# =============================================================================
# qmanager_smd11_udev.sh — udev hook for /dev/smd11 permissions
# =============================================================================
# Invoked by /etc/udev/rules.d/99-qmanager-smd11.rules whenever the kernel
# emits an "add" event for /dev/smd11. Sets ownership to root:dialout and
# mode 660 so www-data (member of dialout) can open the device for AT
# commands via atcli_smd11.
#
# This runs in udev's minimal environment (no PATH, no controlling tty).
# Use absolute paths and avoid anything that needs stdout/stderr.
#
# Exit 0 unconditionally — udev logs RUN+= failures noisily and we do not
# want a missing /dev node (race between event and our handler) to spam the
# kernel log. The qmanager_setup oneshot covers any miss at boot.
# =============================================================================

DEVICE="/dev/smd11"

if [ -e "$DEVICE" ]; then
    /bin/chown root:dialout "$DEVICE" 2>/dev/null
    /bin/chmod 660 "$DEVICE" 2>/dev/null
fi

exit 0

#!/bin/sh
# platform.sh — Service control abstraction (RM520N-GL / systemd)
# Replaces direct /etc/init.d/* calls with systemctl equivalents.
# Adds sudo for privileged operations (lighttpd runs as www-data).

[ -n "$_PLATFORM_LOADED" ] && return 0
_PLATFORM_LOADED=1

# Map QManager service names to systemd unit names.
# Input: procd-style name (e.g., "qmanager_watchcat")
# Output: systemd unit name (e.g., "qmanager-watchcat")
_svc_unit() {
    # Convert underscores to hyphens, append .service
    printf '%s' "$1" | sed 's/_/-/g'
}

# Start a service
# Usage: svc_start qmanager_watchcat
svc_start() {
    sudo systemctl start "$(_svc_unit "$1")" 2>/dev/null
}

# Stop a service
# Usage: svc_stop qmanager_watchcat
svc_stop() {
    sudo systemctl stop "$(_svc_unit "$1")" 2>/dev/null
}

# Restart a service
# Usage: svc_restart qmanager_watchcat
svc_restart() {
    sudo systemctl restart "$(_svc_unit "$1")" 2>/dev/null
}

# Enable a service (start on boot)
# Usage: svc_enable qmanager_watchcat
svc_enable() {
    sudo systemctl enable "$(_svc_unit "$1")" 2>/dev/null
}

# Disable a service (don't start on boot)
# Usage: svc_disable qmanager_watchcat
svc_disable() {
    sudo systemctl disable "$(_svc_unit "$1")" 2>/dev/null
}

# Check if a service is enabled (boot-start)
# Usage: if svc_is_enabled qmanager_watchcat; then ...
svc_is_enabled() {
    sudo systemctl is-enabled "$(_svc_unit "$1")" >/dev/null 2>&1
}

# Check if a service is currently running
# Usage: if svc_is_running qmanager_watchcat; then ...
svc_is_running() {
    sudo systemctl is-active "$(_svc_unit "$1")" >/dev/null 2>&1
}

# Privileged command helpers — add sudo prefix for www-data context
run_iptables() {
    sudo iptables "$@"
}

run_ip6tables() {
    sudo ip6tables "$@"
}

run_reboot() {
    sudo reboot "$@"
}

#!/bin/sh
# =============================================================================
# vpn_firewall.sh — Shared VPN Firewall Zone Management
# =============================================================================
# Sourced by VPN CGI scripts (tailscale.sh, netbird.sh) to create/remove
# fw4 firewall zones for VPN interfaces. Without a dedicated zone, fw4's
# default DROP policy blocks all inbound traffic on VPN interfaces.
#
# Zones persist across reboots (stored in UCI config). Created on install/
# start, removed on uninstall.
#
# Usage:
#   . /usr/lib/qmanager/vpn_firewall.sh
#   vpn_fw_ensure_zone "tailscale" "tailscale0"
#   vpn_fw_remove_zone "tailscale"
# =============================================================================

[ -n "$_VPN_FW_LOADED" ] && return 0
_VPN_FW_LOADED=1

# Source logging if available
. /usr/lib/qmanager/qlog.sh 2>/dev/null || {
    qlog_info()  { :; }
    qlog_error() { :; }
}

# -----------------------------------------------------------------------------
# vpn_fw_zone_exists <zone_name>
#   Returns 0 if a firewall zone with the given name exists, 1 otherwise.
# -----------------------------------------------------------------------------
vpn_fw_zone_exists() {
    local name="$1" i=0
    while true; do
        val=$(uci -q get "firewall.@zone[$i].name") || break
        [ "$val" = "$name" ] && return 0
        i=$((i + 1))
    done
    return 1
}

# -----------------------------------------------------------------------------
# vpn_fw_ensure_zone <zone_name> <device>
#   Idempotent: creates firewall zone + forwarding rules if they don't exist.
#   Zone: input=ACCEPT, output=ACCEPT, forward=ACCEPT, device=<device>
#   Forwarding: <zone>→lan and lan→<zone>
# -----------------------------------------------------------------------------
vpn_fw_ensure_zone() {
    local zone_name="$1" device="$2"

    if [ -z "$zone_name" ] || [ -z "$device" ]; then
        qlog_error "vpn_fw_ensure_zone: missing zone_name or device"
        return 1
    fi

    # Already exists — nothing to do
    if vpn_fw_zone_exists "$zone_name"; then
        qlog_info "Firewall zone '$zone_name' already exists, skipping"
        return 0
    fi

    qlog_info "Creating firewall zone '$zone_name' for device '$device'"

    # Create zone
    uci add firewall zone >/dev/null
    uci set "firewall.@zone[-1].name=$zone_name"
    uci set "firewall.@zone[-1].input=ACCEPT"
    uci set "firewall.@zone[-1].output=ACCEPT"
    uci set "firewall.@zone[-1].forward=ACCEPT"
    uci set "firewall.@zone[-1].device=$device"

    # Forwarding: vpn → lan
    uci add firewall forwarding >/dev/null
    uci set "firewall.@forwarding[-1].src=$zone_name"
    uci set "firewall.@forwarding[-1].dest=lan"

    # Forwarding: lan → vpn
    uci add firewall forwarding >/dev/null
    uci set "firewall.@forwarding[-1].src=lan"
    uci set "firewall.@forwarding[-1].dest=$zone_name"

    uci commit firewall
    /etc/init.d/firewall restart >/dev/null 2>&1

    qlog_info "Firewall zone '$zone_name' created successfully"
    return 0
}

# -----------------------------------------------------------------------------
# vpn_fw_remove_zone <zone_name>
#   Removes the firewall zone and all associated forwarding rules.
#   Deletes forwarding indices in reverse order to avoid index shifting.
# -----------------------------------------------------------------------------
vpn_fw_remove_zone() {
    local zone_name="$1"

    if [ -z "$zone_name" ]; then
        qlog_error "vpn_fw_remove_zone: missing zone_name"
        return 1
    fi

    if ! vpn_fw_zone_exists "$zone_name"; then
        qlog_info "Firewall zone '$zone_name' does not exist, skipping removal"
        return 0
    fi

    qlog_info "Removing firewall zone '$zone_name'"

    # --- Remove forwarding rules (reverse order) ---
    local fwd_indices="" i=0
    while true; do
        src=$(uci -q get "firewall.@forwarding[$i].src") || break
        dest=$(uci -q get "firewall.@forwarding[$i].dest") || break
        if [ "$src" = "$zone_name" ] || [ "$dest" = "$zone_name" ]; then
            fwd_indices="$i $fwd_indices"   # prepend → builds reverse order
        fi
        i=$((i + 1))
    done

    for idx in $fwd_indices; do
        uci delete "firewall.@forwarding[$idx]" 2>/dev/null
    done

    # --- Remove zone ---
    i=0
    while true; do
        val=$(uci -q get "firewall.@zone[$i].name") || break
        if [ "$val" = "$zone_name" ]; then
            uci delete "firewall.@zone[$i]"
            break
        fi
        i=$((i + 1))
    done

    uci commit firewall
    /etc/init.d/firewall restart >/dev/null 2>&1

    qlog_info "Firewall zone '$zone_name' removed successfully"
    return 0
}

# -----------------------------------------------------------------------------
# vpn_check_other_installed <binary_name>
#   Echoes "true" if the given binary is found, "false" otherwise.
# -----------------------------------------------------------------------------
vpn_check_other_installed() {
    if command -v "$1" >/dev/null 2>&1; then
        echo "true"
    else
        echo "false"
    fi
}

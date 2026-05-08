#!/bin/sh
. /usr/lib/qmanager/cgi_base.sh
# =============================================================================
# modem-subsys.sh — CGI Endpoint: Modem Subsystem State (GET only)
# =============================================================================
# Returns sysfs-derived modem firmware health fields plus crash-log summary.
# All sysfs paths degrade gracefully when absent (RM551E compatibility).
#
# Endpoint: GET /cgi-bin/quecmanager/system/modem-subsys.sh
# Install location: /www/cgi-bin/quecmanager/system/modem-subsys.sh
# =============================================================================

qlog_init "cgi_modem_subsys"
cgi_headers
cgi_handle_options

SUBSYS_BASE="/sys/devices/platform/4080000.qcom,mss/subsys0"
RAMDUMP_DIR="/sys/devices/platform/4080000.qcom,mss/ramdump/ramdump_modem"
CRASH_LOG="/etc/qmanager/modem_crashes.json"

if [ "$REQUEST_METHOD" = "GET" ]; then

    # --- state + state_raw ---------------------------------------------------
    state_raw=""
    if [ -r "${SUBSYS_BASE}/state" ]; then
        state_raw=$(cat "${SUBSYS_BASE}/state")
    fi

    if [ -z "$state_raw" ]; then
        state="unknown"
    else
        case "$(printf '%s' "$state_raw" | tr '[:upper:]' '[:lower:]')" in
            online)  state="online"  ;;
            offline) state="offline" ;;
            crashed) state="crashed" ;;
            *)       state="unknown" ;;
        esac
    fi

    # --- crash_count ---------------------------------------------------------
    crash_count_jq="null"
    if [ -r "${SUBSYS_BASE}/crash_count" ]; then
        crash_count_val=$(cat "${SUBSYS_BASE}/crash_count")
        case "$crash_count_val" in
            *[!0-9]*) crash_count_jq="null" ;;
            *)        crash_count_jq="$crash_count_val" ;;
        esac
    fi

    # --- firmware_name -------------------------------------------------------
    firmware_name=""
    if [ -r "${SUBSYS_BASE}/firmware_name" ]; then
        firmware_name=$(cat "${SUBSYS_BASE}/firmware_name")
    fi

    # --- coredump_present ----------------------------------------------------
    # Exclude known sysfs metadata pseudo-files; look for regular files > 0 bytes.
    coredump_present="false"
    if [ -d "$RAMDUMP_DIR" ]; then
        dump_file=$(find "$RAMDUMP_DIR" -maxdepth 1 -type f -size +0 \
            ! -name dev ! -name name ! -name power \
            ! -name subsystem ! -name uevent \
            ! -name waiting_for_supplier \
            2>/dev/null | head -1)
        [ -n "$dump_file" ] && coredump_present="true"
    fi

    # --- crash log summary ---------------------------------------------------
    total_logged_crashes=0
    last_crash_at_jq="null"
    if [ -f "$CRASH_LOG" ] && [ -s "$CRASH_LOG" ]; then
        total_logged_crashes=$(jq 'length' "$CRASH_LOG" 2>/dev/null) || total_logged_crashes=0
        last_crash_at_jq=$(jq 'if length > 0 then last.ts else null end' "$CRASH_LOG" 2>/dev/null) || last_crash_at_jq="null"
    fi

    # --- uptime_seconds ------------------------------------------------------
    uptime_seconds=0
    if [ -r /proc/uptime ]; then
        uptime_raw=$(cat /proc/uptime)
        uptime_seconds=${uptime_raw%%.*}
    fi

    # --- emit JSON -----------------------------------------------------------
    # Pass nullable strings via --arg and convert to null in jq where empty.
    jq -n \
        --arg     state                "$state" \
        --arg     state_raw            "$state_raw" \
        --argjson crash_count          "$crash_count_jq" \
        --arg     firmware_name        "$firmware_name" \
        --argjson coredump_present     "$coredump_present" \
        --argjson last_crash_at        "$last_crash_at_jq" \
        --argjson total_logged_crashes "$total_logged_crashes" \
        --argjson uptime_seconds       "$uptime_seconds" \
        '{
            state:                $state,
            state_raw:            (if $state_raw == "" then null else $state_raw end),
            crash_count:          $crash_count,
            firmware_name:        (if $firmware_name == "" then null else $firmware_name end),
            coredump_present:     $coredump_present,
            last_crash_at:        $last_crash_at,
            total_logged_crashes: $total_logged_crashes,
            uptime_seconds:       $uptime_seconds
        }'

    exit 0
fi

cgi_method_not_allowed

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

    # --- cpu -----------------------------------------------------------------
    # load_1m: first field of /proc/loadavg as a JSON number via awk.
    cpu_load_1m_jq="null"
    if [ -r /proc/loadavg ]; then
        cpu_load_1m_jq=$(awk '{print $1}' /proc/loadavg)
    fi

    # core_count: nproc preferred; cpuinfo fallback.
    cpu_core_count_jq="null"
    if command -v nproc >/dev/null 2>&1; then
        cpu_core_count_jq=$(nproc)
    elif [ -r /proc/cpuinfo ]; then
        cpu_core_count_jq=$(grep -c '^processor' /proc/cpuinfo)
    fi

    CPUFREQ_BASE="/sys/devices/system/cpu/cpu0/cpufreq"
    cpu_freq_khz_jq="null"
    if [ -r "${CPUFREQ_BASE}/scaling_cur_freq" ]; then
        cpu_freq_khz_jq=$(cat "${CPUFREQ_BASE}/scaling_cur_freq")
    fi

    cpu_max_freq_khz_jq="null"
    if [ -r "${CPUFREQ_BASE}/scaling_max_freq" ]; then
        cpu_max_freq_khz_jq=$(cat "${CPUFREQ_BASE}/scaling_max_freq")
    fi

    # cpu object is null only when BOTH loadavg AND cpufreq are fully unreadable.
    if [ "$cpu_load_1m_jq" = "null" ] && [ "$cpu_freq_khz_jq" = "null" ] && [ "$cpu_max_freq_khz_jq" = "null" ]; then
        cpu_json="null"
    else
        cpu_json=$(jq -n \
            --argjson load_1m      "$cpu_load_1m_jq" \
            --argjson core_count   "$cpu_core_count_jq" \
            --argjson freq_khz     "$cpu_freq_khz_jq" \
            --argjson max_freq_khz "$cpu_max_freq_khz_jq" \
            '{load_1m:$load_1m,core_count:$core_count,freq_khz:$freq_khz,max_freq_khz:$max_freq_khz}')
    fi

    # --- memory --------------------------------------------------------------
    memory_json="null"
    if [ -r /proc/meminfo ]; then
        mem_total_kb=$(awk '/^MemTotal:/{print $2}' /proc/meminfo)
        mem_avail_kb=$(awk '/^MemAvailable:/{print $2}' /proc/meminfo)
        if [ -n "$mem_total_kb" ] && [ -n "$mem_avail_kb" ]; then
            memory_json=$(jq -n \
                --argjson total_kb     "$mem_total_kb" \
                --argjson available_kb "$mem_avail_kb" \
                '{total_kb:$total_kb,available_kb:$available_kb,used_kb:($total_kb-$available_kb)}')
        fi
    fi

    # --- storage -------------------------------------------------------------
    storage_json="null"
    df_out=$(df -P /usrdata 2>/dev/null)
    if [ $? -eq 0 ]; then
        # Second line: Filesystem Total Used Available Use% Mountpoint (POSIX -P layout)
        df_line=$(printf '%s\n' "$df_out" | awk 'NR==2{print}')
        if [ -n "$df_line" ]; then
            st_total=$(printf '%s\n' "$df_line" | awk '{print $2}')
            st_used=$(printf '%s\n' "$df_line"  | awk '{print $3}')
            st_avail=$(printf '%s\n' "$df_line" | awk '{print $4}')
            storage_json=$(jq -n \
                --argjson total_kb     "$st_total" \
                --argjson used_kb      "$st_used" \
                --argjson available_kb "$st_avail" \
                '{mount:"/usrdata",total_kb:$total_kb,used_kb:$used_kb,available_kb:$available_kb}')
        fi
    fi

    # --- emit JSON -----------------------------------------------------------
    # Pass nullable strings via --arg and convert to null in jq where empty.
    jq -n \
        --arg     state                "$state" \
        --arg     state_raw            "$state_raw" \
        --argjson crash_count          "$crash_count_jq" \
        --argjson coredump_present     "$coredump_present" \
        --argjson last_crash_at        "$last_crash_at_jq" \
        --argjson total_logged_crashes "$total_logged_crashes" \
        --argjson uptime_seconds       "$uptime_seconds" \
        --argjson cpu                  "$cpu_json" \
        --argjson memory               "$memory_json" \
        --argjson storage              "$storage_json" \
        '{
            state:                $state,
            state_raw:            (if $state_raw == "" then null else $state_raw end),
            crash_count:          $crash_count,
            coredump_present:     $coredump_present,
            last_crash_at:        $last_crash_at,
            total_logged_crashes: $total_logged_crashes,
            uptime_seconds:       $uptime_seconds,
            cpu:                  $cpu,
            memory:               $memory,
            storage:              $storage
        }'

    exit 0
fi

cgi_method_not_allowed

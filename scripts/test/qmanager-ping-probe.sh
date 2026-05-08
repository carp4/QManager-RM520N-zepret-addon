#!/bin/bash
# Workstation fixtures for the qmanager_ping real-internet probe.
# Run from repo root:  bash scripts/test/qmanager-ping-probe.sh
set -eu

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DAEMON="$REPO_ROOT/scripts/usr/bin/qmanager_ping"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

fail=0
pass_count=0
fail_count=0
ok()  { printf '  PASS  %s\n' "$1"; pass_count=$((pass_count + 1)); }
bad() { printf '  FAIL  %s\n' "$1"; fail_count=$((fail_count + 1)); fail=1; }
section() { printf '\n== %s ==\n' "$1"; }

# Extract a function from the daemon by name into a sourceable file.
# Matches "name() {" up to the matching closing "}" at column 0.
extract_fn() {
    local name="$1" src="$2" out="$3"
    awk -v name="$name" '
        $0 ~ "^"name"\\(\\) \\{" { in_fn=1 }
        in_fn { print }
        in_fn && /^\}/ { exit }
    ' "$src" > "$out"
}

# ---------------------------------------------------------------------------
section "carrier_is_up — returns 0 when sysfs file contains 1"

extract_fn carrier_is_up "$DAEMON" "$work/carrier_fn.sh"

# Build a fake sysfs file
fake_up="$work/carrier_up"
fake_dn="$work/carrier_dn"
echo 1 > "$fake_up"
echo 0 > "$fake_dn"

result=$(
    set +eu
    CARRIER_FILE="$fake_up"
    . "$work/carrier_fn.sh"
    if carrier_is_up; then echo "up"; else echo "down"; fi
)
case "$result" in
    up) ok "carrier_is_up returns 0 when file contains '1'" ;;
    *)  bad "carrier_is_up returned wrong status for up: '$result'" ;;
esac

result=$(
    set +eu
    CARRIER_FILE="$fake_dn"
    . "$work/carrier_fn.sh"
    if carrier_is_up; then echo "up"; else echo "down"; fi
)
case "$result" in
    down) ok "carrier_is_up returns 1 when file contains '0'" ;;
    *)    bad "carrier_is_up returned wrong status for down: '$result'" ;;
esac

result=$(
    exec 2>/dev/null
    set +eu
    CARRIER_FILE="$work/does_not_exist"
    . "$work/carrier_fn.sh"
    if carrier_is_up; then echo "up"; else echo "down"; fi
)
case "$result" in
    down) ok "carrier_is_up returns 1 when file is missing" ;;
    *)    bad "carrier_is_up returned wrong status for missing file: '$result'" ;;
esac

# ---------------------------------------------------------------------------
section "write_cache — printf JSON parses with identical scalar fields"

# Source the function. write_cache reads several globals that the loop
# normally maintains; we set them explicitly here.
extract_fn write_cache "$DAEMON" "$work/wc_fn.sh"

result_file="$work/cache.json"
(
    set +eu
    CACHE_FILE="$result_file"
    CACHE_TMP="$result_file.tmp"
    PING_TARGET_1="http://www.gstatic.com/generate_204"
    PING_TARGET_2="http://cp.cloudflare.com/"
    PING_INTERVAL=5
    RECOVERY_FLAG="$work/__no_such_flag__"
    streak_success=12
    streak_fail=0
    reachable="true"
    . "$work/wc_fn.sh"
    write_cache "185.0"
)

# Validate it parses
if ! jq -e . "$result_file" >/dev/null 2>&1; then
    bad "write_cache did not produce valid JSON"
    cat "$result_file"
else
    ok "write_cache produced valid JSON"
fi

# Validate scalars and types
check_field() {
    local field="$1" expected="$2" got
    got=$(jq -r "$field" "$result_file" 2>/dev/null)
    if [ "$got" = "$expected" ]; then
        ok "$field == $expected"
    else
        bad "$field expected '$expected' got '$got'"
    fi
}

check_field '.targets[0]' 'http://www.gstatic.com/generate_204'
check_field '.targets[1]' 'http://cp.cloudflare.com/'
check_field '.interval_sec' '5'
check_field '.last_rtt_ms' '185.0'
check_field '.reachable' 'true'
check_field '.streak_success' '12'
check_field '.streak_fail' '0'
check_field '.during_recovery' 'false'

# during_recovery flips when RECOVERY_FLAG file exists
recovery_file="$work/recovery_flag"
touch "$recovery_file"
(
    set +eu
    CACHE_FILE="$result_file"
    CACHE_TMP="$result_file.tmp"
    PING_TARGET_1="x"; PING_TARGET_2="y"; PING_INTERVAL=5
    RECOVERY_FLAG="$recovery_file"
    streak_success=1; streak_fail=0; reachable="true"
    . "$work/wc_fn.sh"
    write_cache "null"
)
if [ "$(jq -r '.during_recovery' "$result_file")" = "true" ]; then
    ok "during_recovery=true when recovery flag file exists"
else
    bad "during_recovery did not flip with recovery flag"
fi

# null RTT must be JSON null (not the string "null")
if [ "$(jq -r '.last_rtt_ms | type' "$result_file")" = "null" ]; then
    ok "last_rtt_ms=null is JSON null type, not string"
else
    bad "last_rtt_ms type wrong: $(jq -r '.last_rtt_ms | type' "$result_file")"
fi

# ---------------------------------------------------------------------------
section "do_real_internet_probe — success and failure paths"

extract_fn do_real_internet_probe "$DAEMON" "$work/probe_fn.sh"

# Stub curl: writes "<code> <time_total>" to stdout based on $STUB_BODY/$STUB_EXIT.
mkdir -p "$work/bin"

cat > "$work/bin/curl" <<'STUB'
#!/bin/sh
# Stub returns the canned response captured in $STUB_BODY (default: 204 0.180000).
# Use no-colon form so empty STUB_BODY="" emits nothing (not the default).
[ -n "$STUB_BODY" ] && echo "$STUB_BODY" || echo "204 0.180000"
exit "${STUB_EXIT:-0}"
STUB
chmod +x "$work/bin/curl"

# Case 1: 204 + 180ms → success, RTT="180.0"
result=$(
    set +eu
    PATH="$work/bin:$PATH"
    STUB_BODY="204 0.180000"
    STUB_EXIT=0
    export STUB_BODY STUB_EXIT
    . "$work/probe_fn.sh"
    do_real_internet_probe "http://example/204"
    echo "exit=$?"
)
echo "$result" | grep -q '^180\.0$' && ok "200ms 204 → emits '180.0'" || bad "204 RTT extraction wrong: $result"
echo "$result" | grep -q '^exit=0$' && ok "204 → returns 0" || bad "204 did not return 0: $result"

# Case 2: HTTP 200 (captive-portal style) → failure
result=$(
    set +eu
    PATH="$work/bin:$PATH"
    STUB_BODY="200 0.040000"
    STUB_EXIT=0
    export STUB_BODY STUB_EXIT
    . "$work/probe_fn.sh"
    do_real_internet_probe "http://portal/login"
    echo "exit=$?"
)
echo "$result" | grep -q '^exit=1$' && ok "200 (captive portal) → returns 1" || bad "200 did not return 1: $result"
echo "$result" | grep -qE '^[0-9]' && bad "200 emitted RTT (should be silent on failure)" || ok "200 → no RTT on stdout"

# Case 3: curl exit non-zero (DNS fail, timeout) → failure
result=$(
    set +eu
    PATH="$work/bin:$PATH"
    STUB_BODY=""
    STUB_EXIT=28
    export STUB_BODY STUB_EXIT
    . "$work/probe_fn.sh"
    do_real_internet_probe "http://timeout/204"
    echo "exit=$?"
)
echo "$result" | grep -q '^exit=1$' && ok "curl timeout → returns 1" || bad "timeout did not return 1: $result"

# Case 4: 204 + tiny time → emits "0.1" (rounded)
result=$(
    set +eu
    PATH="$work/bin:$PATH"
    STUB_BODY="204 0.000123"
    STUB_EXIT=0
    export STUB_BODY STUB_EXIT
    . "$work/probe_fn.sh"
    do_real_internet_probe "http://example/204"
    echo "exit=$?"
)
echo "$result" | grep -q '^0\.1$' && ok "0.000123s → emits '0.1' (rounded)" || bad "tiny RTT formatting wrong: $result"

# ---------------------------------------------------------------------------
printf '\nResult: %d pass, %d fail\n' "$pass_count" "$fail_count"
exit "$fail"

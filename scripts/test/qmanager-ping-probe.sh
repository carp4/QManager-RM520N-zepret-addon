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
printf '\nResult: %d pass, %d fail\n' "$pass_count" "$fail_count"
exit "$fail"

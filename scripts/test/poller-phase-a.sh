#!/bin/bash
# Workstation fixtures for the poller Phase A hardening patches.
# Run from the repo root:  bash scripts/test/poller-phase-a.sh
#
# Each test builds an isolated fixture under $work, sources the shell module
# under test, invokes the function, and asserts on side-effect files.
set -eu

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

fail=0
pass_count=0
fail_count=0

ok()   { printf '  PASS  %s\n' "$1"; pass_count=$((pass_count + 1)); }
bad()  { printf '  FAIL  %s\n' "$1"; fail_count=$((fail_count + 1)); fail=1; }

section() { printf '\n== %s ==\n' "$1"; }

# --- Placeholder self-check — real fixture tests start in Task 2 ---
section "harness self-check"
if [ -d "$REPO_ROOT/scripts/usr/lib/qmanager" ]; then
    ok "qmanager library directory found"
else
    bad "qmanager library directory missing"
fi

section "service_status resets when entry conditions ambiguous"

# Source only the function under test by extracting it. The poller is a
# daemon, not a library, so we can't `source` it directly — we shim
# qlog_* helpers and define the globals the function reads.
shim="$work/svc_shim.sh"
cat > "$shim" <<'SHIM'
qlog_state_change() { :; }
qlog_info() { :; }
qlog_warn() { :; }
modem_reachable=true
t2_sim_status=ready
lte_state=connected
nr_state=inactive
lte_rsrp=
nr_rsrp=
service_status="optimal"   # stale value from previous cycle
SHIM

# Extract the determine_service_status function body.
awk '/^determine_service_status\(\)/,/^\}/' \
    "$REPO_ROOT/scripts/usr/bin/qmanager_poller" > "$work/svc_fn.sh"

# Run in a subshell so globals don't leak.
result=$(
    set +eu
    . "$shim"
    . "$work/svc_fn.sh"
    determine_service_status
    echo "$service_status"
)

# After the fix: with empty rsrp values, status must NOT remain "optimal"
# carried from the previous cycle. It should reset to a safe default.
case "$result" in
    connected) ok "service_status resolved to 'connected' (registered, no RSRP yet)" ;;
    optimal)   bad "service_status carried stale 'optimal' across cycle" ;;
    *)         bad "service_status unexpected: '$result' (expected 'connected')" ;;
esac

printf '\n%d passed, %d failed\n' "$pass_count" "$fail_count"
[ "$fail" -eq 0 ] || exit 1
echo "ALL PASS"

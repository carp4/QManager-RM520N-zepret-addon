#!/bin/bash
# Workstation fixtures for the poller Phase B+C hardening patches.
# Run from the repo root:  bash scripts/test/poller-phase-bcd.sh
#
# Each test builds an isolated fixture under $work, sources the shell module
# under test, invokes the function, and asserts on side-effect files or vars.
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

# --- Self-check (real fixtures land in subsequent tasks) ---
section "harness self-check"
if [ -d "$REPO_ROOT/scripts/usr/lib/qmanager" ]; then
    ok "qmanager library directory found"
else
    bad "qmanager library directory missing"
fi

section "CFUN polling moved to Tier 2 cadence"

poller_src="$REPO_ROOT/scripts/usr/bin/qmanager_poller"

# Extract the body of poll_cycle().
pc_body=$(awk '/^poll_cycle\(\)/,/^\}/' "$poller_src")

# Split into "before the Tier 2 block" vs "Tier 2 block onward".
pre_tier2=$(printf '%s\n' "$pc_body" | awk '/# Tier 2 \(/ { exit } { print }')
tier2_on=$(printf '%s\n' "$pc_body" | awk 'f { print } /# Tier 2 \(/ { f=1; print }')

if printf '%s\n' "$pre_tier2" | grep -q 'AT+CFUN?'; then
    bad "AT+CFUN? still runs on every cycle (found before Tier 2 block)"
else
    ok "AT+CFUN? no longer runs on every cycle"
fi

if printf '%s\n' "$tier2_on" | grep -q 'AT+CFUN?'; then
    ok "AT+CFUN? lives inside the Tier 2 block"
else
    bad "AT+CFUN? not found in Tier 2 block — was it removed entirely?"
fi

printf '\n%d passed, %d failed' "$pass_count" "$fail_count"
if [ "$fail" -eq 0 ]; then
    printf ', ALL PASS\n'
    exit 0
else
    printf ', FAILURES\n'
    exit 1
fi

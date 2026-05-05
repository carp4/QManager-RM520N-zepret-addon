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

printf '\n%s passed, %s failed' "$pass_count" "$fail_count"
if [ $fail -eq 0 ]; then
    printf ', ALL PASS\n'
    exit 0
else
    printf ', FAILURES\n'
    exit 1
fi

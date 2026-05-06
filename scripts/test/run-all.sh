#!/bin/bash
# Pre-build test gate for QManager. Runs:
#   1. bash -n syntax check across daemon, library, CGI, and test scripts
#   2. CRLF detector (warn-only)
#   3. Every harness in scripts/test/*.sh (auto-discovered)
#
# Exits non-zero on first failing check (CRLF section never fails).
# Run from repo root via `bash scripts/test/run-all.sh` or as part of
# `bun run package`.
set -eu

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# Output helpers — same shape as the existing harnesses.
section() { printf '\n== %s ==\n' "$1"; }
ok()      { printf '  PASS  %s\n' "$1"; }
bad()     { printf '  FAIL  %s\n' "$1"; }
warn()    { printf '  WARN  %s\n' "$1"; }

# === Section 1: bash -n syntax check ===
section "bash -n syntax check"

# File list. Extension-less daemons in /usr/bin/, library .sh in /usr/lib/qmanager/,
# CGI handlers in /www/cgi-bin/quecmanager/, and the harnesses themselves.
list_scripts() {
    ls "$REPO_ROOT/scripts/usr/bin/"* 2>/dev/null || true
    ls "$REPO_ROOT/scripts/usr/lib/qmanager/"*.sh 2>/dev/null || true
    find "$REPO_ROOT/scripts/www/cgi-bin/quecmanager" -type f -name '*.sh' 2>/dev/null || true
    ls "$REPO_ROOT/scripts/test/"*.sh 2>/dev/null || true
}

syntax_failed=0
syntax_total=0
while IFS= read -r f; do
    [ -z "$f" ] && continue
    [ -f "$f" ] || continue
    syntax_total=$((syntax_total + 1))
    if ! err=$(bash -n "$f" 2>&1); then
        bad "$f"
        printf '%s\n' "$err" | sed 's/^/    /'
        syntax_failed=$((syntax_failed + 1))
    fi
done < <(list_scripts)

if [ "$syntax_failed" -gt 0 ]; then
    bad "$syntax_failed of $syntax_total scripts have syntax errors"
    printf '\ngate FAIL: bash -n syntax check\n'
    exit 1
fi
ok "$syntax_total scripts parsed cleanly"

# === Section 3: workstation harnesses ===
# (Sections 1 and 2 land in subsequent tasks.)
for harness in "$REPO_ROOT/scripts/test/"*.sh; do
    [ -f "$harness" ] || continue
    name=$(basename "$harness")
    case "$name" in run-all.sh) continue ;; esac
    rel="scripts/test/$name"
    section "$rel"
    if ! bash "$harness"; then
        printf '\ngate FAIL: %s\n' "$rel"
        exit 1
    fi
done

printf '\ngate PASS\n'

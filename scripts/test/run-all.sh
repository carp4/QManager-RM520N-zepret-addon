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

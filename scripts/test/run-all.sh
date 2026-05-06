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

START_TIME=$(date +%s)

# TTY-detected color and glyph helpers — mirrors build.sh convention.
if [ -t 1 ]; then
    GREEN='\033[0;32m' RED='\033[0;31m' YELLOW='\033[0;33m'
    BOLD='\033[1m' DIM='\033[2m' NC='\033[0m'
    GLYPH_OK='\xe2\x9c\x93'    # ✓
    GLYPH_FAIL='\xe2\x9c\x97'  # ✗
    GLYPH_WARN='\xe2\x9a\xa0'  # ⚠
    HRULE='\xe2\x94\x81'       # ━ (heavy horizontal)
    BOX_TL='\xe2\x94\x8c' BOX_TR='\xe2\x94\x90'
    BOX_BL='\xe2\x94\x94' BOX_BR='\xe2\x94\x98'
    BOX_H='\xe2\x94\x80'  BOX_V='\xe2\x94\x82'
else
    GREEN='' RED='' YELLOW='' BOLD='' DIM='' NC=''
    GLYPH_OK='[OK]' GLYPH_FAIL='[FAIL]' GLYPH_WARN='[WARN]'
    HRULE='='
    BOX_TL='+' BOX_TR='+' BOX_BL='+' BOX_BR='+' BOX_H='-' BOX_V='|'
fi

# Status trackers populated by each section; consumed by the summary block.
gate_failed=0
gate_failed_at=""
syntax_total=0
crlf_count=0
crlf_summary=""
status_glyph_syntax=""
status_glyph_crlf=""
status_glyph_harn=""
harness_pass=0
harness_total=0

# _repeat <byte-string> <count> — emits the byte string N times via printf '%b'.
_repeat() {
    local i=0
    while [ "$i" -lt "$2" ]; do
        printf '%b' "$1"
        i=$((i + 1))
    done
}

# Output helpers — colored + glyph variants. Falls back to ASCII on non-TTY.
section() {
    local title="$1"
    local pad=$((58 - ${#title}))
    [ "$pad" -lt 4 ] && pad=4
    printf "\n${BOLD}%b%b %s %b${NC}\n" \
        "$HRULE" "$HRULE" "$title" "$(_repeat "$HRULE" "$pad")"
}
ok()   { printf "  ${GREEN}%b${NC} %s\n"  "$GLYPH_OK"   "$1"; }
bad()  { printf "  ${RED}%b${NC} %s\n"    "$GLYPH_FAIL" "$1"; }
warn() { printf "  ${YELLOW}%b${NC} %s\n" "$GLYPH_WARN" "$1"; }

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

# === Section 2: CRLF detector (warn-only) ===
section "CRLF check (warn-only)"

# Tarball-bound files most sensitive to CRLF: shell scripts, systemd units,
# sudoers rules. The installer normalizes these on-device, so this section
# never fails the gate — it just nudges the operator to fix their editor.
list_crlf_candidates() {
    # -U: binary mode — prevents MSYS2/Windows grep from stripping \r before matching.
    # -I: skip binary files (e.g. .ipk, compiled objects).  Both flags are safe on Linux.
    grep -rUIl $'\r' "$REPO_ROOT/scripts" \
        --include='*.sh' --include='*.service' --include='*.rules' \
        2>/dev/null || true
    # Extension-less daemon scripts in scripts/usr/bin/.
    for f in "$REPO_ROOT/scripts/usr/bin/"*; do
        [ -f "$f" ] || continue
        if grep -qUI $'\r' "$f" 2>/dev/null; then
            printf '%s\n' "$f"
        fi
    done
    # sudoers.d/ files (unconventional extensions).
    find "$REPO_ROOT/scripts" -path '*/sudoers.d/*' -type f 2>/dev/null \
        | while IFS= read -r f; do
            [ -f "$f" ] || continue
            if grep -qUI $'\r' "$f" 2>/dev/null; then
                printf '%s\n' "$f"
            fi
        done
}

crlf_files=$(list_crlf_candidates | sort -u)

if [ -n "$crlf_files" ]; then
    crlf_count=$(printf '%s\n' "$crlf_files" | wc -l | tr -d ' ')
    warn "CRLF line endings found in $crlf_count file(s):"
    printf '%s\n' "$crlf_files" | sed 's/^/    /'
    warn "Set your editor to LF — installer normalizes on-device, but this is a misconfig signal."
else
    ok "no CRLF detected"
fi

# === Section 3: workstation harnesses ===
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

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
# Per-mode border-H counts size the summary box so top/bottom borders match
# the row content width (which differs because non-TTY glyphs like "[WARN]"
# are wider than TTY's 1-cell ✓/⚠/✗).
if [ -t 1 ]; then
    GREEN='\033[0;32m' RED='\033[0;31m' YELLOW='\033[0;33m'
    BOLD='\033[1m' DIM='\033[2m' NC='\033[0m'
    GLYPH_OK='\xe2\x9c\x93'    # ✓ (1 cell)
    GLYPH_FAIL='\xe2\x9c\x97'  # ✗ (1 cell)
    GLYPH_WARN='\xe2\x9a\xa0'  # ⚠ (1 cell)
    HRULE='\xe2\x94\x81'       # ━ (heavy horizontal)
    BOX_TL='\xe2\x94\x8c' BOX_TR='\xe2\x94\x90'
    BOX_BL='\xe2\x94\x94' BOX_BR='\xe2\x94\x98'
    BOX_H='\xe2\x94\x80'  BOX_V='\xe2\x94\x82'
    _BOX_TOP_H=29   # row inner width 41 - 2 lead H - " Summary " (9) = 30 -1 for symmetry → 29
    _BOX_BOT_H=40   # row inner width 41 - 1 (BL) ... = 40
else
    GREEN='' RED='' YELLOW='' BOLD='' DIM='' NC=''
    # Pad to uniform 6-char width so rows align: "[OK]  " "[FAIL]" "[WARN]"
    GLYPH_OK='[OK]  ' GLYPH_FAIL='[FAIL]' GLYPH_WARN='[WARN]'
    HRULE='='
    BOX_TL='+' BOX_TR='+' BOX_BL='+' BOX_BR='+' BOX_H='-' BOX_V='|'
    _BOX_TOP_H=34   # +5 over TTY because non-TTY glyph is 6 chars vs 1
    _BOX_BOT_H=45
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

# _render_summary_box — final summary table.  Reads status_glyph_*, syntax_total,
# crlf_summary, harness_pass, harness_total.  Always called from the final-block path.
_render_summary_box() {
    printf "  ${DIM}%b%b%b Summary %b%b${NC}\n" \
        "$BOX_TL" "$BOX_H" "$BOX_H" "$(_repeat "$BOX_H" "$_BOX_TOP_H")" "$BOX_TR"
    printf "  ${DIM}%b${NC}  %b ${DIM}%-18s${NC} %16s ${DIM}%b${NC}\n" \
        "$BOX_V" "$status_glyph_syntax" "Syntax check" "$syntax_total scripts" "$BOX_V"
    printf "  ${DIM}%b${NC}  %b ${DIM}%-18s${NC} %16s ${DIM}%b${NC}\n" \
        "$BOX_V" "$status_glyph_crlf"   "CRLF check"   "$crlf_summary" "$BOX_V"
    printf "  ${DIM}%b${NC}  %b ${DIM}%-18s${NC} %16s ${DIM}%b${NC}\n" \
        "$BOX_V" "$status_glyph_harn"   "Harnesses"    "$harness_pass/$harness_total pass" "$BOX_V"
    printf "  ${DIM}%b%b%b${NC}\n\n" "$BOX_BL" "$(_repeat "$BOX_H" "$_BOX_BOT_H")" "$BOX_BR"
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
# /usr/bin/ may contain compiled binaries (e.g. qmanager_discord) alongside
# shell scripts — only emit files whose first two bytes are '#!' (shebang).
list_scripts() {
    for f in "$REPO_ROOT/scripts/usr/bin/"*; do
        [ -f "$f" ] || continue
        head -c 2 "$f" 2>/dev/null | grep -q '^#!' && printf '%s\n' "$f"
    done
    ls "$REPO_ROOT/scripts/usr/lib/qmanager/"*.sh 2>/dev/null || true
    find "$REPO_ROOT/scripts/www/cgi-bin/quecmanager" -type f -name '*.sh' 2>/dev/null || true
    ls "$REPO_ROOT/scripts/test/"*.sh 2>/dev/null || true
}

syntax_failed=0
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
    status_glyph_syntax="$GLYPH_FAIL"
    gate_failed=1
    gate_failed_at="bash -n syntax check"
    elapsed=$(($(date +%s) - START_TIME))
    printf "\n  ${RED}${BOLD}%b gate FAIL: %s${NC} ${DIM}(${elapsed}s)${NC}\n\n" \
        "$GLYPH_FAIL" "$gate_failed_at"
    exit 1
fi
ok "$syntax_total scripts parsed cleanly"
status_glyph_syntax="$GLYPH_OK"

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
    status_glyph_crlf="$GLYPH_WARN"
    crlf_summary="$crlf_count warnings"
else
    ok "no CRLF detected"
    status_glyph_crlf="$GLYPH_OK"
    crlf_summary="clean"
fi

# === Section 3: workstation harnesses ===
# First pass: count discoverable harnesses (excluding run-all.sh itself).
for harness in "$REPO_ROOT/scripts/test/"*.sh; do
    [ -f "$harness" ] || continue
    case "$(basename "$harness")" in run-all.sh) continue ;; esac
    harness_total=$((harness_total + 1))
done

# Second pass: actually run them.
for harness in "$REPO_ROOT/scripts/test/"*.sh; do
    [ -f "$harness" ] || continue
    name=$(basename "$harness")
    case "$name" in run-all.sh) continue ;; esac
    rel="scripts/test/$name"
    section "$rel"
    if ! bash "$harness"; then
        status_glyph_harn="$GLYPH_FAIL"
        gate_failed=1
        gate_failed_at="$rel"
        elapsed=$(($(date +%s) - START_TIME))
        printf "\n  ${RED}${BOLD}%b gate FAIL: %s${NC} ${DIM}(${elapsed}s)${NC}\n\n" \
            "$GLYPH_FAIL" "$gate_failed_at"
        _render_summary_box
        exit 1
    fi
    harness_pass=$((harness_pass + 1))
done

if [ "$harness_total" -gt 0 ] && [ "$harness_total" -eq "$harness_pass" ]; then
    status_glyph_harn="$GLYPH_OK"
fi

elapsed=$(($(date +%s) - START_TIME))
printf "\n  ${GREEN}${BOLD}%b gate PASS${NC} ${DIM}(${elapsed}s)${NC}\n\n" "$GLYPH_OK"
_render_summary_box

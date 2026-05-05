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

section "read_sim_state coalesces jq calls per file"

# Extract read_sim_state into an isolated file we can source.
awk '/^read_sim_state\(\)/,/^\}/' "$REPO_ROOT/scripts/usr/bin/qmanager_poller" \
    > "$work/sim_fn.sh"

# Build fixture flag files.
swap_file="$work/sim_swap.json"
fo_file="$work/sim_failover.json"
cat > "$swap_file" <<'JSON'
{
  "dismissed": false,
  "matching_profile_id": "prof-42",
  "matching_profile_name": "Home APN"
}
JSON
cat > "$fo_file" <<'JSON'
{
  "active": true,
  "original_slot": 1,
  "current_slot": 2,
  "switched_at": 1746500000
}
JSON

# Counting jq shim — installs a fake `jq` ahead of the real one on PATH.
shim_dir="$work/bin"
mkdir -p "$shim_dir"
jq_real=$(command -v jq 2>/dev/null || true)
if [ -z "$jq_real" ]; then
    printf '  SKIP  read_sim_state (jq not available on workstation)\n'
else
    counter="$work/jq_count"
    : > "$counter"
    cat > "$shim_dir/jq" <<SHIM
#!/bin/sh
printf 'x' >> "$counter"
exec "$jq_real" "\$@"
SHIM
    chmod +x "$shim_dir/jq"

    result=$(
        set +eu
        export PATH="$shim_dir:$PATH"
        SIM_SWAP_FLAG="$swap_file"
        SIM_FAILOVER_FILE="$fo_file"
        . "$work/sim_fn.sh"
        read_sim_state
        printf '%s|%s|%s|%s|%s|%s|%s\n' \
            "$sim_swap_detected" "$sim_swap_profile_id" "$sim_swap_profile_name" \
            "$sim_fo_active" "$sim_fo_original_slot" "$sim_fo_current_slot" \
            "$sim_fo_switched_at"
    )

    jq_calls=$(wc -c < "$counter" | tr -d ' ')

    case "$result" in
        "true|prof-42|Home APN|true|1|2|1746500000")
            ok "read_sim_state populated all 7 fields correctly"
            ;;
        *)
            bad "read_sim_state output mismatch: '$result'"
            ;;
    esac

    if [ "$jq_calls" -le 2 ]; then
        ok "read_sim_state used $jq_calls jq invocation(s) (≤2)"
    else
        bad "read_sim_state used $jq_calls jq invocations (expected ≤2)"
    fi
fi

section "parse_ca_info uses IFS field splitting (no per-line cut storm)"

jq_real=$(command -v jq 2>/dev/null || true)
if [ -z "$jq_real" ]; then
    printf '  SKIP  parse_ca_info (jq not available on workstation)\n'
else
    # Source the parser library. It defines parse_ca_info, _lte_rb_to_mhz,
    # _nr_bw_to_mhz, and uses helper variables we have to provide.
    source_lib="$REPO_ROOT/scripts/usr/lib/qmanager/parse_at.sh"

    # Counting cut shim.
    shim_dir="$work/bin_pca"
    mkdir -p "$shim_dir"
    cut_real=$(command -v cut)
    counter="$work/cut_count"
    : > "$counter"
    cat > "$shim_dir/cut" <<SHIM
#!/bin/sh
printf 'x' >> "$counter"
exec "$cut_real" "\$@"
SHIM
    chmod +x "$shim_dir/cut"

    # Sample QCAINFO output: 1 LTE PCC + 1 LTE SCC + 1 NR SCC long form.
    sample_raw=$'+QCAINFO: "PCC",1350,75,"LTEBAND3",,135,-100,-12,-72,5\n+QCAINFO: "SCC",350,100,"LTEBAND7",1,200,-105,-13,-75,4\n+QCAINFO: "SCC",647424,3,"NR5GBAND78",1,500,0,0,2079167,-1000,-1100,500\nOK'

    result=$(
        set +eu
        export PATH="$shim_dir:$PATH"
        # Provide the few globals parse_ca_info reads.
        network_type="5G-NSA"
        # Source the library (includes _lte_rb_to_mhz, _nr_bw_to_mhz, parse_ca_info).
        . "$source_lib"
        parse_ca_info "$sample_raw"
        printf '%s|%s|%s|%s|%s|%s\n' \
            "$t2_ca_active" "$t2_ca_count" \
            "$t2_nr_ca_active" "$t2_nr_ca_count" \
            "$t2_total_bandwidth_mhz" "$t2_bandwidth_details"
        # carrier_components must contain 3 entries with the expected bands.
        printf '%s' "$t2_carrier_components" | jq -c 'map(.band)'
    )

    cut_calls=$(wc -c < "$counter" | tr -d ' ')

    summary=$(printf '%s\n' "$result" | head -1)
    bands=$(printf '%s\n' "$result" | tail -1)

    case "$summary" in
        'true|1|true|1|'*'|'*)
            ok "parse_ca_info populated CA totals correctly"
            ;;
        *)
            bad "parse_ca_info CA-totals output mismatch: '$summary'"
            ;;
    esac

    case "$bands" in
        '["B3","B7","N78"]')
            ok "parse_ca_info emitted expected band order [B3,B7,N78]"
            ;;
        *)
            bad "parse_ca_info band order mismatch: '$bands'"
            ;;
    esac

    # Before the fix: ~10 cuts per QCAINFO line × 3 lines = 30+ forks.
    # After: 0 cuts on the per-line path (only the final jq still uses cut-like ops indirectly).
    if [ "$cut_calls" -lt 5 ]; then
        ok "parse_ca_info issued $cut_calls cut invocations (<5)"
    else
        bad "parse_ca_info still issues $cut_calls cut invocations (expected <5)"
    fi
fi

printf '\n%d passed, %d failed' "$pass_count" "$fail_count"
if [ "$fail" -eq 0 ]; then
    printf ', ALL PASS\n'
    exit 0
else
    printf ', FAILURES\n'
    exit 1
fi

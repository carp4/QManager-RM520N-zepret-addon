#!/usr/bin/env bash
# Functional test for qmanager_firewall chain-based implementation.
# Uses a fake `iptables` on PATH to record invocations and simulate a
# stateful rule set. Asserts:
#   - First `start` creates the chain, populates it, hooks INPUT
#   - Second `start` does NOT stack rules (chain flushed before re-populate)
#   - `stop` unhooks, flushes, and deletes the chain
#   - `cleanup_legacy_input_rules` drains pre-chain INPUT rules
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/usr/bin/qmanager_firewall"
[ -x "$SCRIPT" ] || { echo "FAIL: $SCRIPT not executable" >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Fake iptables: tracks rules in $WORK/state.txt. One rule per line.
# Each line is the literal argv after dropping `-w <n>` if present.
# Supports: -N (add chain), -X (delete chain), -F (flush), -A, -D, -I, -C, -L
cat >"$WORK/iptables" <<'FAKE'
#!/usr/bin/env bash
STATE="$IPTABLES_STATE"
LOG="$IPTABLES_LOG"
# Drop -w <secs> if present
args=()
skip=0
for a in "$@"; do
    if [ $skip -eq 1 ]; then skip=0; continue; fi
    if [ "$a" = "-w" ]; then skip=1; continue; fi
    args+=("$a")
done
echo "iptables ${args[*]}" >> "$LOG"
case "${args[0]}" in
    -N)  # -N CHAIN
        chain="${args[1]}"
        grep -q "^CHAIN $chain$" "$STATE" 2>/dev/null && exit 1
        echo "CHAIN $chain" >> "$STATE" ;;
    -X)  # -X CHAIN
        chain="${args[1]}"
        sed -i "/^CHAIN $chain$/d; /^RULE $chain /d" "$STATE" ;;
    -F)  # -F CHAIN
        chain="${args[1]}"
        sed -i "/^RULE $chain /d" "$STATE" ;;
    -A)  # -A CHAIN ...rule...
        chain="${args[1]}"
        rest="${args[*]:2}"
        echo "RULE $chain $rest" >> "$STATE" ;;
    -I)  # -I CHAIN [pos] ...rule...
        chain="${args[1]}"
        rest="${args[*]:2}"
        echo "RULE $chain $rest" >> "$STATE" ;;
    -D)  # -D CHAIN ...rule...
        chain="${args[1]}"
        rest="${args[*]:2}"
        line="RULE $chain $rest"
        grep -qF "$line" "$STATE" || exit 1
        # Remove first match only (mirrors real iptables -D semantics)
        awk -v t="$line" 'BEGIN{d=0} (!d && $0==t){d=1; next} {print}' \
            "$STATE" > "$STATE.tmp" && mv "$STATE.tmp" "$STATE" ;;
    -C)  # -C CHAIN ...rule...
        chain="${args[1]}"
        rest="${args[*]:2}"
        grep -qF "RULE $chain $rest" "$STATE" || exit 1 ;;
    -t)  # -t TABLE -X|-N|-F ...
        # We only model the filter table; for any other table just exit 0
        if [ "${args[1]}" != "filter" ]; then exit 0; fi
        # Drop -t filter and recurse
        exec "$0" "${args[@]:2}" ;;
    *) exit 0 ;;
esac
FAKE
chmod +x "$WORK/iptables"

export IPTABLES_STATE="$WORK/state.txt"
export IPTABLES_LOG="$WORK/log.txt"
: > "$IPTABLES_STATE"
: > "$IPTABLES_LOG"

PATH="$WORK:$PATH"
export PATH

# --- Test 1: First start creates and populates chain ---
"$SCRIPT" start
grep -q '^CHAIN QMANAGER_FW$' "$IPTABLES_STATE" || { echo "FAIL: chain not created"; exit 1; }
rule_count1=$(grep -c '^RULE QMANAGER_FW ' "$IPTABLES_STATE" || true)
[ "$rule_count1" -gt 0 ] || { echo "FAIL: no rules in chain"; exit 1; }
grep -q '^RULE INPUT -j QMANAGER_FW$' "$IPTABLES_STATE" \
    || { echo "FAIL: INPUT not hooked"; exit 1; }

# --- Test 2: Second start does NOT stack rules (idempotent) ---
"$SCRIPT" start
rule_count2=$(grep -c '^RULE QMANAGER_FW ' "$IPTABLES_STATE" || true)
[ "$rule_count1" = "$rule_count2" ] \
    || { echo "FAIL: rule count drifted ($rule_count1 -> $rule_count2)"; exit 1; }
hook_count=$(grep -c '^RULE INPUT -j QMANAGER_FW$' "$IPTABLES_STATE" || true)
[ "$hook_count" = "1" ] \
    || { echo "FAIL: hook count is $hook_count, expected 1"; exit 1; }

# --- Test 3: stop unhooks and removes chain ---
"$SCRIPT" stop
grep -q '^CHAIN QMANAGER_FW$' "$IPTABLES_STATE" \
    && { echo "FAIL: chain not deleted by stop"; exit 1; }
grep -q '^RULE INPUT -j QMANAGER_FW$' "$IPTABLES_STATE" \
    && { echo "FAIL: hook not removed by stop"; exit 1; }

# --- Test 4: cleanup_legacy drains pre-chain INPUT-direct rules ---
# Simulate orphan rules from old implementation
echo "RULE INPUT -i rmnet_data0 -p tcp --dport 443 -j DROP" >> "$IPTABLES_STATE"
echo "RULE INPUT -i rmnet_data0 -p tcp --dport 80 -j DROP" >> "$IPTABLES_STATE"
echo "RULE INPUT -p tcp --dport 80 -j DROP" >> "$IPTABLES_STATE"
echo "RULE INPUT -i bridge0 -p tcp --dport 80 -j ACCEPT" >> "$IPTABLES_STATE"
"$SCRIPT" start
# After start, all legacy INPUT rules should be drained
remaining_orphans=$(grep -E '^RULE INPUT -(i [^ ]+ )?-p tcp --dport (80|443) -j (ACCEPT|DROP)$' "$IPTABLES_STATE" | wc -l)
[ "$remaining_orphans" = "0" ] \
    || { echo "FAIL: $remaining_orphans legacy orphan rules remain"; cat "$IPTABLES_STATE"; exit 1; }

echo "PASS"

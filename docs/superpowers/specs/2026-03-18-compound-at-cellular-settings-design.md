# Compound AT Command: Cellular Settings GET Optimization

**Date:** 2026-03-18
**Status:** Approved
**Scope:** `scripts/www/cgi-bin/quecmanager/cellular/settings.sh` (GET path only)

## Problem

The cellular settings GET endpoint executes 7 sequential AT commands via `qcmd`, each requiring a separate lock acquisition, serial round-trip, and 0.2s inter-command sleep. Total wall time: ~2-4s per page load.

## Solution

Replace 7 sequential `qcmd` calls with a single compound AT command using semicolon-separated syntax. The modem returns all responses in one blob with unique prefixes per sub-command, enabling grep-based extraction from the combined output.

### Compound Command

```
AT+QUIMSLOT?;+CFUN?;+QNWPREFCFG="mode_pref";+QNWPREFCFG="nr5g_disable_mode";+QNWPREFCFG="roam_pref";+QNWCFG="lte_ambr";+QNWCFG="nr5g_ambr"
```

### Confirmed Modem Output (from device `toothless`)

```
AT+QUIMSLOT?;+CFUN?;+QNWPREFCFG="mode_pref";+QNWPREFCFG="nr5g_disable_mode";+QNWPREFCFG="roam_pref";+QNWCFG="lte_ambr";+QNWCFG="nr5g_ambr"
+QUIMSLOT: 1

+CFUN: 1

+QNWPREFCFG: "mode_pref",LTE:NR5G

+QNWPREFCFG: "nr5g_disable_mode",0

+QNWPREFCFG: "roam_pref",255

+QNWCFG: "lte_ambr","SMARTLTE",1228640,2008640
+QNWCFG: "lte_ambr","ims",100000,50000

```

Key observations:
- Single command echo on line 1 (the full compound string)
- No intermediate `OK`s or command echoes between sub-responses — single trailing `OK` at end
- Blank lines separate sub-responses
- Each response has a unique prefix discriminator
- Multi-line responses (AMBR) are grouped together
- Missing sub-responses (e.g., NR5G AMBR when no 5G) are simply omitted
- `\r` carriage returns present in raw `sms_tool` output — all extraction must use `tr -d '\r'`

### Parsing Strategy

Each field is extracted via `grep` for its unique prefix from the combined `$raw` blob. These are the same patterns already used in the current code — the only change is they all operate on a shared string instead of separate response variables.

| Field | grep pattern | sed extraction |
|-------|-------------|----------------|
| `sim_slot` | `+QUIMSLOT:` | `sed 's/+QUIMSLOT: //'` |
| `cfun` | `+CFUN:` | `sed 's/+CFUN: //'` |
| `mode_pref` | `+QNWPREFCFG: "mode_pref"` | `sed 's/.*"mode_pref",//'` |
| `nr5g_mode` | `+QNWPREFCFG: "nr5g_disable_mode"` | `sed 's/.*"nr5g_disable_mode",//'` |
| `roam_pref` | `+QNWPREFCFG: "roam_pref"` | `sed 's/.*"roam_pref",//'` |
| `lte_ambr` | `+QNWCFG: "lte_ambr"` | Existing multi-line parser |
| `nr5g_ambr` | `+QNWCFG: "nr5g_ambr"` | Existing multi-line parser |

### Error Handling

If the entire `qcmd` call fails (rc != 0 or empty response), all fields retain their pre-initialized defaults:

- `sim_slot="1"`, `cfun="1"`, `mode_pref="AUTO"`, `nr5g_mode="0"`, `roam_pref="255"`
- `lte_ambr_json="[]"`, `nr5g_ambr_json="[]"`

This is the same safety net as before, applied at the blob level rather than per-command.

**Partial sub-command failure:** If one sub-command within the compound returns an error, the modem may either abort the remaining commands or continue. In either case, the grep-based extraction handles it gracefully — fields whose prefix is absent in the response simply retain their defaults. This is an acceptable trade-off vs. the sequential approach (where 6/7 fields would still populate), because all 7 commands are standard read-only queries that should always succeed on a responsive modem.

**Timeout budget:** `qcmd` uses a 3-second `SHORT_TIMEOUT` for the entire compound call. Since all 7 are read-only queries (no modem state changes), the combined round-trip is well under 1 second based on confirmed device testing. The compound command does not match any `is_long_command()` patterns.

### Why Not `run_at()`

The script calls `qcmd` directly rather than the `run_at()` wrapper from `cgi_at.sh`. This is intentional: `run_at()` checks for `*ERROR*` in the entire response and returns failure if found, which would reject the whole blob if any sub-command errors. Direct `qcmd` + grep-by-prefix is more resilient for compound responses.

## What Changes

- **`settings.sh` GET path:** Replace 7 sequential `qcmd` + `sleep` blocks with 1 compound `qcmd` call and 7 grep/sed extractions from the shared response
- **Remove `CMD_GAP` usage from GET path** (keep for POST path)

## What Does NOT Change

- `qcmd` — already handles compound syntax (proven by poller's `AT+QCAINFO=1;+QCAINFO;+QCAINFO=0`)
- POST path — stays sequential (side effects need individual error handling)
- JSON response contract — identical output shape
- Frontend hook (`use-cellular-settings.ts`) — zero changes
- Frontend components — zero changes
- `nr5g_unit_to_kbps()` function — still needed for NR5G AMBR
- AMBR temp file + jq parsing logic — same approach

## Performance

| Metric | Before | After |
|--------|--------|-------|
| Lock acquisitions | 7 | 1 |
| Serial round-trips | 7 | 1 |
| Sleep time | 1.2s (6 x 0.2s) | 0s |
| Estimated wall time | 2-4s | 200-400ms |

## Risk

**Low.** Compound AT syntax is proven in production (poller). Output format confirmed on hardware. Parsing logic unchanged — same grep patterns on a larger string. POST path untouched. Frontend untouched.

## Precedent

`scripts/usr/bin/qmanager_poller` line 711:
```sh
result=$(qcmd_exec 'AT+QCAINFO=1;+QCAINFO;+QCAINFO=0')
```

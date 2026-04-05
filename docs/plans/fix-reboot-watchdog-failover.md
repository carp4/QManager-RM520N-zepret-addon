# Fix Plan: Reboot, Watchdog, and Tower Failover Bugs

## Context

Three features are broken on the RM520N-GL after reboot:
1. **Reboot button** does nothing
2. **Watchdog** toggle resets on refresh after "successful" save
3. **Tower failover** gets stuck at "Ready" — daemon never starts

Bugs 2 and 3 share a root cause: the RM520N-GL rootfs is read-only after reboot, so all writes to `/etc/qmanager/` fail silently. The installer remounts rw (`scripts/install_rm520n.sh:130`) but the boot-time setup service does not.

---

## Fix 1: Reboot Button — Empty POST Body

**Root cause:** Frontend sends a bare `fetch(url, { method: "POST" })` with no body. `cgi_read_post()` in `cgi_base.sh:79-84` checks `CONTENT_LENGTH > 0` and exits with `cgi_error "no_body"` before the reboot code is reached.

**File:** `components/nav-user.tsx:166`

**Change:** Send a proper JSON body (matching the reconnect handler pattern at line 182):
```js
fetch("/cgi-bin/quecmanager/system/reboot.sh", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "reboot" }),
}).catch(() => {});
```

---

## Fix 2: Read-Only Rootfs — Affects Watchdog + Tower Failover + Everything

**Root cause:** `qmanager_setup` (boot oneshot) never remounts rootfs rw. After reboot:
- `chown -R www-data:www-data /etc/qmanager` fails (line 29)
- All `qm_config_set()` writes fail (jq redirect to `/etc/qmanager/*.tmp` fails)
- CGI returns `{"success":true}` anyway — user sees success toast but nothing persists

**File:** `scripts/usr/bin/qmanager_setup`

**Change:** Add rootfs remount at the top (same pattern as installer):
```sh
# Remount root filesystem read-write if needed (RM520N-GL boots read-only)
if ! touch /usr/.qm_rw_test 2>/dev/null; then
    mount -o remount,rw / 2>/dev/null
fi
rm -f /usr/.qm_rw_test
```

Insert after line 10 (before `mkdir -p`). This unblocks ALL config writes: watchdog, tower locking, system settings, auth, profiles, etc.

---

## Fix 3: Tower Failover — Validate daemon starts after rootfs fix

With Fix 2 applied, the failover config writes should work. The spawn flow is:
1. User enables failover in settings → `settings.sh` writes to `tower_lock.json`
2. User locks a tower → `lock.sh` calls `tower_spawn_failover_watcher()`
3. Spawn calls `svc_start qmanager_tower_failover`
4. Systemd `ExecStartPre` checks `failover.enabled=true` AND `(lte.enabled=true OR nr_sa.enabled=true)`
5. If both conditions met → daemon starts → PID file written → frontend shows "Monitoring"

**No code change needed** — the ExecStartPre logic is correct. The daemon didn't start because the config file on a read-only rootfs couldn't be updated with the lock state. Fix 2 resolves this.

---

## Files to Modify

| File | Change |
|------|--------|
| `components/nav-user.tsx` | Add JSON body to reboot fetch (line 166) |
| `scripts/usr/bin/qmanager_setup` | Add rootfs remount-rw at top (after line 10) |

---

## Verification

1. **Reboot**: Click reboot button → should redirect to countdown page, device reboots
2. **After reboot**: SSH back in, confirm `mount | grep ' / '` shows `rw` (not `ro`)
3. **Watchdog**: Enable toggle, save → refresh page → toggle should stay enabled; `systemctl status qmanager-watchcat` should show active
4. **Tower failover**: Enable failover in settings, lock a tower → status should transition from "Ready" to "Monitoring"; `ps | grep qmanager_tower_failover` should show daemon running

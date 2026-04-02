## Design Context

### Users
- **Hobbyist power users** optimizing home cellular setups for better speeds, band locking, and coverage
- **Field technicians** deploying and maintaining Quectel modems on OpenWRT devices
- Context: users are technically literate but not necessarily developers. They want clear, actionable information without needing to memorize AT commands. Sessions range from quick checks (signal status) to focused configuration (APN, band locking, profiles).

### Brand Personality
**Modern, Approachable, Smart** — a friendly expert. Not intimidating or overly technical in presentation, but deeply capable underneath. The interface should feel like a premium tool that respects the user's intelligence without requiring them to be a modem engineer.

### Aesthetic Direction
- **Visual tone:** Clean and modern with purposeful density where data matters. Polish of Vercel/Linear meets the functional depth of Grafana/UniFi.
- **References:** Apple System Preferences (clarity, hierarchy), Vercel/Linear (typography, motion, whitespace), Grafana/Datadog (data visualization density), UniFi (network management UX patterns)
- **Anti-references:** Avoid raw terminal aesthetics, cluttered legacy network tools, or overly playful/consumer app styling. Never sacrificial clarity for visual flair.
- **Theme:** Light and dark mode, both first-class. OKLCH color system already in place.
- **Typography:** Euclid Circular B (primary), Manrope (secondary). Clean, geometric, professional.
- **Radius:** 0.65rem base — softly rounded, not pill-shaped.

### Status Badge Pattern
All status badges use `variant="outline"` with semantic color classes and `size-3` lucide icons. Never use solid badge variants (`variant="success"`, `variant="destructive"`, etc.) for status indicators.

| State | Classes | Icon |
| ----- | ------- | ---- |
| Success/Active | `bg-success/15 text-success hover:bg-success/20 border-success/30` | `CheckCircle2Icon` |
| Warning | `bg-warning/15 text-warning hover:bg-warning/20 border-warning/30` | `TriangleAlertIcon` |
| Destructive/Error | `bg-destructive/15 text-destructive hover:bg-destructive/20 border-destructive/30` | `XCircleIcon` or `AlertCircleIcon` |
| Info | `bg-info/15 text-info hover:bg-info/20 border-info/30` | Context-specific (`DownloadIcon`, `ClockIcon`, etc.) |
| Muted/Disabled | `bg-muted/50 text-muted-foreground border-muted-foreground/30` | `MinusCircleIcon` |

```tsx
<Badge variant="outline" className="bg-success/15 text-success hover:bg-success/20 border-success/30">
  <CheckCircle2Icon className="size-3" />
  Active
</Badge>
```

- Reusable `ServiceStatusBadge` component at `components/local-network/service-status-badge.tsx` for service running/inactive states
- Choose muted for deliberately inactive states (Stopped, Offline peer, Disabled); destructive for failure/error states (Disconnected link, Failed email)

### Design Principles

1. **Data clarity first** — Signal metrics, latency charts, and network status are the core experience. Every pixel should serve readability and quick comprehension. Use color, spacing, and hierarchy to make numbers scannable at a glance.
2. **Progressive disclosure** — Show the essential information upfront; advanced controls and details are accessible but not overwhelming. A quick-check user and a deep-configuration user should both feel served.
3. **Confidence through feedback** — Every action (save, reboot, apply profile) must have clear visual feedback: loading states, success confirmations, error messages. Users are changing real device settings — they need to trust what happened.
4. **Consistent, systematic** — Use the established shadcn/ui components and design tokens uniformly. No one-off styles. Cards, forms, tables, and dialogs should feel like they belong to one coherent system.
5. **Responsive and resilient** — Works on desktop monitors and tablets in the field. Degrade gracefully. Handle loading, empty, and error states intentionally — never show a blank screen.

## CGI Endpoint Reference (Additions)

| Feature      | CGI Script                   | Hook                                                   | Types                | Reboot? |
|--------------|------------------------------|--------------------------------------------------------|----------------------|---------|
| Video Optimizer | `network/video_optimizer.sh` | `use-video-optimizer.ts` + `use-cdn-hostlist.ts` | `video-optimizer.ts` | No |
| Traffic Masquerade | `network/video_optimizer.sh` | `use-traffic-masquerade.ts` | `video-optimizer.ts` | No |
| NetBird VPN | `vpn/netbird.sh` | `use-netbird.ts` | In hook file | Yes (uninstall) |

## Feature-Specific Notes

### DPI Settings (Video Optimizer + Traffic Masquerade)

- **Two separate pages**: `/local-network/video-optimizer` (2-card grid: settings + CDN hostlist) and `/local-network/traffic-masquerade` (single card)
- **Old route** `/local-network/dpi-masking` redirects to video-optimizer
- **Binary**: nfqws from zapret project, installed at `/usr/bin/nfqws`
- **Not bundled**: nfqws is downloaded on demand from [zapret GitHub releases](https://github.com/bol-van/zapret/releases) via `qmanager_dpi_install` — avoids opkg dependency issues on custom firmware
- **Installer**: `qmanager_dpi_install` — detects arch, fetches `openwrt-embedded.tar.gz`, extracts arch-specific binary, installs to `/usr/bin/nfqws`
- **Installer state**: `/tmp/qmanager_dpi_install.json` (progress file), `/tmp/qmanager_dpi_install.pid` (singleton guard)
- **Hostname list**: `/etc/qmanager/video_domains.txt` (user-editable, curated video CDNs)
- **Default hostname list**: `/etc/qmanager/video_domains_default.txt` (immutable factory default for restore)
- **Hostlist CGI**: GET `?section=hostlist` returns domains array; POST `save_hostlist` (full replace + atomic write); POST `restore_hostlist` (copy default over active)
- **Single shared nfqws instance**: VO and masquerade are mutually exclusive modes of ONE nfqws process on queue 200 — single PID file (`/var/run/nfqws.pid`), single set of nftables rules (comment `qmanager_dpi`), single packet counter
- **Mutual exclusion**: Backend enforces in `save`/`save_masquerade` — enabling one disables the other in UCI. Init.d `start_service()` checks masquerade first, then VO (if/elif)
- **Video Optimizer mode**: NFQUEUE queue 200, `bypass` flag; TCP SNI split (`--dpi-desync=split2`) + QUIC desync (`--dpi-desync-udplen-increment`), filtered by `--hostlist`
- **Traffic Masquerade mode**: same queue 200; fake TLS ClientHello with spoofed SNI (default: `speedtest.net`) using `--dpi-desync=fake --dpi-desync-fake-tls-mod=sni=<domain> --dpi-desync-fooling=badseq`, applies to all traffic (no hostlist)
- **Status isolation**: CGI GET handlers gate live stats (status/uptime/packets) on UCI `enabled` flag — prevents cross-contamination since both modes share the same process/counters
- **Verification**: `qmanager_dpi_verify` — curl with `--connect-to` SNI spoofing against speed.cloudflare.com
- **Kernel support**: `dpi_check_kmod()` checks `/proc/config.gz` for `CONFIG_NETFILTER_NETLINK_QUEUE=y` (built-in) before trying lsmod/modprobe
- **Init.d**: `qmanager_dpi` (procd, START=99, UCI-gated, single nfqws instance in either VO or masquerade mode)
- **Installer jq caveat**: OpenWRT's jq lacks oniguruma — `test()` silently fails. Use `endswith()`/`contains()` instead (see memory: jq-no-regex)
- **Dependencies**: `libnetfilter-queue`, `libnfnetlink`, `libmnl`, full `curl` (not BusyBox); kernel NFQUEUE support (built-in or `kmod-nft-queue`)

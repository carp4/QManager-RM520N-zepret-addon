package main

import (
	"fmt"
	"strconv"
	"time"

	"github.com/bwmarrin/discordgo"
)

// Color palette (semantic).
const (
	colorGreen  = 0x22c55e
	colorYellow = 0xf59e0b
	colorRed    = 0xef4444
	colorBlue   = 0x3b82f6
	colorGray   = 0x6b7280
	colorAmber  = 0xf59e0b
)

// staleSeconds at the embed layer: cache older than this triggers gray sidebar
// + stale footer warning. Mirrors staleSecs in cache.go.
const embedStaleSecs = 30

// emoji vocabulary — single source of truth so every embed reuses identical glyphs.
var emoji = struct {
	Author     string
	PCI        string
	EARFCN     string
	Bandwidth  string
	Signal     string
	Temp       string
	Cell       string
	TAC        string
	Connection string
	Network    string
	Uptime     string
	Watchcat   string
	Device     string
	Cells24h   string
	SCC        string
	Refresh    string
	Raw        string
	NavSignal  string
	NavBands   string
	NavStatus  string
	Expired    string
	Ok         string
	Warn       string
	Down       string
	Unknown    string
	Stale      string
}{
	Author:     "📡",
	PCI:        "🆔",
	EARFCN:     "📡",
	Bandwidth:  "📐",
	Signal:     "📈",
	Temp:       "🌡",
	Cell:       "🆔",
	TAC:        "📞",
	Connection: "🌐",
	Network:    "📶",
	Uptime:     "⏱",
	Watchcat:   "🛡",
	Device:     "🌡",
	Cells24h:   "🛰",
	SCC:        "🛰️",
	Refresh:    "↻",
	Raw:        "🧾",
	NavSignal:  "📡",
	NavBands:   "📊",
	NavStatus:  "📋",
	Expired:    "⌛",
	Ok:         "🟢",
	Warn:       "🟡",
	Down:       "🔴",
	Unknown:    "⚫",
	Stale:      "⚠",
}

// embedColor picks the sidebar color from cache state.
func embedColor(s *ModemStatus) int {
	if s.CacheTime > 0 && time.Now().Unix()-s.CacheTime > embedStaleSecs {
		return colorGray
	}
	if s.ModemReachable != "true" {
		return colorRed
	}
	if s.ConnInternetAvailable == "false" {
		return colorAmber
	}
	if s.DuringRecovery == "true" {
		return colorAmber
	}
	return colorGreen
}

// relativeTime renders a unix timestamp as "Xs ago" / "Xm ago" / "Xh ago" / "Xd ago".
// Returns "unknown" for ts<=0. Never negative. Does NOT add a stale marker —
// callers that care about staleness wrap the result themselves (see footerBlock).
func relativeTime(ts int64) string {
	if ts <= 0 {
		return "unknown"
	}
	delta := time.Now().Unix() - ts
	if delta < 0 {
		delta = 0
	}
	return relativeCore(delta)
}

func relativeCore(secs int64) string {
	switch {
	case secs < 60:
		return fmt.Sprintf("%ds ago", secs)
	case secs < 3600:
		return fmt.Sprintf("%dm ago", secs/60)
	case secs < 86400:
		return fmt.Sprintf("%dh ago", secs/3600)
	default:
		return fmt.Sprintf("%dd ago", secs/86400)
	}
}

// formatBytes renders bytes-per-second as "1.4 MB/s" etc.
func formatBytes(b int64) string {
	const k = 1024
	switch {
	case b < k:
		return fmt.Sprintf("%d B/s", b)
	case b < k*k:
		return fmt.Sprintf("%.1f KB/s", float64(b)/k)
	case b < k*k*k:
		return fmt.Sprintf("%.1f MB/s", float64(b)/(k*k))
	default:
		return fmt.Sprintf("%.1f GB/s", float64(b)/(k*k*k))
	}
}

// signalQualityBucket maps the best-antenna RSRP into one of:
// excellent / good / fair / poor / none.
func signalQualityBucket(ports map[string]AntennaSignal) string {
	bestRSRP := 0.0
	any := false
	for _, ant := range ports {
		if ant.RSRP == "" {
			continue
		}
		v, err := strconv.ParseFloat(ant.RSRP, 64)
		if err != nil {
			continue
		}
		if !any || v > bestRSRP {
			bestRSRP = v
			any = true
		}
	}
	if !any {
		return "none"
	}
	switch {
	case bestRSRP >= -80:
		return "excellent"
	case bestRSRP >= -90:
		return "good"
	case bestRSRP >= -105:
		return "fair"
	case bestRSRP >= -120:
		return "poor"
	default:
		return "none"
	}
}

func signalQualityBars(bucket string) string {
	switch bucket {
	case "excellent":
		return "▰▰▰▰▰"
	case "good":
		return "▰▰▰▰▱"
	case "fair":
		return "▰▰▰▱▱"
	case "poor":
		return "▰▰▱▱▱"
	default:
		return "▱▱▱▱▱"
	}
}

// ccEmoji picks a color emoji that encodes both PCC/SCC tier and LTE/NR tech.
func ccEmoji(ccType, tech string) string {
	switch {
	case ccType == "PCC" && tech == "LTE":
		return "🔵"
	case ccType == "SCC" && tech == "LTE":
		return "🟣"
	case ccType == "PCC" && tech == "NR":
		return "🟢"
	case ccType == "SCC" && tech == "NR":
		return "🟠"
	default:
		return "⚪"
	}
}

// authorBlock returns the per-embed author line (e.g. "📡 QManager • RM520N-GL").
func authorBlock(s *ModemStatus) *discordgo.MessageEmbedAuthor {
	name := emoji.Author + " QManager"
	if s.Model != "" {
		name = name + " • " + s.Model
	}
	return &discordgo.MessageEmbedAuthor{Name: name}
}

// footerBlock returns the per-embed footer with relative-cache-time text.
// When the cache is older than embedStaleSecs the time is wrapped in "stale (…)".
func footerBlock(s *ModemStatus) *discordgo.MessageEmbedFooter {
	rel := relativeTime(s.CacheTime)
	if s.CacheTime > 0 && time.Now().Unix()-s.CacheTime > embedStaleSecs {
		rel = "stale (" + rel + ")"
	}
	return &discordgo.MessageEmbedFooter{
		Text: "QManager • Updated " + rel,
	}
}

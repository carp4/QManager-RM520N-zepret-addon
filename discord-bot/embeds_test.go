package main

import (
	"strings"
	"testing"
	"time"
)

func TestEmbedColor(t *testing.T) {
	now := time.Now().Unix()
	cases := []struct {
		name string
		s    *ModemStatus
		want int
	}{
		{"healthy", &ModemStatus{ConnInternetAvailable: "true", ModemReachable: "true", CacheTime: now}, colorGreen},
		{"degraded internet down", &ModemStatus{ConnInternetAvailable: "false", ModemReachable: "true", CacheTime: now}, colorAmber},
		{"degraded recovery", &ModemStatus{ConnInternetAvailable: "true", ModemReachable: "true", DuringRecovery: "true", CacheTime: now}, colorAmber},
		{"down modem unreachable", &ModemStatus{ConnInternetAvailable: "false", ModemReachable: "false", CacheTime: now}, colorRed},
		{"stale", &ModemStatus{ConnInternetAvailable: "true", ModemReachable: "true", CacheTime: now - 60}, colorGray},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := embedColor(c.s)
			if got != c.want {
				t.Errorf("embedColor=%#x, want %#x", got, c.want)
			}
		})
	}
}

func TestRelativeTime(t *testing.T) {
	now := time.Now().Unix()
	cases := []struct {
		secs int64
		want string
	}{
		{now - 1, "1s ago"},
		{now - 30, "30s ago"},
		{now - 90, "1m ago"},
		{now - 3700, "1h ago"},
		{now - 90000, "1d ago"},
	}
	for _, c := range cases {
		got := relativeTime(c.secs)
		if got != c.want {
			t.Errorf("relativeTime(%d): got %q, want %q", c.secs, got, c.want)
		}
	}
}

func TestFooterBlock_StaleMarker(t *testing.T) {
	s := &ModemStatus{CacheTime: time.Now().Unix() - 60}
	footer := footerBlock(s)
	if !strings.Contains(footer.Text, "stale") {
		t.Errorf("expected stale marker in footer for 60s-old cache, got %q", footer.Text)
	}
}

func TestFooterBlock_FreshNoStale(t *testing.T) {
	s := &ModemStatus{CacheTime: time.Now().Unix() - 5}
	footer := footerBlock(s)
	if strings.Contains(footer.Text, "stale") {
		t.Errorf("did not expect stale marker for 5s-old cache, got %q", footer.Text)
	}
}

func TestFormatBytes(t *testing.T) {
	cases := []struct {
		in   int64
		want string
	}{
		{0, "0 B/s"},
		{500, "500 B/s"},
		{2048, "2.0 KB/s"},
		{1500000, "1.4 MB/s"},
		{2_000_000_000, "1.9 GB/s"},
	}
	for _, c := range cases {
		got := formatBytes(c.in)
		if got != c.want {
			t.Errorf("formatBytes(%d)=%q, want %q", c.in, got, c.want)
		}
	}
}

func TestSignalQualityBars(t *testing.T) {
	cases := []struct {
		bucket string
		want   string
	}{
		{"excellent", "▰▰▰▰▰"},
		{"good", "▰▰▰▰▱"},
		{"fair", "▰▰▰▱▱"},
		{"poor", "▰▰▱▱▱"},
		{"none", "▱▱▱▱▱"},
	}
	for _, c := range cases {
		got := signalQualityBars(c.bucket)
		if got != c.want {
			t.Errorf("signalQualityBars(%q)=%q, want %q", c.bucket, got, c.want)
		}
	}
}

func TestSignalQualityBucket(t *testing.T) {
	cases := []struct {
		ports map[string]AntennaSignal
		want  string
	}{
		{map[string]AntennaSignal{"main": {RSRP: "-75"}}, "excellent"},
		{map[string]AntennaSignal{"main": {RSRP: "-85"}}, "good"},
		{map[string]AntennaSignal{"main": {RSRP: "-100"}}, "fair"},
		{map[string]AntennaSignal{"main": {RSRP: "-115"}}, "poor"},
		{map[string]AntennaSignal{"main": {RSRP: "-130"}}, "none"},
		{map[string]AntennaSignal{}, "none"},
	}
	for _, c := range cases {
		got := signalQualityBucket(c.ports)
		if got != c.want {
			t.Errorf("signalQualityBucket(%v)=%q, want %q", c.ports, got, c.want)
		}
	}
}

func TestCcEmoji(t *testing.T) {
	cases := []struct {
		ccType, tech, want string
	}{
		{"PCC", "LTE", "🔵"},
		{"SCC", "LTE", "🟣"},
		{"PCC", "NR", "🟢"},
		{"SCC", "NR", "🟠"},
		{"OTHER", "LTE", "⚪"},
	}
	for _, c := range cases {
		got := ccEmoji(c.ccType, c.tech)
		if got != c.want {
			t.Errorf("ccEmoji(%s,%s)=%q, want %q", c.ccType, c.tech, got, c.want)
		}
	}
}

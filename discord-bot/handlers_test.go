package main

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

func makeStatus(internet, reachable, networkType string) *ModemStatus {
	return &ModemStatus{
		ConnInternetAvailable: internet,
		ModemReachable:        reachable,
		NetworkType:           networkType,
		CacheTime:             time.Now().Unix(),
		SignalPerAntenna: map[string]AntennaSignal{
			"main": {RSRP: "-85", RSRQ: "-10", SINR: "15", RSSI: "-65"},
		},
	}
}

func TestBuildSignalEmbed_Title(t *testing.T) {
	s := makeStatus("true", "true", "5G-NSA")
	if buildSignalEmbed(s).Title != "Signal Metrics" {
		t.Errorf("title wrong")
	}
}

func TestBuildSignalEmbed_PillRow_HasBars(t *testing.T) {
	s := makeStatus("true", "true", "5G-NSA")
	s.NrState = "connected"
	s.SignalPerAntenna = map[string]AntennaSignal{
		"main": {RSRP: "-75", SINR: "18", RSRQ: "-10"},
	}
	embed := buildSignalEmbed(s)
	if !strings.Contains(embed.Description, "▰") {
		t.Errorf("pill row missing bar glyphs: %q", embed.Description)
	}
	if !strings.Contains(embed.Description, "Excellent") {
		t.Errorf("pill row missing Excellent label: %q", embed.Description)
	}
	if !strings.Contains(embed.Description, "NR primary") {
		t.Errorf("pill row missing NR primary tag: %q", embed.Description)
	}
}

func TestBuildSignalEmbed_PillRow_LtePrimary(t *testing.T) {
	s := makeStatus("true", "true", "LTE")
	s.NrState = ""
	s.LteState = "connected"
	s.SignalPerAntenna = map[string]AntennaSignal{
		"main": {RSRP: "-100", SINR: "8"},
	}
	embed := buildSignalEmbed(s)
	if !strings.Contains(embed.Description, "LTE primary") {
		t.Errorf("pill row=%q want LTE primary", embed.Description)
	}
	if !strings.Contains(embed.Description, "Fair") {
		t.Errorf("pill row=%q want Fair quality", embed.Description)
	}
}

func TestBuildSignalEmbed_PerPortColorEmoji(t *testing.T) {
	s := makeStatus("true", "true", "5G-NSA")
	s.SignalPerAntenna = map[string]AntennaSignal{
		"main":      {RSRP: "-85", SINR: "18", RSRQ: "-10"},
		"diversity": {RSRP: "-100", SINR: "8", RSRQ: "-13"},
		"mimo3":     {RSRP: "-115", SINR: "-2", RSRQ: "-18"},
	}
	embed := buildSignalEmbed(s)
	greens, yellows, reds := 0, 0, 0
	for _, f := range embed.Fields {
		if strings.Contains(f.Name, "🟢") {
			greens++
		}
		if strings.Contains(f.Name, "🟡") {
			yellows++
		}
		if strings.Contains(f.Name, "🔴") {
			reds++
		}
	}
	if greens != 1 || yellows != 1 || reds != 1 {
		t.Errorf("per-port emoji counts: green=%d yellow=%d red=%d", greens, yellows, reds)
	}
}

func TestBuildSignalEmbed_ProvenanceFootnote(t *testing.T) {
	s := makeStatus("true", "true", "5G-NSA")
	s.NrState = "connected"
	s.LteState = "connected"
	s.SignalPerAntenna = map[string]AntennaSignal{
		"main": {RSRP: "-85", SINR: "18"},
	}
	embed := buildSignalEmbed(s)
	found := false
	for _, f := range embed.Fields {
		if strings.Contains(f.Value, "EN-DC") || strings.Contains(f.Value, "Showing NR") {
			found = true
		}
	}
	if !found {
		t.Error("missing provenance footnote field")
	}
}

func TestBuildStatusEmbed_Title(t *testing.T) {
	s := makeStatus("true", "true", "LTE")
	if buildStatusEmbed(s).Title != "Modem Status" {
		t.Errorf("wrong title")
	}
}

func TestBuildStatusEmbed_PillRow_Up(t *testing.T) {
	s := makeStatus("true", "true", "LTE")
	s.ConnLatency = "23"
	s.RxRate = "1500000"
	s.TxRate = "250000"
	embed := buildStatusEmbed(s)
	if !strings.Contains(embed.Description, "Internet up") {
		t.Errorf("description=%q", embed.Description)
	}
	if !strings.Contains(embed.Description, "23 ms") {
		t.Errorf("description missing latency: %q", embed.Description)
	}
	if !strings.Contains(embed.Description, "MB/s") {
		t.Errorf("description missing throughput: %q", embed.Description)
	}
}

func TestBuildStatusEmbed_PillRow_Down(t *testing.T) {
	s := makeStatus("false", "true", "LTE")
	embed := buildStatusEmbed(s)
	if !strings.Contains(embed.Description, "Internet down") {
		t.Errorf("description=%q", embed.Description)
	}
	if embed.Color != colorAmber {
		t.Errorf("color=%#x want amber for internet down + modem reachable", embed.Color)
	}
}

func TestBuildStatusEmbed_ConnectionField_HasLatencyStats(t *testing.T) {
	s := makeStatus("true", "true", "LTE")
	s.ConnLatency = "23"
	s.ConnAvgLatency = "28"
	s.ConnJitter = "4"
	s.ConnPacketLoss = "0.0"
	s.PingTarget = "8.8.8.8"
	embed := buildStatusEmbed(s)
	found := false
	for _, f := range embed.Fields {
		if strings.Contains(f.Name, "Connection") {
			found = true
			if !strings.Contains(f.Value, "avg 28") || !strings.Contains(f.Value, "jitter 4") {
				t.Errorf("connection value missing avg/jitter: %q", f.Value)
			}
			if !strings.Contains(f.Value, "8.8.8.8") {
				t.Errorf("connection value missing ping target: %q", f.Value)
			}
		}
	}
	if !found {
		t.Error("missing Connection field")
	}
}

func TestBuildStatusEmbed_UptimeField_BothLines(t *testing.T) {
	s := makeStatus("true", "true", "LTE")
	s.Uptime = "2d 6h 30m"
	s.ConnUptime = "4h 12m"
	embed := buildStatusEmbed(s)
	for _, f := range embed.Fields {
		if strings.Contains(f.Name, "Uptime") {
			if !strings.Contains(f.Value, "Connection") || !strings.Contains(f.Value, "Device") {
				t.Errorf("uptime value missing both lines: %q", f.Value)
			}
		}
	}
}

func TestBuildStatusEmbed_WatchcatField(t *testing.T) {
	s := makeStatus("true", "true", "LTE")
	s.WatchcatState = "monitoring"
	s.WatchcatFailures = "3"
	embed := buildStatusEmbed(s)
	found := false
	for _, f := range embed.Fields {
		if strings.Contains(f.Name, "Watchcat") {
			found = true
			if !strings.Contains(f.Value, "monitoring") || !strings.Contains(f.Value, "3 failures") {
				t.Errorf("watchcat value=%q", f.Value)
			}
		}
	}
	if !found {
		t.Error("missing Watchcat field")
	}
}

func TestBuildEventsEmbed_Empty(t *testing.T) {
	embed := buildEventsEmbed([]Event{})
	if embed.Description == "" {
		t.Error("expected description for empty events")
	}
}

func TestEmbedColorForInternet(t *testing.T) {
	if embedColorForInternet("true") != colorGreen {
		t.Error("expected green for internet=true")
	}
	if embedColorForInternet("false") != colorRed {
		t.Error("expected red for internet=false")
	}
}

func TestBuildBandsEmbed_Title(t *testing.T) {
	s := makeStatus("true", "true", "5G-NSA")
	embed := buildBandsEmbed(s)
	if embed.Title != "Band Details" {
		t.Errorf("title=%q, want Band Details", embed.Title)
	}
}

func TestBuildBandsEmbed_PillRow_EnDc(t *testing.T) {
	s := makeStatus("true", "true", "5G-NSA")
	s.NrState = "connected"
	s.LteState = "connected"
	s.TotalBandwidthMHz = "100"
	s.CarrierComponents = []CarrierComponent{
		{Type: "PCC", Technology: "LTE", Band: "B3"},
		{Type: "SCC", Technology: "LTE", Band: "B7"},
		{Type: "SCC", Technology: "NR", Band: "n78"},
	}
	embed := buildBandsEmbed(s)
	want := "🟢 EN-DC active • 📊 100 MHz total • 🛰️ 3 carriers"
	if embed.Description != want {
		t.Errorf("description=%q, want %q", embed.Description, want)
	}
}

func TestBuildBandsEmbed_PillRow_LteOnly(t *testing.T) {
	s := makeStatus("true", "true", "LTE-A")
	s.LteState = "connected"
	s.TotalBandwidthMHz = "40"
	s.CarrierComponents = []CarrierComponent{
		{Type: "PCC", Technology: "LTE", Band: "B3"},
		{Type: "SCC", Technology: "LTE", Band: "B7"},
	}
	embed := buildBandsEmbed(s)
	if !strings.Contains(embed.Description, "LTE-A active") {
		t.Errorf("description=%q, want LTE-A active", embed.Description)
	}
}

func TestBuildBandsEmbed_PillRow_NoCa(t *testing.T) {
	s := makeStatus("true", "true", "LTE")
	s.LteState = "connected"
	s.LteBand = "B3"
	embed := buildBandsEmbed(s)
	if !strings.Contains(embed.Description, "No CA data") {
		t.Errorf("description=%q, want No CA data note", embed.Description)
	}
}

func TestBuildBandsEmbed_PillRow_ModemUnreachable(t *testing.T) {
	s := makeStatus("false", "false", "")
	embed := buildBandsEmbed(s)
	if !strings.Contains(embed.Description, "unreachable") {
		t.Errorf("description=%q, want unreachable", embed.Description)
	}
	if embed.Color != colorRed {
		t.Errorf("color=%#x, want red", embed.Color)
	}
}

func TestBuildBandsEmbed_CcCards_Order(t *testing.T) {
	s := makeStatus("true", "true", "5G-NSA")
	s.CarrierComponents = []CarrierComponent{
		{Type: "PCC", Technology: "LTE", Band: "B3", PCI: "123", EARFCN: "1850", BandwidthMHz: "20", RSRP: "-85", SINR: "18"},
		{Type: "SCC", Technology: "NR", Band: "n78", PCI: "789", EARFCN: "642000", BandwidthMHz: "60", RSRP: "-92", SINR: "11"},
	}
	embed := buildBandsEmbed(s)
	if len(embed.Fields) < 2 {
		t.Fatalf("want >=2 fields, got %d", len(embed.Fields))
	}
	if !strings.Contains(embed.Fields[0].Name, "PCC") || !strings.Contains(embed.Fields[0].Name, "B3") {
		t.Errorf("field[0].Name=%q", embed.Fields[0].Name)
	}
	if !strings.Contains(embed.Fields[1].Name, "SCC") || !strings.Contains(embed.Fields[1].Name, "n78") {
		t.Errorf("field[1].Name=%q", embed.Fields[1].Name)
	}
	if !strings.Contains(embed.Fields[1].Value, "ARFCN 642000") {
		t.Errorf("field[1].Value missing ARFCN label: %q", embed.Fields[1].Value)
	}
	if !strings.Contains(embed.Fields[0].Value, "EARFCN 1850") {
		t.Errorf("field[0].Value missing EARFCN label: %q", embed.Fields[0].Value)
	}
}

func TestBuildBandsEmbed_CcCards_OverflowCap(t *testing.T) {
	s := makeStatus("true", "true", "5G-NSA")
	for i := 0; i < 8; i++ {
		s.CarrierComponents = append(s.CarrierComponents, CarrierComponent{
			Type: "SCC", Technology: "LTE", Band: fmt.Sprintf("B%d", i),
		})
	}
	embed := buildBandsEmbed(s)
	ccFields := 0
	overflow := false
	for _, f := range embed.Fields {
		if strings.Contains(f.Name, "SCC") {
			ccFields++
		}
		if strings.Contains(f.Name, "More carriers") {
			overflow = true
		}
	}
	if ccFields != 6 {
		t.Errorf("CC fields=%d, want 6", ccFields)
	}
	if !overflow {
		t.Error("missing overflow field for 8 CCs")
	}
}

func TestBuildBandsEmbed_ServingCellField(t *testing.T) {
	s := makeStatus("true", "true", "5G-NSA")
	s.LteCellID = "0x1A2B3C"
	s.NrCellID = "0x4D5E6F"
	s.LteTAC = "12345"
	s.NrTAC = "90123"
	embed := buildBandsEmbed(s)
	found := false
	for _, f := range embed.Fields {
		if strings.Contains(f.Name, "Serving cell") {
			found = true
			if !strings.Contains(f.Value, "0x1A2B3C") || !strings.Contains(f.Value, "0x4D5E6F") {
				t.Errorf("serving cell value=%q", f.Value)
			}
		}
	}
	if !found {
		t.Error("missing Serving cell field")
	}
}

func TestBuildEventsEmbed_WithEvents(t *testing.T) {
	events := []Event{
		{Timestamp: 1000, Type: "conn", Message: "Lost internet", Severity: "warning"},
		{Timestamp: 2000, Type: "conn", Message: "Restored", Severity: "info"},
	}
	embed := buildEventsEmbed(events)
	if embed.Description == "" {
		t.Error("expected non-empty description for events embed")
	}
	if embed.Color != colorBlue {
		t.Errorf("got color %#x, want colorBlue %#x", embed.Color, colorBlue)
	}
}

func TestParseBandOption_StripsBPrefix(t *testing.T) {
	// "B3:B28" -> "3:28" (strip B prefix for LTE AT command)
	got := parseBandOption("B3:B28")
	if got != "3:28" {
		t.Errorf("got %q, want %q", got, "3:28")
	}
}

func TestParseBandOption_StripsNPrefix(t *testing.T) {
	// "n78" -> "78" (strip n prefix for NR AT command)
	got := parseBandOption("n78")
	if got != "78" {
		t.Errorf("got %q, want %q", got, "78")
	}
}

func TestParseBandOption_Auto(t *testing.T) {
	got := parseBandOption("auto")
	if got != "" {
		t.Errorf("got %q, want empty string for auto", got)
	}
}

func TestParseBandOption_MixedPrefixes(t *testing.T) {
	// "B3:n78" mixed is unusual but should handle gracefully
	got := parseBandOption("B3:n78")
	if got != "3:78" {
		t.Errorf("got %q, want %q", got, "3:78")
	}
}

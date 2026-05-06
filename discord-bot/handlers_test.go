package main

import (
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

func TestBuildSignalEmbed_HasTitle(t *testing.T) {
	s := makeStatus("true", "true", "NR5G-NSA")
	embed := buildSignalEmbed(s)
	if embed.Title == "" {
		t.Error("expected non-empty embed title")
	}
}

func TestBuildStatusEmbed_InternetDown(t *testing.T) {
	s := makeStatus("false", "true", "LTE")
	embed := buildStatusEmbed(s)
	found := false
	for _, f := range embed.Fields {
		if f.Name == "Internet" && f.Value != "" {
			found = true
		}
	}
	if !found {
		t.Error("expected Internet field in status embed")
	}
	if embed.Color != colorRed {
		t.Errorf("expected colorRed for internet=false, got %#x", embed.Color)
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

func TestBuildSignalEmbed_TitleIsCorrect(t *testing.T) {
	s := makeStatus("true", "true", "NR5G-NSA")
	embed := buildSignalEmbed(s)
	if embed.Title != "Signal Metrics" {
		t.Errorf("got title %q, want %q", embed.Title, "Signal Metrics")
	}
}

func TestBuildBandsEmbed_Fields(t *testing.T) {
	s := makeStatus("true", "true", "LTE")
	s.LteBand = "3"
	s.NrBand = "78"
	embed := buildBandsEmbed(s)
	if embed.Title != "Band Details" {
		t.Errorf("got title %q, want %q", embed.Title, "Band Details")
	}
	found := false
	for _, f := range embed.Fields {
		if f.Name == "Technology" {
			found = true
		}
	}
	if !found {
		t.Error("expected Technology field in bands embed")
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

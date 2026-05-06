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

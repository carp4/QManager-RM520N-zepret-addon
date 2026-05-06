package main

import (
	"encoding/json"
	"os"
	"testing"
	"time"
)

func writeTempJSON(t *testing.T, v any) string {
	t.Helper()
	f, err := os.CreateTemp("", "cache*.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.NewEncoder(f).Encode(v); err != nil {
		t.Fatal(err)
	}
	f.Close()
	return f.Name()
}

func TestReadStatus_AllFields(t *testing.T) {
	path := writeTempJSON(t, map[string]any{
		"timestamp":       time.Now().Unix(),
		"modem_reachable": true,
		"network": map[string]any{
			"type":         "5G-NSA",
			"carrier":      "SMART",
			"sim_slot":     1,
			"ca_active":    true,
			"ca_count":     2,
			"nr_ca_active": false,
			"wan_ipv4":     "10.0.0.1",
		},
		"lte": map[string]any{"state": "connected", "band": "B3"},
		"nr":  map[string]any{"state": "connected", "band": "n78"},
		"connectivity": map[string]any{
			"internet_available": true,
			"latency_ms":         15.4,
		},
		"signal_per_antenna": map[string]any{
			"nr_rsrp": []any{-95, -97, -99, -101},
			"nr_rsrq": []any{-10, -10, -11, -11},
			"nr_sinr": []any{15.5, 14.0, 12.0, 10.0},
		},
	})
	defer os.Remove(path)

	s, err := readStatus(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if s.ConnInternetAvailable != "true" {
		t.Errorf("ConnInternetAvailable=%q, want true", s.ConnInternetAvailable)
	}
	if s.NetworkType != "5G-NSA" {
		t.Errorf("NetworkType=%q, want 5G-NSA", s.NetworkType)
	}
	if s.Operator != "SMART" {
		t.Errorf("Operator=%q, want SMART", s.Operator)
	}
	if s.LteBand != "B3" {
		t.Errorf("LteBand=%q, want B3", s.LteBand)
	}
	if s.NrBand != "n78" {
		t.Errorf("NrBand=%q, want n78", s.NrBand)
	}
	if s.WanIP != "10.0.0.1" {
		t.Errorf("WanIP=%q, want 10.0.0.1", s.WanIP)
	}
	if s.CaActive != "true" {
		t.Errorf("CaActive=%q, want true", s.CaActive)
	}
	if s.CaCount != "2" {
		t.Errorf("CaCount=%q, want 2", s.CaCount)
	}
	if s.ConnLatency != "15" {
		t.Errorf("ConnLatency=%q, want 15", s.ConnLatency)
	}
	main, ok := s.SignalPerAntenna["main"]
	if !ok {
		t.Fatal("expected main antenna in signal map")
	}
	if main.RSRP != "-95" {
		t.Errorf("main.RSRP=%q, want -95", main.RSRP)
	}
}

func TestReadStatus_Stale(t *testing.T) {
	path := writeTempJSON(t, map[string]any{
		"timestamp": time.Now().Unix() - 60,
	})
	defer os.Remove(path)

	s, _ := readStatus(path)
	if !s.IsStale() {
		t.Error("expected cache to be stale")
	}
}

func TestReadStatus_MissingFile(t *testing.T) {
	_, err := readStatus("/nonexistent/qmanager_status.json")
	if err == nil {
		t.Fatal("expected error for missing file, got nil")
	}
}

func TestReadEvents_ReturnsLast5(t *testing.T) {
	f, _ := os.CreateTemp("", "events*.json")
	defer os.Remove(f.Name())
	for i := 0; i < 8; i++ {
		json.NewEncoder(f).Encode(Event{
			Timestamp: int64(1000 + i),
			Type:      "test",
			Message:   "msg",
			Severity:  "info",
		})
	}
	f.Close()

	events, err := readEvents(f.Name())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(events) != 5 {
		t.Errorf("got %d events, want 5", len(events))
	}
	if events[0].Timestamp != 1003 {
		t.Errorf("first event timestamp=%d, want 1003", events[0].Timestamp)
	}
}

package main

import (
	"encoding/json"
	"os"
	"testing"
	"time"
)

func writeTempJSON(t *testing.T, v any) string {
	t.Helper()
	f, _ := os.CreateTemp("", "cache*.json")
	json.NewEncoder(f).Encode(v)
	f.Close()
	return f.Name()
}

func TestReadStatus_AllFields(t *testing.T) {
	path := writeTempJSON(t, map[string]any{
		"conn_internet_available": "true",
		"conn_latency":            "15",
		"modem_reachable":         "true",
		"network_type":            "NR5G-NSA",
		"cache_time":              time.Now().Unix(),
	})
	defer os.Remove(path)

	s, err := readStatus(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if s.ConnInternetAvailable != "true" {
		t.Errorf("ConnInternetAvailable=%q", s.ConnInternetAvailable)
	}
	if s.NetworkType != "NR5G-NSA" {
		t.Errorf("NetworkType=%q", s.NetworkType)
	}
}

func TestReadStatus_Stale(t *testing.T) {
	path := writeTempJSON(t, map[string]any{
		"cache_time": time.Now().Unix() - 60,
	})
	defer os.Remove(path)

	s, _ := readStatus(path)
	if !s.IsStale() {
		t.Error("expected cache to be stale")
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
	// Should be the last 5 (most recent) — timestamps 1003..1007
	if events[0].Timestamp != 1003 {
		t.Errorf("first event timestamp=%d, want 1003", events[0].Timestamp)
	}
}

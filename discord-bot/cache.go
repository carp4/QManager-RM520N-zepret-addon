package main

import (
	"bufio"
	"encoding/json"
	"os"
	"time"
)

const staleSecs = 30

// ModemStatus mirrors the fields from /tmp/qmanager_status.json written by qmanager_poller.
type ModemStatus struct {
	ConnInternetAvailable string                   `json:"conn_internet_available"`
	ConnLatency           string                   `json:"conn_latency"`
	ConnAvgLatency        string                   `json:"conn_avg_latency"`
	ModemReachable        string                   `json:"modem_reachable"`
	NetworkType           string                   `json:"network_type"`
	Operator              string                   `json:"operator"`
	SignalPerAntenna      map[string]AntennaSignal `json:"signal_per_antenna"`
	LteBand               string                   `json:"lte_band"`
	NrBand                string                   `json:"nr_band"`
	NrState               string                   `json:"nr_state"`
	CaActive              string                   `json:"t2_ca_active"`
	CaCount               string                   `json:"t2_ca_count"`
	NrCaActive            string                   `json:"t2_nr_ca_active"`
	NrCaCount             string                   `json:"t2_nr_ca_count"`
	CarrierComponents     string                   `json:"t2_carrier_components"`
	WanIP                 string                   `json:"wan_ip"`
	SimSlot               string                   `json:"sim_slot"`
	Uptime                string                   `json:"uptime"`
	CpuTemp               string                   `json:"cpu_temp"`
	ServiceStatus         string                   `json:"service_status"`
	CacheTime             int64                    `json:"cache_time"`
}

type AntennaSignal struct {
	RSRP string `json:"rsrp"`
	RSRQ string `json:"rsrq"`
	SINR string `json:"sinr"`
	RSSI string `json:"rssi"`
}

func (s *ModemStatus) IsStale() bool {
	return time.Now().Unix()-s.CacheTime > staleSecs
}

type Event struct {
	Timestamp int64  `json:"timestamp"`
	Type      string `json:"type"`
	Message   string `json:"message"`
	Severity  string `json:"severity"`
}

func readStatus(path string) (*ModemStatus, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var s ModemStatus
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

// readEvents returns the last 5 events from the NDJSON events file.
func readEvents(path string) ([]Event, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var all []Event
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := sc.Bytes()
		if len(line) == 0 {
			continue
		}
		var ev Event
		if json.Unmarshal(line, &ev) == nil {
			all = append(all, ev)
		}
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	if len(all) <= 5 {
		return all, nil
	}
	return all[len(all)-5:], nil
}

package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"time"
)

const staleSecs = 30

// ModemStatus is the flat shape consumed by the embed builders.
// It is populated from the nested pollerCache returned by readStatus.
// Numeric fields from the poller are converted to strings so the embed
// builders can use ifEmpty/format directly without per-field nil handling.
type ModemStatus struct {
	ConnInternetAvailable string
	ConnLatency           string
	ConnAvgLatency        string
	ModemReachable        string
	NetworkType           string
	Operator              string
	SignalPerAntenna      map[string]AntennaSignal
	LteBand               string
	NrBand                string
	NrState               string
	CaActive              string
	CaCount               string
	NrCaActive            string
	NrCaCount             string
	WanIP                 string
	SimSlot               string
	Uptime                string
	CpuTemp               string
	ServiceStatus         string
	CacheTime             int64
}

type AntennaSignal struct {
	RSRP string
	RSRQ string
	SINR string
	RSSI string
}

func (s *ModemStatus) IsStale() bool {
	return time.Now().Unix()-s.CacheTime > staleSecs
}

// pollerCache mirrors the actual /tmp/qmanager_status.json schema written
// by qmanager_poller. Pointer types let us distinguish unset (null) from zero.
type pollerCache struct {
	Timestamp           int64           `json:"timestamp"`
	ModemReachable      bool            `json:"modem_reachable"`
	LastSuccessfulPoll  int64           `json:"last_successful_poll"`
	Network             pollerNetwork   `json:"network"`
	LTE                 pollerRadio     `json:"lte"`
	NR                  pollerRadio     `json:"nr"`
	SignalPerAntenna    pollerAntennas  `json:"signal_per_antenna"`
	Device              pollerDevice    `json:"device"`
	Connectivity        pollerConn      `json:"connectivity"`
}

type pollerNetwork struct {
	Type          string `json:"type"`
	Carrier       string `json:"carrier"`
	SimSlot       *int   `json:"sim_slot"`
	ServiceStatus string `json:"service_status"`
	CaActive      bool   `json:"ca_active"`
	CaCount       *int   `json:"ca_count"`
	NrCaActive    bool   `json:"nr_ca_active"`
	NrCaCount     *int   `json:"nr_ca_count"`
	WanIPv4       string `json:"wan_ipv4"`
}

type pollerRadio struct {
	State string `json:"state"`
	Band  string `json:"band"`
}

type pollerAntennas struct {
	LteRSRP []*float64 `json:"lte_rsrp"`
	LteRSRQ []*float64 `json:"lte_rsrq"`
	LteSINR []*float64 `json:"lte_sinr"`
	NrRSRP  []*float64 `json:"nr_rsrp"`
	NrRSRQ  []*float64 `json:"nr_rsrq"`
	NrSINR  []*float64 `json:"nr_sinr"`
}

type pollerDevice struct {
	Temperature   *float64 `json:"temperature"`
	UptimeSeconds *int64   `json:"uptime_seconds"`
}

type pollerConn struct {
	InternetAvailable *bool    `json:"internet_available"`
	Status            string   `json:"status"`
	LatencyMs         *float64 `json:"latency_ms"`
	AvgLatencyMs      *float64 `json:"avg_latency_ms"`
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
	var p pollerCache
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, err
	}
	return mapPollerToStatus(&p), nil
}

func mapPollerToStatus(p *pollerCache) *ModemStatus {
	s := &ModemStatus{
		CacheTime:        p.Timestamp,
		ModemReachable:   boolStr(p.ModemReachable),
		NetworkType:      p.Network.Type,
		Operator:         p.Network.Carrier,
		SimSlot:          intPtrStr(p.Network.SimSlot),
		ServiceStatus:    p.Network.ServiceStatus,
		CaActive:         boolStr(p.Network.CaActive),
		CaCount:          intPtrStr(p.Network.CaCount),
		NrCaActive:       boolStr(p.Network.NrCaActive),
		NrCaCount:        intPtrStr(p.Network.NrCaCount),
		WanIP:            p.Network.WanIPv4,
		LteBand:          p.LTE.Band,
		NrBand:           p.NR.Band,
		NrState:          p.NR.State,
		CpuTemp:          floatPtrFmt(p.Device.Temperature, "%.1f °C"),
		Uptime:           uptimeStr(p.Device.UptimeSeconds),
		ConnInternetAvailable: boolPtrStr(p.Connectivity.InternetAvailable),
		ConnLatency:           floatPtrFmt(p.Connectivity.LatencyMs, "%.0f"),
		ConnAvgLatency:        floatPtrFmt(p.Connectivity.AvgLatencyMs, "%.0f"),
		SignalPerAntenna:      buildAntennaMap(&p.SignalPerAntenna, p.NR.State == "connected"),
	}
	return s
}

// buildAntennaMap converts the poller's parallel arrays
// (lte_rsrp[4], nr_rsrp[4], etc.) into a per-port map.
// Prefers NR values when an NR connection is active, falls back to LTE.
// RSSI is not exposed by the poller, so it stays empty.
func buildAntennaMap(a *pollerAntennas, preferNR bool) map[string]AntennaSignal {
	ports := []string{"main", "diversity", "mimo3", "mimo4"}
	m := make(map[string]AntennaSignal, 4)
	for i, port := range ports {
		var rsrp, rsrq, sinr *float64
		if preferNR {
			rsrp = atIdx(a.NrRSRP, i)
			rsrq = atIdx(a.NrRSRQ, i)
			sinr = atIdx(a.NrSINR, i)
		}
		if rsrp == nil {
			rsrp = atIdx(a.LteRSRP, i)
		}
		if rsrq == nil {
			rsrq = atIdx(a.LteRSRQ, i)
		}
		if sinr == nil {
			sinr = atIdx(a.LteSINR, i)
		}
		if rsrp == nil && rsrq == nil && sinr == nil {
			continue
		}
		m[port] = AntennaSignal{
			RSRP: floatPtrFmt(rsrp, "%.0f"),
			RSRQ: floatPtrFmt(rsrq, "%.0f"),
			SINR: floatPtrFmt(sinr, "%.1f"),
			RSSI: "",
		}
	}
	return m
}

func atIdx(arr []*float64, i int) *float64 {
	if i < 0 || i >= len(arr) {
		return nil
	}
	return arr[i]
}

func boolStr(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

func boolPtrStr(b *bool) string {
	if b == nil {
		return ""
	}
	return boolStr(*b)
}

func intPtrStr(i *int) string {
	if i == nil {
		return ""
	}
	return fmt.Sprintf("%d", *i)
}

func floatPtrFmt(f *float64, format string) string {
	if f == nil {
		return ""
	}
	return fmt.Sprintf(format, *f)
}

// uptimeStr renders seconds as "Xd Yh Zm" or shorter for sub-day uptimes.
func uptimeStr(secs *int64) string {
	if secs == nil || *secs <= 0 {
		return ""
	}
	s := *secs
	d := s / 86400
	h := (s % 86400) / 3600
	m := (s % 3600) / 60
	if d > 0 {
		return fmt.Sprintf("%dd %dh %dm", d, h, m)
	}
	if h > 0 {
		return fmt.Sprintf("%dh %dm", h, m)
	}
	return fmt.Sprintf("%dm", m)
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

package main

import (
	"fmt"
	"os/exec"
	"strings"
	"time"

	"github.com/bwmarrin/discordgo"
)

const (
	colorGreen  = 0x22c55e
	colorYellow = 0xf59e0b
	colorRed    = 0xef4444
	colorBlue   = 0x3b82f6
	colorGray   = 0x6b7280

	statusCachePath = "/tmp/qmanager_status.json"
	eventsCachePath = "/tmp/qmanager_events.json"
)

func embedColorForInternet(internet string) int {
	switch internet {
	case "true":
		return colorGreen
	case "false":
		return colorRed
	default:
		return colorGray
	}
}

func staleWarning(s *ModemStatus) string {
	if s.IsStale() {
		return "\n⚠ Data may be stale"
	}
	return ""
}

func buildSignalEmbed(s *ModemStatus) *discordgo.MessageEmbed {
	var fields []*discordgo.MessageEmbedField
	ports := []string{"main", "diversity", "mimo3", "mimo4"}
	labels := map[string]string{
		"main": "Main (PRX)", "diversity": "Diversity (DRX)",
		"mimo3": "MIMO 3 (RX2)", "mimo4": "MIMO 4 (RX3)",
	}
	for _, port := range ports {
		ant, ok := s.SignalPerAntenna[port]
		if !ok {
			continue
		}
		fields = append(fields, &discordgo.MessageEmbedField{
			Name:   labels[port],
			Value:  fmt.Sprintf("RSRP: %s dBm\nRSRQ: %s dB\nSINR: %s dB\nRSSI: %s dBm", ant.RSRP, ant.RSRQ, ant.SINR, ant.RSSI),
			Inline: true,
		})
	}
	return &discordgo.MessageEmbed{
		Title:  "Signal Metrics",
		Color:  embedColorForInternet(s.ConnInternetAvailable),
		Fields: fields,
		Footer: &discordgo.MessageEmbedFooter{Text: "QManager" + staleWarning(s)},
	}
}

func buildBandsEmbed(s *ModemStatus) *discordgo.MessageEmbed {
	caInfo := "None"
	if s.CaActive == "true" {
		caInfo = fmt.Sprintf("%s component(s)", s.CaCount)
		if s.NrCaActive == "true" {
			caInfo += fmt.Sprintf(" + NR CA (%s)", s.NrCaCount)
		}
	}
	fields := []*discordgo.MessageEmbedField{
		{Name: "Technology", Value: ifEmpty(s.NetworkType, "Unknown"), Inline: true},
		{Name: "LTE Band", Value: ifEmpty(s.LteBand, "—"), Inline: true},
		{Name: "NR Band", Value: ifEmpty(s.NrBand, "—"), Inline: true},
		{Name: "Carrier Aggregation", Value: caInfo, Inline: false},
	}
	return &discordgo.MessageEmbed{
		Title:  "Band Details",
		Color:  colorBlue,
		Fields: fields,
		Footer: &discordgo.MessageEmbedFooter{Text: "QManager" + staleWarning(s)},
	}
}

func buildStatusEmbed(s *ModemStatus) *discordgo.MessageEmbed {
	internet := "Down"
	color := colorRed
	if s.ConnInternetAvailable == "true" {
		internet = fmt.Sprintf("Up (%s ms)", ifEmpty(s.ConnLatency, "?"))
		color = colorGreen
	}
	modem := "Unreachable"
	if s.ModemReachable == "true" {
		modem = "OK"
	}
	fields := []*discordgo.MessageEmbedField{
		{Name: "Internet", Value: internet, Inline: true},
		{Name: "Modem", Value: modem, Inline: true},
		{Name: "Operator", Value: ifEmpty(s.Operator, "Unknown"), Inline: true},
		{Name: "WAN IP", Value: ifEmpty(s.WanIP, "—"), Inline: true},
		{Name: "SIM Slot", Value: ifEmpty(s.SimSlot, "—"), Inline: true},
		{Name: "CPU Temp", Value: ifEmpty(s.CpuTemp, "—"), Inline: true},
		{Name: "Uptime", Value: ifEmpty(s.Uptime, "—"), Inline: false},
	}
	return &discordgo.MessageEmbed{
		Title:  "Modem Status",
		Color:  color,
		Fields: fields,
		Footer: &discordgo.MessageEmbedFooter{Text: "QManager" + staleWarning(s)},
	}
}

func buildEventsEmbed(events []Event) *discordgo.MessageEmbed {
	if len(events) == 0 {
		return &discordgo.MessageEmbed{
			Title:       "Recent Events",
			Description: "No events recorded yet.",
			Color:       colorGray,
		}
	}
	severityIcon := map[string]string{
		"info": "ℹ️", "warning": "⚠️", "critical": "🔴",
	}
	var lines []string
	for i := len(events) - 1; i >= 0; i-- {
		ev := events[i]
		icon := severityIcon[ev.Severity]
		if icon == "" {
			icon = "•"
		}
		ts := time.Unix(ev.Timestamp, 0).Format("Jan 02 15:04")
		lines = append(lines, fmt.Sprintf("%s **%s** — %s", icon, ts, ev.Message))
	}
	return &discordgo.MessageEmbed{
		Title:       "Recent Events",
		Description: strings.Join(lines, "\n"),
		Color:       colorBlue,
		Footer:      &discordgo.MessageEmbedFooter{Text: "QManager"},
	}
}

func ifEmpty(s, fallback string) string {
	if s == "" {
		return fallback
	}
	return s
}

func runQcmd(atCmd string) (string, bool) {
	out, _ := exec.Command("/usr/bin/qcmd", atCmd).CombinedOutput()
	response := strings.TrimSpace(string(out))
	return response, strings.Contains(response, "OK")
}

func handleInteraction(s *discordgo.Session, i *discordgo.InteractionCreate) {
	switch i.Type {
	case discordgo.InteractionApplicationCommand:
		handleCommand(s, i)
	case discordgo.InteractionMessageComponent:
		handleComponent(s, i)
	}
}

func handleCommand(s *discordgo.Session, i *discordgo.InteractionCreate) {
	name := i.ApplicationCommandData().Name
	switch name {
	case "signal":
		handleSignal(s, i)
	case "bands":
		handleBands(s, i)
	case "status":
		handleStatus(s, i)
	case "events":
		handleEvents(s, i)
	case "reboot":
		handleReboot(s, i)
	case "lock-band":
		handleLockBand(s, i)
	case "network-mode":
		handleNetworkMode(s, i)
	}
}

func respondEmbed(s *discordgo.Session, i *discordgo.InteractionCreate, embed *discordgo.MessageEmbed) {
	s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{Embeds: []*discordgo.MessageEmbed{embed}},
	})
}

func respondError(s *discordgo.Session, i *discordgo.InteractionCreate, msg string) {
	s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{Content: "❌ " + msg},
	})
}

func handleSignal(s *discordgo.Session, i *discordgo.InteractionCreate) {
	ms, err := readStatus(statusCachePath)
	if err != nil {
		respondError(s, i, "Could not read modem status cache.")
		return
	}
	respondEmbed(s, i, buildSignalEmbed(ms))
}

func handleBands(s *discordgo.Session, i *discordgo.InteractionCreate) {
	ms, err := readStatus(statusCachePath)
	if err != nil {
		respondError(s, i, "Could not read modem status cache.")
		return
	}
	respondEmbed(s, i, buildBandsEmbed(ms))
}

func handleStatus(s *discordgo.Session, i *discordgo.InteractionCreate) {
	ms, err := readStatus(statusCachePath)
	if err != nil {
		respondError(s, i, "Could not read modem status cache.")
		return
	}
	respondEmbed(s, i, buildStatusEmbed(ms))
}

func handleEvents(s *discordgo.Session, i *discordgo.InteractionCreate) {
	events, err := readEvents(eventsCachePath)
	if err != nil {
		events = []Event{}
	}
	respondEmbed(s, i, buildEventsEmbed(events))
}

// handleReboot, handleComponent, handleLockBand, handleNetworkMode
// are implemented in Task 5.
func handleReboot(_ *discordgo.Session, _ *discordgo.InteractionCreate)      {}
func handleComponent(_ *discordgo.Session, _ *discordgo.InteractionCreate)   {}
func handleLockBand(_ *discordgo.Session, _ *discordgo.InteractionCreate)    {}
func handleNetworkMode(_ *discordgo.Session, _ *discordgo.InteractionCreate) {}

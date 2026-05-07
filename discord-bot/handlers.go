package main

import (
	"fmt"
	"log"
	"os/exec"
	"strings"
	"time"

	"github.com/bwmarrin/discordgo"
)

const (
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
		caInfo = fmt.Sprintf("%s component(s)", ifEmpty(s.CaCount, "?"))
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
	out, err := exec.Command("/usr/bin/qcmd", atCmd).CombinedOutput()
	if err != nil {
		log.Printf("qcmd exec error (%s): %v", atCmd, err)
	}
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
	if err := s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{Embeds: []*discordgo.MessageEmbed{embed}},
	}); err != nil {
		log.Printf("InteractionRespond error: %v", err)
	}
}

func respondError(s *discordgo.Session, i *discordgo.InteractionCreate, msg string) {
	if err := s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{Content: "❌ " + msg},
	}); err != nil {
		log.Printf("InteractionRespond error: %v", err)
	}
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
		log.Printf("readEvents error: %v", err)
		events = []Event{}
	}
	respondEmbed(s, i, buildEventsEmbed(events))
}

// parseBandOption converts user input (e.g. "B3:B28" or "n78") to AT format (e.g. "3:28" or "78").
// Strips both B/b (LTE) and n/N (NR) prefixes. Returns "" for "auto" (caller sends "0" = all bands).
func parseBandOption(input string) string {
	if strings.EqualFold(strings.TrimSpace(input), "auto") {
		return ""
	}
	parts := strings.Split(input, ":")
	clean := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		upper := strings.ToUpper(p)
		if strings.HasPrefix(upper, "B") {
			p = upper[1:]
		} else if strings.HasPrefix(upper, "N") {
			p = upper[1:]
		}
		if p != "" {
			clean = append(clean, p)
		}
	}
	return strings.Join(clean, ":")
}

func handleReboot(s *discordgo.Session, i *discordgo.InteractionCreate) {
	if err := s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{
			Content: "⚠️ **Reboot the modem?** This will disconnect all clients for ~30 seconds.",
			Components: []discordgo.MessageComponent{
				discordgo.ActionsRow{
					Components: []discordgo.MessageComponent{
						discordgo.Button{
							Label:    "Confirm Reboot",
							Style:    discordgo.DangerButton,
							CustomID: "reboot_confirm",
						},
						discordgo.Button{
							Label:    "Cancel",
							Style:    discordgo.SecondaryButton,
							CustomID: "reboot_cancel",
						},
					},
				},
			},
		},
	}); err != nil {
		log.Printf("InteractionRespond error (reboot): %v", err)
	}
	go func() {
		time.Sleep(30 * time.Second)
		disabledRow := discordgo.ActionsRow{
			Components: []discordgo.MessageComponent{
				discordgo.Button{Label: "Confirm Reboot", Style: discordgo.DangerButton, CustomID: "reboot_confirm", Disabled: true},
				discordgo.Button{Label: "Cancel", Style: discordgo.SecondaryButton, CustomID: "reboot_cancel", Disabled: true},
			},
		}
		content := "⚠️ **Reboot the modem?** *(expired)*"
		_, err := s.InteractionResponseEdit(i.Interaction, &discordgo.WebhookEdit{
			Content:    &content,
			Components: &[]discordgo.MessageComponent{disabledRow},
		})
		if err != nil {
			log.Printf("InteractionResponseEdit error (reboot expiry): %v", err)
		}
	}()
}

func handleComponent(s *discordgo.Session, i *discordgo.InteractionCreate) {
	switch i.MessageComponentData().CustomID {
	case "reboot_confirm":
		if err := s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
			Type: discordgo.InteractionResponseDeferredMessageUpdate,
		}); err != nil {
			log.Printf("InteractionRespond error (reboot_confirm defer): %v", err)
		}
		_, ok := runQcmd(`AT+QPOWD=1`)
		content := "✅ Reboot command sent. Reconnecting in ~30s..."
		if !ok {
			content = "❌ Reboot command failed. Check modem status."
		}
		disabledRow := discordgo.ActionsRow{
			Components: []discordgo.MessageComponent{
				discordgo.Button{Label: "Confirm Reboot", Style: discordgo.DangerButton, CustomID: "reboot_confirm", Disabled: true},
				discordgo.Button{Label: "Cancel", Style: discordgo.SecondaryButton, CustomID: "reboot_cancel", Disabled: true},
			},
		}
		_, errEdit := s.InteractionResponseEdit(i.Interaction, &discordgo.WebhookEdit{
			Content:    &content,
			Components: &[]discordgo.MessageComponent{disabledRow},
		})
		if errEdit != nil {
			log.Printf("InteractionResponseEdit error (reboot_confirm): %v", errEdit)
		}
	case "reboot_cancel":
		content := "Reboot cancelled."
		disabledRow := discordgo.ActionsRow{
			Components: []discordgo.MessageComponent{
				discordgo.Button{Label: "Confirm Reboot", Style: discordgo.DangerButton, CustomID: "reboot_confirm", Disabled: true},
				discordgo.Button{Label: "Cancel", Style: discordgo.SecondaryButton, CustomID: "reboot_cancel", Disabled: true},
			},
		}
		if err := s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
			Type: discordgo.InteractionResponseUpdateMessage,
			Data: &discordgo.InteractionResponseData{
				Content:    content,
				Components: []discordgo.MessageComponent{disabledRow},
			},
		}); err != nil {
			log.Printf("InteractionRespond error (reboot_cancel): %v", err)
		}
	}
}

func handleLockBand(s *discordgo.Session, i *discordgo.InteractionCreate) {
	if err := s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseDeferredChannelMessageWithSource,
	}); err != nil {
		log.Printf("InteractionRespond error (lock-band defer): %v", err)
	}

	opts := i.ApplicationCommandData().Options
	optMap := map[string]string{}
	for _, o := range opts {
		optMap[o.Name] = o.StringValue()
	}

	var results []string

	if lteBandInput, ok := optMap["lte_bands"]; ok {
		parsed := parseBandOption(lteBandInput)
		atVal := parsed
		if atVal == "" {
			atVal = "0" // 0 = all bands (unlock)
		}
		_, cmdOK := runQcmd(fmt.Sprintf(`AT+QNWPREFCFG="lte_band",%s`, atVal))
		if cmdOK {
			if parsed == "" {
				results = append(results, "LTE: unlocked (auto)")
			} else {
				display := "B" + strings.ReplaceAll(parsed, ":", "/B")
				results = append(results, fmt.Sprintf("LTE: locked to %s", display))
			}
		} else {
			results = append(results, "LTE: command failed")
		}
	}

	if nrBandInput, ok := optMap["nr_bands"]; ok {
		parsed := parseBandOption(nrBandInput)
		atVal := parsed
		if atVal == "" {
			atVal = "0"
		}
		_, cmdOK := runQcmd(fmt.Sprintf(`AT+QNWPREFCFG="nr5g_band",%s`, atVal))
		if cmdOK {
			if parsed == "" {
				results = append(results, "NR: unlocked (auto)")
			} else {
				display := "n" + strings.ReplaceAll(parsed, ":", "/n")
				results = append(results, fmt.Sprintf("NR: locked to %s", display))
			}
		} else {
			results = append(results, "NR: command failed")
		}
	}

	if len(results) == 0 {
		results = append(results, "No bands specified. Use lte_bands and/or nr_bands options.")
	}

	content := "🔒 Band lock result:\n" + strings.Join(results, "\n")
	_, errEdit := s.InteractionResponseEdit(i.Interaction, &discordgo.WebhookEdit{Content: &content})
	if errEdit != nil {
		log.Printf("InteractionResponseEdit error (lock-band): %v", errEdit)
	}
}

func handleNetworkMode(s *discordgo.Session, i *discordgo.InteractionCreate) {
	if err := s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseDeferredChannelMessageWithSource,
	}); err != nil {
		log.Printf("InteractionRespond error (network-mode defer): %v", err)
	}

	mode := i.ApplicationCommandData().Options[0].StringValue()
	_, ok := runQcmd(fmt.Sprintf(`AT+QNWPREFCFG="mode_pref",%s`, mode))

	modeLabel := map[string]string{
		"AUTO": "Auto (LTE + NR)", "LTE": "LTE only",
		"NR5G": "NR only", "NR5G:LTE": "NR preferred",
	}
	label := modeLabel[mode]
	if label == "" {
		label = mode
	}

	content := fmt.Sprintf("✅ Network mode set to: **%s**", label)
	if !ok {
		content = fmt.Sprintf("❌ Failed to set network mode to %s. Check modem status.", label)
	}
	_, errEdit := s.InteractionResponseEdit(i.Interaction, &discordgo.WebhookEdit{Content: &content})
	if errEdit != nil {
		log.Printf("InteractionResponseEdit error (network-mode): %v", errEdit)
	}
}

package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strconv"
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
	bucket := signalQualityBucket(s.SignalPerAntenna)
	primary := "LTE primary"
	if s.NrState == "connected" {
		primary = "NR primary"
	}
	descr := fmt.Sprintf("%s %s · %s · %s",
		qualityEmojiForBucket(bucket),
		capitalize(bucket),
		primary,
		signalQualityBars(bucket),
	)

	ports := []string{"main", "diversity", "mimo3", "mimo4"}
	labels := map[string]string{
		"main": "Main (PRX)", "diversity": "Diversity (DRX)",
		"mimo3": "MIMO 3 (RX2)", "mimo4": "MIMO 4 (RX3)",
	}
	var fields []*discordgo.MessageEmbedField
	for _, port := range ports {
		ant, ok := s.SignalPerAntenna[port]
		if !ok {
			continue
		}
		portEmoji := perPortEmoji(ant.RSRP)
		fields = append(fields, &discordgo.MessageEmbedField{
			Name: fmt.Sprintf("%s %s", portEmoji, labels[port]),
			Value: fmt.Sprintf("RSRP %s dBm  SINR %s dB\nRSRQ %s dB",
				ifEmpty(ant.RSRP, "—"), ifEmpty(ant.SINR, "—"), ifEmpty(ant.RSRQ, "—"),
			),
			Inline: true,
		})
	}

	if note := provenanceNote(s); note != "" {
		fields = append(fields, &discordgo.MessageEmbedField{
			Name: "ℹ️ Source", Value: note, Inline: false,
		})
	}

	return &discordgo.MessageEmbed{
		Author:      authorBlock(s),
		Title:       "Signal Metrics",
		Description: descr,
		Color:       embedColor(s),
		Fields:      fields,
		Footer:      footerBlock(s),
		Timestamp:   time.Unix(s.CacheTime, 0).Format(time.RFC3339),
	}
}

func qualityEmojiForBucket(b string) string {
	switch b {
	case "excellent", "good":
		return emoji.Ok
	case "fair":
		return emoji.Warn
	case "poor":
		return emoji.Down
	default:
		return emoji.Unknown
	}
}

func perPortEmoji(rsrpStr string) string {
	if rsrpStr == "" {
		return emoji.Unknown
	}
	v, err := strconv.ParseFloat(rsrpStr, 64)
	if err != nil {
		return emoji.Unknown
	}
	switch {
	case v >= -90:
		return emoji.Ok
	case v >= -110:
		return emoji.Warn
	default:
		return emoji.Down
	}
}

func provenanceNote(s *ModemStatus) string {
	switch {
	case s.NrState == "connected" && s.LteState == "connected":
		return "Showing NR values (EN-DC active — LTE leg also connected)"
	case s.NrState == "connected":
		return "Showing NR values"
	case s.LteState == "connected":
		return "Showing LTE values"
	default:
		return ""
	}
}

const maxVisibleCCs = 6

func buildBandsEmbed(s *ModemStatus) *discordgo.MessageEmbed {
	descr := buildBandsDescription(s)
	color := embedColor(s)

	var fields []*discordgo.MessageEmbedField

	if len(s.CarrierComponents) == 0 {
		// Fallback — show whatever single-band data we have.
		if s.LteBand != "" {
			fields = append(fields, &discordgo.MessageEmbedField{
				Name: emoji.Network + " LTE Band", Value: s.LteBand, Inline: true,
			})
		}
		if s.NrBand != "" {
			fields = append(fields, &discordgo.MessageEmbedField{
				Name: emoji.Network + " NR Band", Value: s.NrBand, Inline: true,
			})
		}
	} else {
		visible := s.CarrierComponents
		if len(visible) > maxVisibleCCs {
			visible = visible[:maxVisibleCCs]
		}
		for _, cc := range visible {
			fields = append(fields, ccField(cc))
		}
		if len(s.CarrierComponents) > maxVisibleCCs {
			fields = append(fields, &discordgo.MessageEmbedField{
				Name:   "More carriers",
				Value:  fmt.Sprintf("+%d more — use Copy raw to view", len(s.CarrierComponents)-maxVisibleCCs),
				Inline: false,
			})
		}
	}

	if s.LteCellID != "" || s.NrCellID != "" {
		fields = append(fields, servingCellField(s), tacField(s))
	}

	return &discordgo.MessageEmbed{
		Author:      authorBlock(s),
		Title:       "Band Details",
		Description: descr,
		Color:       color,
		Fields:      fields,
		Footer:      footerBlock(s),
		Timestamp:   time.Unix(s.CacheTime, 0).Format(time.RFC3339),
	}
}

func buildBandsDescription(s *ModemStatus) string {
	if s.ModemReachable != "true" {
		return emoji.Down + " Modem unreachable"
	}
	stalePrefix := ""
	if s.CacheTime > 0 && time.Now().Unix()-s.CacheTime > embedStaleSecs {
		stalePrefix = emoji.Stale + " Stale · "
	}
	bw := s.TotalBandwidthMHz
	if bw == "" {
		bw = "?"
	}
	n := len(s.CarrierComponents)
	if n == 0 {
		return stalePrefix + emoji.Warn + " No CA data — single-carrier or modem report unavailable"
	}
	hasLte, hasNr := false, false
	for _, cc := range s.CarrierComponents {
		if cc.Technology == "LTE" {
			hasLte = true
		}
		if cc.Technology == "NR" {
			hasNr = true
		}
	}
	var label string
	switch {
	case hasLte && hasNr:
		label = "EN-DC active"
	case hasLte && n > 1:
		label = "LTE-A active"
	case hasNr && n > 1:
		label = "NR-CA active"
	default:
		label = "Single carrier"
	}
	if n == 1 {
		return fmt.Sprintf("%s%s %s • %s %s MHz", stalePrefix, emoji.Ok, label, emoji.NavBands, bw)
	}
	return fmt.Sprintf("%s%s %s • %s %s MHz total • %s %d carriers",
		stalePrefix, emoji.Ok, label, emoji.NavBands, bw, emoji.SCC, n)
}

func ccField(cc CarrierComponent) *discordgo.MessageEmbedField {
	arfcnLabel := "EARFCN"
	if cc.Technology == "NR" {
		arfcnLabel = "ARFCN"
	}
	name := fmt.Sprintf("%s %s · %s %s", ccEmoji(cc.Type, cc.Technology), cc.Type, cc.Technology, cc.Band)
	value := fmt.Sprintf("%s PCI %s\n%s %s %s\n%s %s MHz\n%s RSRP %s / SINR %s",
		emoji.PCI, ifEmpty(cc.PCI, "—"),
		emoji.EARFCN, arfcnLabel, ifEmpty(cc.EARFCN, "—"),
		emoji.Bandwidth, ifEmpty(cc.BandwidthMHz, "—"),
		emoji.Signal, ifEmpty(cc.RSRP, "—"), ifEmpty(cc.SINR, "—"),
	)
	return &discordgo.MessageEmbedField{Name: name, Value: value, Inline: true}
}

func servingCellField(s *ModemStatus) *discordgo.MessageEmbedField {
	parts := []string{}
	if s.LteCellID != "" {
		parts = append(parts, "LTE: "+s.LteCellID)
	}
	if s.NrCellID != "" {
		parts = append(parts, "NR: "+s.NrCellID)
	}
	return &discordgo.MessageEmbedField{
		Name:   emoji.Cell + " Serving cell",
		Value:  strings.Join(parts, " · "),
		Inline: false,
	}
}

func tacField(s *ModemStatus) *discordgo.MessageEmbedField {
	parts := []string{}
	if s.LteTAC != "" || s.LteCellID != "" {
		parts = append(parts, fmt.Sprintf("LTE: %s (cell %s)", ifEmpty(s.LteTAC, "—"), ifEmpty(s.LteCellID, "—")))
	}
	if s.NrTAC != "" || s.NrCellID != "" {
		parts = append(parts, fmt.Sprintf("NR: %s (cell %s)", ifEmpty(s.NrTAC, "—"), ifEmpty(s.NrCellID, "—")))
	}
	return &discordgo.MessageEmbedField{
		Name:   emoji.TAC + " TAC / Cell ID",
		Value:  strings.Join(parts, " · "),
		Inline: false,
	}
}

func buildStatusEmbed(s *ModemStatus) *discordgo.MessageEmbed {
	descr := buildStatusDescription(s)
	color := embedColor(s)

	fields := []*discordgo.MessageEmbedField{
		connectionField(s),
		networkField(s),
		uptimeField(s),
		watchcatField(s),
		deviceMetricsField(s),
	}
	if scc := sccHandoffsField(s); scc != nil {
		fields = append(fields, scc)
	}

	return &discordgo.MessageEmbed{
		Author:      authorBlock(s),
		Title:       "Modem Status",
		Description: descr,
		Color:       color,
		Fields:      fields,
		Footer:      footerBlock(s),
		Timestamp:   time.Unix(s.CacheTime, 0).Format(time.RFC3339),
	}
}

func buildStatusDescription(s *ModemStatus) string {
	if s.ModemReachable != "true" {
		return emoji.Down + " Modem unreachable"
	}
	if s.ConnInternetAvailable == "false" {
		return emoji.Down + " Internet down · modem reachable"
	}
	if s.ConnInternetAvailable != "true" {
		return emoji.Unknown + " Connectivity unknown"
	}
	parts := []string{emoji.Ok + " Internet up"}
	if s.ConnLatency != "" {
		parts = append(parts, s.ConnLatency+" ms")
	}
	if s.RxRate != "" {
		if rx, err := strconv.ParseInt(s.RxRate, 10, 64); err == nil {
			parts = append(parts, "↓ "+formatBytes(rx))
		}
	}
	if s.TxRate != "" {
		if tx, err := strconv.ParseInt(s.TxRate, 10, 64); err == nil {
			parts = append(parts, "↑ "+formatBytes(tx))
		}
	}
	return strings.Join(parts, " · ")
}

func connectionField(s *ModemStatus) *discordgo.MessageEmbedField {
	state := "Up"
	if s.ConnInternetAvailable != "true" {
		state = "Down"
	}
	line1Parts := []string{state}
	if s.ConnLatency != "" {
		line1Parts = append(line1Parts, "· "+s.ConnLatency+" ms")
	}
	if s.ConnAvgLatency != "" || s.ConnJitter != "" {
		extra := []string{}
		if s.ConnAvgLatency != "" {
			extra = append(extra, "avg "+s.ConnAvgLatency)
		}
		if s.ConnJitter != "" {
			extra = append(extra, "jitter "+s.ConnJitter)
		}
		line1Parts = append(line1Parts, "("+strings.Join(extra, ", ")+")")
	}
	line2Parts := []string{}
	if s.ConnPacketLoss != "" {
		line2Parts = append(line2Parts, s.ConnPacketLoss+"% loss")
	}
	if s.PingTarget != "" {
		line2Parts = append(line2Parts, "ping "+s.PingTarget)
	}
	value := strings.Join(line1Parts, " ")
	if len(line2Parts) > 0 {
		value += "\n" + strings.Join(line2Parts, " · ")
	}
	return &discordgo.MessageEmbedField{
		Name: emoji.Connection + " Connection", Value: value, Inline: true,
	}
}

func networkField(s *ModemStatus) *discordgo.MessageEmbedField {
	line1 := []string{}
	if s.Operator != "" {
		line1 = append(line1, s.Operator)
	}
	if s.NetworkType != "" {
		line1 = append(line1, s.NetworkType)
	}
	if s.SimSlot != "" {
		line1 = append(line1, "SIM "+s.SimSlot)
	}
	value := strings.Join(line1, " · ")
	if s.WanIP != "" {
		value += "\nWAN " + s.WanIP
	}
	return &discordgo.MessageEmbedField{
		Name: emoji.Network + " Network", Value: ifEmpty(value, "—"), Inline: true,
	}
}

func uptimeField(s *ModemStatus) *discordgo.MessageEmbedField {
	value := fmt.Sprintf("Connection: %s\nDevice: %s",
		ifEmpty(s.ConnUptime, "—"), ifEmpty(s.Uptime, "—"))
	return &discordgo.MessageEmbedField{
		Name: emoji.Uptime + " Uptime", Value: value, Inline: true,
	}
}

func watchcatField(s *ModemStatus) *discordgo.MessageEmbedField {
	state := s.WatchcatState
	if state == "" {
		state = "Unknown"
	}
	failures := ifEmpty(s.WatchcatFailures, "0")
	last := "never"
	if s.WatchcatLastTime != "" && s.WatchcatLastTime != "0" {
		if ts, err := strconv.ParseInt(s.WatchcatLastTime, 10, 64); err == nil && ts > 0 {
			last = relativeTime(ts)
		}
	}
	value := fmt.Sprintf("%s · %s failures\nLast recovery: %s", state, failures, last)
	return &discordgo.MessageEmbedField{
		Name: emoji.Watchcat + " Watchcat", Value: value, Inline: true,
	}
}

func deviceMetricsField(s *ModemStatus) *discordgo.MessageEmbedField {
	parts := []string{}
	if s.CpuUsage != "" {
		parts = append(parts, "CPU "+s.CpuUsage+"%")
	}
	if s.CpuTemp != "" {
		parts = append(parts, s.CpuTemp)
	}
	if s.MemUsedMB != "" && s.MemTotalMB != "" {
		parts = append(parts, "Mem "+s.MemUsedMB+"/"+s.MemTotalMB+" MB")
	}
	return &discordgo.MessageEmbedField{
		Name: emoji.Device + " Device", Value: ifEmpty(strings.Join(parts, " · "), "—"), Inline: true,
	}
}

// sccHandoffsField returns a field summarizing scc_pci_change events in the
// last 24h, or nil if events log unreadable / no events.
func sccHandoffsField(s *ModemStatus) *discordgo.MessageEmbedField {
	count, err := countSccHandoffs24h(eventsCachePath)
	if err != nil || count == 0 {
		return nil
	}
	return &discordgo.MessageEmbedField{
		Name:   emoji.Cells24h + " SCC handoffs (24h)",
		Value:  fmt.Sprintf("%d PCI changes detected", count),
		Inline: true,
	}
}

func countSccHandoffs24h(path string) (int, error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, err
	}
	defer f.Close()
	cutoff := time.Now().Unix() - 86400
	count := 0
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := sc.Bytes()
		if len(line) == 0 {
			continue
		}
		var ev Event
		if json.Unmarshal(line, &ev) != nil {
			continue
		}
		if ev.Type == "scc_pci_change" && ev.Timestamp >= cutoff {
			count++
		}
	}
	return count, sc.Err()
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

// captureDMFromInteraction extracts the DM channel ID when the owner invokes a
// slash command in their BotDM context. Discord does not deliver MESSAGE_CREATE
// Gateway events to user-installed apps (applications.commands scope only), but
// InteractionCreate IS delivered and carries the ChannelID of the invoking channel.
//
// Note: discordgo v0.28.1 does not expose discordgo.InteractionContextBotDM, so
// we fall back to GuildID == "" as the BotDM signal. Guild-installed commands
// always have a non-empty GuildID, so this correctly filters out guild invocations.
// Any other DM (e.g. a shared-DM channel that isn't ours) can't be targeted by
// ChannelMessageSend anyway, so the GuildID check is sufficient in practice.
func captureDMFromInteraction(i *discordgo.InteractionCreate, dmCh *dmChannelHolder, ownerID string) {
	// Resolve the invoking user — User is populated in DM context, Member.User in guild context.
	var userID string
	if i.User != nil {
		userID = i.User.ID
	} else if i.Member != nil && i.Member.User != nil {
		userID = i.Member.User.ID
	}
	if userID != ownerID {
		return
	}
	// Only capture when invoked in a DM (no guild). GuildID is empty for both
	// BotDM and PrivateChannel (shared user DM) contexts. We accept both here;
	// PrivateChannel IDs cannot be messaged by the bot, but they're rare and the
	// worst outcome is a failed ChannelMessageSend that triggers the fallback path.
	if i.GuildID != "" {
		return
	}
	chID := i.ChannelID
	if chID == "" || chID == dmCh.get() {
		return
	}
	dmCh.set(chID)
	if err := saveDMChannelID(dmChannelPath, chID); err != nil {
		log.Printf("warning: failed to persist captured DM channel: %v", err)
		return
	}
	log.Printf("captured DM channel from interaction: %s", chID)
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

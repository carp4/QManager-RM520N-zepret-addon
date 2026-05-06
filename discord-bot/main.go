package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/bwmarrin/discordgo"
)

func main() {
	cfg, err := loadConfig(configPath)
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}
	if !cfg.Enabled {
		log.Println("Discord bot is disabled in config. Exiting.")
		os.Exit(0)
	}
	if cfg.BotToken == "" || cfg.OwnerDiscordID == "" {
		log.Fatal("bot_token and owner_discord_id must be set in config")
	}

	writeStatus(statusPath, BotStatus{Connected: false, Error: "starting"})

	s, err := newSession(cfg.BotToken)
	if err != nil {
		writeStatus(statusPath, BotStatus{Connected: false, Error: "session_error"})
		log.Fatalf("failed to create Discord session: %v", err)
	}

	s.AddHandler(handleInteraction)

	s.AddHandler(func(s *discordgo.Session, r *discordgo.Ready) {
		log.Printf("Discord bot ready: %s#%s", r.User.Username, r.User.Discriminator)
		writeStatus(statusPath, BotStatus{Connected: true, LatencyMs: int(s.HeartbeatLatency().Milliseconds())})
	})

	if err := s.Open(); err != nil {
		writeStatus(statusPath, BotStatus{Connected: false, Error: "invalid_token"})
		log.Fatalf("failed to open Discord session: %v", err)
	}
	defer s.Close()

	appID := appIDFromToken(cfg.BotToken)
	if _, err := registerCommands(s, appID); err != nil {
		log.Printf("warning: failed to register slash commands: %v", err)
	}

	dmChannelID, err := openDMChannel(s, cfg.OwnerDiscordID)
	if err != nil {
		log.Printf("warning: failed to open DM channel with owner: %v", err)
	}

	stopNotifier := make(chan struct{})
	if dmChannelID != "" {
		go RunNotifier(s, dmChannelID, cfg, stopNotifier)
	}

	// Periodic status update
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			writeStatus(statusPath, BotStatus{
				Connected: s.DataReady,
				LatencyMs: int(s.HeartbeatLatency().Milliseconds()),
			})
		}
	}()

	log.Println("Discord bot running. Press Ctrl+C to stop.")
	sc := make(chan os.Signal, 1)
	signal.Notify(sc, syscall.SIGINT, syscall.SIGTERM)
	<-sc

	close(stopNotifier)
	writeStatus(statusPath, BotStatus{Connected: false, Error: ""})
	log.Println("Discord bot stopped.")
}

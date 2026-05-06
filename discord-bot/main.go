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

	appID := appIDFromToken(cfg.BotToken)

	writeStatus(statusPath, BotStatus{Connected: false, Error: "starting", AppID: appID})

	s, err := newSession(cfg.BotToken)
	if err != nil {
		writeStatus(statusPath, BotStatus{Connected: false, Error: "session_error", AppID: appID})
		log.Fatalf("failed to create Discord session: %v", err)
	}

	s.AddHandler(handleInteraction)

	s.AddHandler(func(s *discordgo.Session, r *discordgo.Ready) {
		log.Printf("Discord bot ready: %s#%s", r.User.Username, r.User.Discriminator)
		writeStatus(statusPath, BotStatus{Connected: true, LatencyMs: int(s.HeartbeatLatency().Milliseconds()), AppID: appID})
	})

	if err := s.Open(); err != nil {
		writeStatus(statusPath, BotStatus{Connected: false, Error: "invalid_token", AppID: appID})
		log.Fatalf("failed to open Discord session: %v", err)
	}
	defer s.Close()

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

	// Test DM trigger watcher — CGI test.sh creates /tmp/qmanager_discord_test
	stopTestWatcher := make(chan struct{})
	if dmChannelID != "" {
		go runTestDMWatcher(s, dmChannelID, stopTestWatcher)
	}

	// Periodic status update
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			writeStatus(statusPath, BotStatus{
				Connected: s.DataReady,
				LatencyMs: int(s.HeartbeatLatency().Milliseconds()),
				AppID:     appID,
			})
		}
	}()

	log.Println("Discord bot running. Press Ctrl+C to stop.")
	sc := make(chan os.Signal, 1)
	signal.Notify(sc, syscall.SIGINT, syscall.SIGTERM)
	<-sc

	close(stopNotifier)
	close(stopTestWatcher)
	writeStatus(statusPath, BotStatus{Connected: false, Error: "", AppID: appID})
	log.Println("Discord bot stopped.")
}

const testDMTriggerPath = "/tmp/qmanager_discord_test"

// runTestDMWatcher polls for a trigger file written by the test.sh CGI;
// when found, it sends a confirmation DM and removes the trigger.
func runTestDMWatcher(s *discordgo.Session, dmChannelID string, stopCh <-chan struct{}) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-stopCh:
			return
		case <-ticker.C:
			if _, err := os.Stat(testDMTriggerPath); err != nil {
				continue
			}
			os.Remove(testDMTriggerPath)
			if _, err := s.ChannelMessageSend(dmChannelID, "✅ Test DM from QManager — your Discord bot is working."); err != nil {
				log.Printf("test DM send failed: %v", err)
			}
		}
	}
}

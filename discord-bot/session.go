package main

import (
	"encoding/base64"
	"strings"

	"github.com/bwmarrin/discordgo"
)

// appIDFromToken extracts the Discord application ID from the bot token.
// Discord bot tokens are: base64(app_id) + "." + timestamp + "." + hmac
func appIDFromToken(token string) string {
	parts := strings.SplitN(token, ".", 3)
	if len(parts) == 0 {
		return ""
	}
	b64 := parts[0]
	for len(b64)%4 != 0 {
		b64 += "="
	}
	decoded, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return ""
	}
	return string(decoded)
}

// openDMChannel creates (or retrieves existing) DM channel with the owner.
func openDMChannel(s *discordgo.Session, ownerID string) (string, error) {
	ch, err := s.UserChannelCreate(ownerID)
	if err != nil {
		return "", err
	}
	return ch.ID, nil
}

func newSession(token string) (*discordgo.Session, error) {
	s, err := discordgo.New("Bot " + token)
	if err != nil {
		return nil, err
	}
	s.Identify.Intents = discordgo.IntentsDirectMessages
	return s, nil
}

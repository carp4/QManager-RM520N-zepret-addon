// Types for the Discord bot feature.
// Backend: /cgi-bin/quecmanager/monitoring/discord_bot/configure.sh

export interface DiscordBotSettings {
  enabled: boolean;
  token_set: boolean;
  owner_discord_id: string;
  threshold_minutes: number;
}

export interface DiscordBotStatus {
  connected: boolean;
  last_seen: number;
  latency_ms: number;
  error?: string;
  installed: boolean;
}

export interface DiscordBotSavePayload {
  action: "save_settings";
  enabled: boolean;
  owner_discord_id: string;
  threshold_minutes: number;
  bot_token?: string;
}

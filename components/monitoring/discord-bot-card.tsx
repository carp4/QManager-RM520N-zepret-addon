"use client";

import { useState } from "react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2Icon, XCircleIcon, MinusCircleIcon,
  SendIcon, Loader2Icon,
} from "lucide-react";
import { SaveButton, useSaveFlash } from "@/components/ui/save-button";
import { useDiscordBot } from "@/hooks/use-discord-bot";
import type { DiscordBotSavePayload } from "@/types/discord-bot";

export function DiscordBotCard() {
  const {
    settings, status, isLoading, isSaving, isSendingTest,
    error, saveSettings, sendTestDm, enable, disable, refresh,
  } = useDiscordBot();

  const { saved, markSaved } = useSaveFlash();

  const [token, setToken] = useState("");
  const [ownerID, setOwnerID] = useState("");
  const [threshold, setThreshold] = useState(5);
  const [enabled, setEnabled] = useState(false);

  // Sync local state when settings load
  if (settings && ownerID === "" && settings.owner_discord_id) {
    setOwnerID(settings.owner_discord_id);
    setThreshold(settings.threshold_minutes);
    setEnabled(settings.enabled);
  }

  const handleSave = async () => {
    const payload: DiscordBotSavePayload = {
      action: "save_settings",
      enabled,
      owner_discord_id: ownerID,
      threshold_minutes: threshold,
    };
    if (token.trim()) payload.bot_token = token.trim();
    const ok = await saveSettings(payload);
    if (ok) { setToken(""); markSaved(); }
  };

  const statusBadge = () => {
    if (!status?.installed) {
      return (
        <Badge variant="outline" className="bg-muted/50 text-muted-foreground border-muted-foreground/30">
          <MinusCircleIcon className="size-3" /> Not installed
        </Badge>
      );
    }
    if (status.connected) {
      return (
        <Badge variant="outline" className="bg-success/15 text-success border-success/30">
          <CheckCircle2Icon className="size-3" /> Connected
          {status.latency_ms > 0 && <span className="ml-1 opacity-60">{status.latency_ms}ms</span>}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30">
        <XCircleIcon className="size-3" />
        {status.error === "invalid_token" ? "Invalid token" : "Disconnected"}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Discord Bot</CardTitle>
          <CardDescription>Personal Discord bot for modem queries and alerts</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" /> Loading...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Discord Bot</CardTitle>
            <CardDescription>Personal Discord bot for modem queries and alerts via DMs</CardDescription>
          </div>
          {statusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {/* Setup guide — shown when not installed or token not set */}
        {(!status?.installed || !settings?.token_set) && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
            <p className="font-medium">Setup steps:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Go to <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer" className="underline text-foreground">discord.com/developers</a> → New Application → Bot → copy token</li>
              <li>Paste your bot token below</li>
              <li>Enable Developer Mode in Discord (Settings → Advanced), right-click your avatar → Copy User ID</li>
              <li>Paste your User ID below, save settings</li>
              <li>Use this OAuth2 URL to add the bot to your account (no server needed):<br/>
                <code className="text-xs bg-muted px-1 rounded">
                  https://discord.com/oauth2/authorize?client_id=YOUR_APP_ID&scope=applications.commands
                </code>
              </li>
            </ol>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              id="discord-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
            <Label htmlFor="discord-enabled">Enable Discord Bot</Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="discord-token">
              Bot Token {settings?.token_set && <span className="text-xs text-muted-foreground">(set — leave blank to keep)</span>}
            </Label>
            <Input
              id="discord-token"
              type="password"
              placeholder={settings?.token_set ? "••••••••" : "Paste your bot token"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="discord-owner-id">Your Discord User ID</Label>
            <Input
              id="discord-owner-id"
              placeholder="e.g. 123456789012345678"
              value={ownerID}
              onChange={(e) => setOwnerID(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="discord-threshold">Alert threshold (minutes)</Label>
            <Input
              id="discord-threshold"
              type="number"
              min={1}
              max={60}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Sends a DM if internet is down for longer than this duration.
            </p>
          </div>
        </div>

        <Separator />

        <div className="flex items-center gap-3 flex-wrap">
          <SaveButton onClick={handleSave} isSaving={isSaving} saved={saved} />
          <Button
            variant="outline"
            size="sm"
            disabled={!status?.connected || isSendingTest}
            onClick={sendTestDm}
          >
            {isSendingTest ? (
              <><Loader2Icon className="size-4 animate-spin mr-2" /> Sending...</>
            ) : (
              <><SendIcon className="size-4 mr-2" /> Send Test DM</>
            )}
          </Button>
          {status?.connected && (
            <Button variant="outline" size="sm" onClick={() => (enabled ? disable() : enable())}>
              {enabled ? "Stop Bot" : "Start Bot"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

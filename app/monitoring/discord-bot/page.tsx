import { DiscordBotCard } from "@/components/monitoring/discord-bot-card";

export default function DiscordBotPage() {
  return (
    <div className="@container/main mx-auto p-2">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Discord Bot</h1>
        <p className="text-muted-foreground">
          Use a personal Discord bot to query modem status and receive
          downtime alerts as direct messages — no server required, the bot
          installs to your Discord account via OAuth.
        </p>
      </div>
      <div className="grid grid-cols-1 @3xl/main:grid-cols-2 grid-flow-row gap-4">
        <DiscordBotCard />
      </div>
    </div>
  );
}

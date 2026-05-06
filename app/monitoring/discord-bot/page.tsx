import { DiscordBotCard } from "@/components/monitoring/discord-bot-card";

export default function DiscordBotPage() {
  return (
    <div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6 max-w-3xl">
      <DiscordBotCard />
    </div>
  );
}

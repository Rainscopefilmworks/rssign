import "dotenv/config";
import { registerDiscordCommands } from "./bot.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token || !clientId) {
  throw new Error("DISCORD_TOKEN and DISCORD_CLIENT_ID are required to register commands.");
}

await registerDiscordCommands({
  token,
  clientId,
  guildId: process.env.DISCORD_GUILD_ID,
});

console.log(
  process.env.DISCORD_GUILD_ID
    ? `Registered guild slash commands for ${process.env.DISCORD_GUILD_ID}.`
    : "Registered global slash commands. Set DISCORD_GUILD_ID for instant command updates.",
);

import {
  ChatInputCommandInteraction,
  Client,
  Events,
  GatewayIntentBits,
  type InteractionReplyOptions,
  MessageFlags,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import { type SignStore } from "./db.js";
import { formatBackAtLabel, parseBackInTime } from "./back-in.js";
import { getResolvedStatus } from "./scheduler.js";
import { DAY_NAMES, formatHours, parseDayName } from "./types.js";

interface BotOptions {
  token?: string;
  clientId?: string;
  guildId?: string;
  allowedRoleId?: string;
  fallbackTimezone: string;
}

export function buildDiscordCommands() {
  const dayChoices = DAY_NAMES.map((day) => ({ name: day, value: day }));

  return [
    new SlashCommandBuilder().setName("status").setDescription("Show the current open sign state"),
    new SlashCommandBuilder().setName("open").setDescription("Set a manual OPEN override"),
    new SlashCommandBuilder().setName("closed").setDescription("Set a manual CLOSED override"),
    new SlashCommandBuilder()
      .setName("message")
      .setDescription("Set a manual CLOSED override with a custom display message")
      .addStringOption((option) =>
        option
          .setName("text")
          .setDescription('Message to display, for example "Back at 2pm"')
          .setRequired(true)
          .setMaxLength(120),
      ),
    new SlashCommandBuilder()
      .setName("back-in")
      .setDescription('Show "We\'ll be back" with a large return time on the sign')
      .addStringOption((option) =>
        option
          .setName("time")
          .setDescription('Return time or duration, e.g. "2:30 PM", "30 minutes", or "2 hours"')
          .setRequired(true)
          .setMaxLength(20),
      ),
    new SlashCommandBuilder().setName("auto").setDescription("Clear manual override and use schedule"),
    new SlashCommandBuilder().setName("hours").setDescription("Show configured weekly hours"),
    new SlashCommandBuilder()
      .setName("set-hours")
      .setDescription("Set hours for a day")
      .addStringOption((option) =>
        option.setName("day").setDescription("Day to update").setRequired(true).addChoices(...dayChoices),
      )
      .addStringOption((option) =>
        option.setName("open").setDescription("Open time, HH:mm").setRequired(true),
      )
      .addStringOption((option) =>
        option.setName("close").setDescription("Close time, HH:mm").setRequired(true),
      )
      .addBooleanOption((option) =>
        option.setName("closed").setDescription("Mark the day closed despite the times"),
      ),
  ].map((command) => command.toJSON());
}

export async function registerDiscordCommands(options: {
  token: string;
  clientId: string;
  guildId?: string;
}): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(options.token);
  const body = buildDiscordCommands();

  if (options.guildId) {
    await rest.put(Routes.applicationGuildCommands(options.clientId, options.guildId), { body });
    return;
  }

  await rest.put(Routes.applicationCommands(options.clientId), { body });
}

export async function startDiscordBot(store: SignStore, options: BotOptions): Promise<Client | null> {
  if (!options.token) {
    console.warn("DISCORD_TOKEN is not configured; Discord bot is disabled.");
    return null;
  }

  if (options.clientId) {
    try {
      await registerDiscordCommands({
        token: options.token,
        clientId: options.clientId,
        guildId: options.guildId,
      });
      console.log(
        options.guildId
          ? `Registered slash commands for guild ${options.guildId}.`
          : "Registered global slash commands. Set DISCORD_GUILD_ID for instant updates.",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Failed to register Discord slash commands: ${message}`);
    }
  } else {
    console.warn("DISCORD_CLIENT_ID is not configured; slash commands were not refreshed.");
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Discord bot signed in as ${readyClient.user.tag}.`);
    if (!options.allowedRoleId) {
      console.warn("DISCORD_ALLOWED_ROLE_ID is not configured; Discord commands allow all users.");
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    try {
      if (!hasAllowedRole(interaction, options.allowedRoleId)) {
        await interaction.reply({
          content: "You need the Rainscope role to control the open sign.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await handleCommand(interaction, store, options.fallbackTimezone);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected bot error.";
      const payload: InteractionReplyOptions = {
        content: `Error: ${message}`,
        flags: MessageFlags.Ephemeral,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    }
  });

  await client.login(options.token);
  return client;
}

async function handleCommand(
  interaction: ChatInputCommandInteraction,
  store: SignStore,
  fallbackTimezone: string,
): Promise<void> {
  const actor = interaction.user.tag;

  switch (interaction.commandName) {
    case "status": {
      const timezone = store.getTimezone(fallbackTimezone);
      await interaction.reply({
        content: formatStatus(getResolvedStatus(store, fallbackTimezone), timezone),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    case "open": {
      store.setManualOverride("open", null, actor);
      await interaction.reply({
        content: formatStatus(getResolvedStatus(store, fallbackTimezone), store.getTimezone(fallbackTimezone)),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    case "closed": {
      store.setManualOverride("closed", null, actor);
      await interaction.reply({
        content: formatStatus(getResolvedStatus(store, fallbackTimezone), store.getTimezone(fallbackTimezone)),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    case "message": {
      const message = interaction.options.getString("text", true);
      store.setManualOverride("closed", message, actor);
      await interaction.reply({
        content: formatStatus(getResolvedStatus(store, fallbackTimezone), store.getTimezone(fallbackTimezone)),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    case "back-in": {
      const time = interaction.options.getString("time", true);
      const timezone = store.getTimezone(fallbackTimezone);
      const backAt = parseBackInTime(time, timezone);
      store.setBackInOverride(backAt.toISOString(), actor);
      await interaction.reply({
        content: formatStatus(getResolvedStatus(store, fallbackTimezone), timezone),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    case "auto": {
      store.clearManualOverride(actor);
      await interaction.reply({
        content: formatStatus(getResolvedStatus(store, fallbackTimezone), store.getTimezone(fallbackTimezone)),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    case "hours": {
      await interaction.reply({
        content: store.getWeeklyHours().map(formatHours).join("\n"),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    case "set-hours": {
      const day = interaction.options.getString("day", true);
      const open = interaction.options.getString("open", true);
      const close = interaction.options.getString("close", true);
      const isClosed = interaction.options.getBoolean("closed") ?? false;
      const hours = store.setDayHours(parseDayName(day), !isClosed, open, close);
      store.addAuditLog({
        actor,
        action: "set_hours",
        details: { ...hours },
      });
      await interaction.reply({
        content: `Updated ${formatHours(hours)}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    default:
      await interaction.reply({
        content: "Unknown command.",
        flags: MessageFlags.Ephemeral,
      });
  }
}

function hasAllowedRole(interaction: ChatInputCommandInteraction, allowedRoleId?: string): boolean {
  if (!allowedRoleId) {
    return true;
  }

  const member = interaction.member as
    | { roles?: string[] | { cache?: { has(roleId: string): boolean } } }
    | null;
  const roles = member?.roles;

  if (Array.isArray(roles)) {
    return roles.includes(allowedRoleId);
  }

  return roles?.cache?.has(allowedRoleId) ?? false;
}

function formatStatus(status: ReturnType<typeof getResolvedStatus>, timezone: string): string {
  const lines = [
    `State: ${status.state.toUpperCase()}`,
    `Source: ${status.source}`,
    status.message ? `Message: ${status.message}` : null,
    status.backAt ? `Back at: ${formatBackAtLabel(status.backAt, timezone)}` : null,
    status.nextChange ? `Next change: ${status.nextChange}` : null,
  ];

  return lines.filter(Boolean).join("\n");
}

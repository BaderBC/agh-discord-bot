/**
 * Punkt wejścia bota.
 *
 *  - na starcie publikuje/odświeża panel wyboru ról w kanale ROLES_CHANNEL_ID,
 *  - obsługuje interakcje panelu (wybór ról + nadawanie roli „Zatwierdzony”).
 */
import { ChannelType, Client, Events, GatewayIntentBits, type TextChannel } from 'discord.js';
import { env } from './config/env.js';
import { buildRegistry } from './roles/registry.js';
import { publishOrRefreshPanel } from './roles/publish.js';
import { handleRoleInteraction } from './roles/handler.js';
import { STATS_COMMAND, handleStatsCommand } from './roles/stats.js';
import { GENDER_RATIO_COMMAND, handleGenderRatioCommand } from './roles/genderRatio.js';

const registry = buildRegistry();

const client = new Client({
  // GuildMembers (uprzywilejowany intent) jest potrzebny do zliczania liczby
  // osób na poszczególnych rolach kierunków w komendzie /stats.
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Bot online jako ${c.user.tag}`);

  try {
    // Rejestracja komend slash na serwerze (natychmiastowa dla komend gildii).
    const guild = await c.guilds.fetch(env.guildId);
    await guild.commands.set([STATS_COMMAND, GENDER_RATIO_COMMAND]);
  } catch (err) {
    console.error('❌ Nie udało się zarejestrować komend slash:', err);
  }

  if (!env.rolesChannelId) {
    console.warn('⚠️  Brak ROLES_CHANNEL_ID w .env — panel ról nie zostanie opublikowany.');
    return;
  }

  try {
    const channel = await c.channels.fetch(env.rolesChannelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      console.error('❌ ROLES_CHANNEL_ID nie wskazuje na kanał tekstowy.');
      return;
    }
    await publishOrRefreshPanel(channel as TextChannel, registry);
  } catch (err) {
    console.error('❌ Nie udało się opublikować panelu ról:', err);
  }
});

client.on(Events.InteractionCreate, (interaction) => {
  if (interaction.isChatInputCommand() && interaction.commandName === STATS_COMMAND.name) {
    void handleStatsCommand(interaction, registry);
    return;
  }
  if (interaction.isChatInputCommand() && interaction.commandName === GENDER_RATIO_COMMAND.name) {
    void handleGenderRatioCommand(interaction, registry);
    return;
  }
  void handleRoleInteraction(interaction, registry);
});

client.login(env.token).catch((err) => {
  console.error('❌ Logowanie nie powiodło się:', err);
  process.exit(1);
});

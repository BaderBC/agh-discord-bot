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

const registry = buildRegistry();

const client = new Client({
  // Wystarczy intent Guilds — pojedynczego członka pobieramy przez REST
  // (guild.members.fetch), więc uprzywilejowany GuildMembers nie jest potrzebny.
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Bot online jako ${c.user.tag}`);

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
  void handleRoleInteraction(interaction, registry);
});

client.login(env.token).catch((err) => {
  console.error('❌ Logowanie nie powiodło się:', err);
  process.exit(1);
});

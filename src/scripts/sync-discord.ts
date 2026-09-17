/** Explicit maintenance command; never run automatically when a Worker starts. */
import { env } from '../config/env.js';
import { buildRegistry } from '../roles/registry.js';
import { buildPanelEmbed, PANEL_MARKER } from '../roles/publish.js';
import { buildGroupRows, buildOpenKierunekRow } from '../roles/components.js';
import { STATS_COMMAND, GENDER_RATIO_COMMAND } from '../roles/reports.js';
import { DiscordAPI } from '../worker/discord.js';

const api = new DiscordAPI(env.token, Date.now() + 60_000);
const app = await api.call<{ id: string }>('GET', '/oauth2/applications/@me');
const registry = buildRegistry();
if (registry.guildId !== env.guildId) throw new Error('Generated registry does not match GUILD_ID');
// Upsert each command independently, preserving any unrelated commands.
for (const command of [STATS_COMMAND, GENDER_RATIO_COMMAND]) {
  await api.call('POST', `/applications/${app.id}/guilds/${env.guildId}/commands`, command);
}
console.log('Slash commands synchronized.');

if (process.argv.includes('--panel')) {
  if (!env.rolesChannelId) throw new Error('ROLES_CHANNEL_ID is required');
  const messages = await api.call<Array<{ id: string; author: { id: string }; embeds: Array<{ footer?: { text: string } }> }>>(
    'GET', `/channels/${env.rolesChannelId}/messages?limit=50`,
  );
  const panel = messages.find(m => m.author.id === app.id && m.embeds.some(e => e.footer?.text === PANEL_MARKER));
  if (!panel && !process.argv.includes('--create-panel')) {
    throw new Error('Existing panel not found in the last 50 messages. Use --create-panel only to intentionally create one.');
  }
  const body = {
    embeds: [buildPanelEmbed(registry).toJSON()],
    components: [...buildGroupRows(registry), buildOpenKierunekRow()].map(row => row.toJSON()),
    allowed_mentions: { parse: [] },
  };
  await api.call(panel ? 'PATCH' : 'POST', `/channels/${env.rolesChannelId}/messages${panel ? `/${panel.id}` : ''}`, body);
  console.log(panel ? 'Existing panel updated.' : 'New panel created.');
}

import type { APIInteraction, APIMessageComponentInteraction, RESTPatchAPIWebhookWithTokenMessageJSONBody } from 'discord-api-types/v10';
import { buildKierunekComponents, CUSTOM_ID, kierunkiPageCount, KIERUNKI_PAGE_SIZE } from '../roles/components.js';
import { genderRatioEmbed, GENDER_RATIO_COMMAND, statsEmbeds, STATS_COMMAND } from '../roles/reports.js';
import { DiscordAPI, countRoles } from './discord.js';
import type { Env } from './env.js';
import { registry } from './registry.js';
import { verifyDiscordRequest } from './signature.js';

const json = (body: unknown, status = 200) => Response.json(body, { status });
const privateReply = (content: string) => json({ type: 4, data: { content, flags: 64 } });
const components = (page: number) => buildKierunekComponents(registry, page).map(row => row.toJSON());

function parsePage(id: string, prefix: string): number | null {
  const value = id.slice(prefix.length);
  if (!/^\d+$/.test(value)) return null;
  const page = Number(value);
  return Number.isSafeInteger(page) && page < kierunkiPageCount(registry) ? page : null;
}

/** HTTP background work is bounded to 20s, leaving time for an error reply within waitUntil's 30s. */
function deferWork(
  interaction: APIInteraction,
  env: Env,
  ctx: ExecutionContext,
  task: (deadline: number) => Promise<RESTPatchAPIWebhookWithTokenMessageJSONBody>,
): void {
  const deadline = Date.now() + 20_000;
  const path = `/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}/messages/@original`;
  ctx.waitUntil((async () => {
    try {
      const message = await task(deadline);
      await new DiscordAPI('', Date.now() + 5_000).call('PATCH', path, { ...message, allowed_mentions: { parse: [] } }, false);
    } catch (error) {
      // Do not log arbitrary error messages: runtime/network errors can contain webhook tokens.
      console.error('Interaction failed', { id: interaction.id, error: error instanceof Error ? error.name : 'UnknownError' });
      try {
        await new DiscordAPI('', Date.now() + 5_000).call('PATCH', path, {
          content: '❌ Nie udało się wykonać operacji. Spróbuj ponownie. Jeśli problem się powtarza, sprawdź uprawnienia i hierarchię roli bota.',
          allowed_mentions: { parse: [] },
        }, false);
      } catch {
        console.error('Could not deliver interaction error', { id: interaction.id });
      }
    }
  })());
}

function handleComponent(interaction: APIMessageComponentInteraction, env: Env, ctx: ExecutionContext): Response {
  const data = interaction.data;
  const id = data.custom_id;
  if (data.component_type === 2) {
    if (id === CUSTOM_ID.openKierunek) {
      return json({ type: 4, data: { content: 'Wybierz swój kierunek z listy (możesz przełączać strony):', components: components(0), flags: 64 } });
    }
    if (id === 'noop') return json({ type: 6 });
    if (id.startsWith(CUSTOM_ID.pagePrefix)) {
      const page = parsePage(id, CUSTOM_ID.pagePrefix);
      if (page !== null) return json({ type: 7, data: { components: components(page) } });
    }
  }
  if (data.component_type !== 3 || data.values.length !== 1) return privateReply('Nieprawidłowy wybór.');
  let groupId: string;
  let page: number | null = null;
  if (id.startsWith(CUSTOM_ID.groupPrefix)) {
    groupId = id.slice(CUSTOM_ID.groupPrefix.length);
    const group = registry.groups.find(g => g.id === groupId);
    if (!group?.roleIds.includes(data.values[0])) return privateReply('Nieprawidłowy wybór roli.');
  } else if (id.startsWith(CUSTOM_ID.kierunekPrefix)) {
    groupId = 'kierunek';
    page = parsePage(id, CUSTOM_ID.kierunekPrefix);
    if (page === null || !registry.kierunki.slice(page * KIERUNKI_PAGE_SIZE, (page + 1) * KIERUNKI_PAGE_SIZE).some(k => k.roleId === data.values[0])) {
      return privateReply('Nieprawidłowy wybór kierunku.');
    }
  } else return privateReply('Nieznany element panelu.');
  const userId = interaction.member?.user.id;
  if (!userId) return privateReply('Ta operacja działa tylko na serwerze.');
  const choice = { interactionId: interaction.id, userId, groupId, roleId: data.values[0] };
  deferWork(interaction, env, ctx, async deadline => {
    const object = env.ROLE_COORDINATORS.get(env.ROLE_COORDINATORS.idFromName(`${registry.guildId}:${userId}`));
    const content = await object.choose({ ...choice, deadline });
    return { content, ...(page === null ? {} : { components: components(page) }) };
  });
  return page === null ? json({ type: 5, data: { flags: 64 } }) : json({ type: 6 });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method === 'GET' && (path === '/' || path === '/health')) return json({ ok: true, service: 'agh-discord-bot' });
    if (path !== '/interactions') return new Response('Not found', { status: 404 });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
    const body = await request.text();
    if (!await verifyDiscordRequest(request, body, env.DISCORD_PUBLIC_KEY)) return new Response('Invalid signature', { status: 401 });
    let interaction: APIInteraction;
    try { interaction = JSON.parse(body) as APIInteraction; }
    catch { return new Response('Invalid JSON', { status: 400 }); }
    if (!interaction || typeof interaction !== 'object') return new Response('Invalid interaction', { status: 400 });
    if (interaction.type === 1) return json({ type: 1 });
    if (interaction.application_id !== env.DISCORD_APPLICATION_ID || interaction.guild_id !== registry.guildId) {
      return privateReply('Ta aplikacja działa tylko na serwerze AGH.');
    }
    if (interaction.type === 2 && interaction.data.type === 1) {
      const name = interaction.data.name;
      if (name !== STATS_COMMAND.name && name !== GENDER_RATIO_COMMAND.name) return privateReply('Nieznana komenda.');
      deferWork(interaction, env, ctx, async deadline => {
        const counts = await countRoles(new DiscordAPI(env.DISCORD_TOKEN, deadline), registry.guildId);
        return { embeds: name === STATS_COMMAND.name ? statsEmbeds(registry, counts) : [genderRatioEmbed(registry, counts)] };
      });
      return json({ type: 5 });
    }
    if (interaction.type === 3) return handleComponent(interaction, env, ctx);
    return privateReply('Nieobsługiwana interakcja.');
  },
} satisfies ExportedHandler<Env>;

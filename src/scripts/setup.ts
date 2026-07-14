/**
 * Skrypt setup — uruchamiany JEDNORAZOWO (lub idempotentnie wielokrotnie).
 *
 * Co robi:
 *  1. Tworzy role dla wszystkich kierunków (sprawdzając istnienie PO NAZWIE).
 *  2. Tworzy dodatkowe role: Kobieta, Mężczyzna, Pierwszak, Senior,
 *     Po technikum, Po liceum oraz "Zatwierdzony".
 *  3. Tworzy kategorię z prywatnym kanałem dla każdego kierunku
 *     (widocznym tylko dla posiadaczy danej roli).
 *  4. Zapisuje ID wszystkich utworzonych obiektów do `src/config/ids.generated.json`,
 *     dzięki czemu bot nie musi polegać na ID podanych ręcznie.
 *
 * Skrypt jest idempotentny — ponowne uruchomienie NIE tworzy duplikatów,
 * tylko dopina brakujące elementy i odświeża zapisane ID.
 *
 * Uruchomienie:  pnpm setup
 */
import {
  ChannelType,
  Client,
  Colors,
  GatewayIntentBits,
  Guild,
  OverwriteType,
  PermissionFlagsBits,
  Role,
  type CategoryChannel,
} from 'discord.js';
import { env } from '../config/env.js';
import { loadKierunki } from '../config/kierunki.js';
import { APPROVED_ROLE_NAME, allSelectableRoles } from '../config/roles.js';
import { emptyIds, loadIds, saveIds, type GeneratedIds } from '../config/ids.js';

const KIERUNKI_CATEGORY_NAME = '📚 Kierunki';
const CHANNELS_PER_CATEGORY = 50; // twardy limit Discorda

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function log(step: string, msg: string): void {
  console.log(`[${step}] ${msg}`);
}

/** Znajduje rolę po nazwie (case-insensitive) lub tworzy nową. */
async function ensureRole(
  guild: Guild,
  name: string,
  options: { color?: number; hoist?: boolean; mentionable?: boolean } = {},
): Promise<Role> {
  const existing = guild.roles.cache.find(
    (r) => r.name.toLowerCase() === name.toLowerCase(),
  );
  if (existing) {
    log('rola', `✔️  istnieje: ${name}`);
    return existing;
  }
  const created = await guild.roles.create({
    name,
    color: options.color,
    hoist: options.hoist ?? false,
    mentionable: options.mentionable ?? false,
    reason: 'Setup bota AGH — automatyczne tworzenie ról',
  });
  log('rola', `➕ utworzono: ${name}`);
  return created;
}

/** Znajduje kategorię po nazwie lub tworzy nową (prywatną). */
async function ensureCategory(guild: Guild, name: string): Promise<CategoryChannel> {
  const existing = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === name,
  ) as CategoryChannel | undefined;
  if (existing) {
    log('kategoria', `✔️  istnieje: ${name}`);
    return existing;
  }
  const created = await guild.channels.create({
    name,
    type: ChannelType.GuildCategory,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    ],
    reason: 'Setup bota AGH — kategoria kierunków',
  });
  log('kategoria', `➕ utworzono: ${name}`);
  return created;
}

/**
 * Znajduje kanał tekstowy po nazwie w danej kategorii lub tworzy prywatny kanał,
 * widoczny tylko dla posiadaczy roli `role`.
 */
async function ensurePrivateChannel(
  guild: Guild,
  category: CategoryChannel,
  channelName: string,
  role: Role,
): Promise<string> {
  const existing = guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildText &&
      c.name === channelName &&
      c.parentId === category.id,
  );

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel], type: OverwriteType.Role },
    { id: role.id, allow: [PermissionFlagsBits.ViewChannel], type: OverwriteType.Role },
  ];

  if (existing) {
    // Upewnij się, że uprawnienia są poprawne
    await existing.edit({ permissionOverwrites: overwrites });
    log('kanal', `✔️  istnieje: #${channelName}`);
    return existing.id;
  }

  const created = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: overwrites,
    reason: 'Setup bota AGH — prywatny kanał kierunku',
  });
  log('kanal', `➕ utworzono: #${channelName}`);
  return created.id;
}

async function run(): Promise<void> {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  await client.login(env.token);
  log('start', `Zalogowano jako ${client.user?.tag}`);

  const guild = await client.guilds.fetch(env.guildId);
  const fullGuild = await guild.fetch();

  // Pobierz aktualny stan (role + kanały) do cache, aby wyszukiwanie po nazwie działało
  await fullGuild.roles.fetch();
  await fullGuild.channels.fetch();

  const ids: GeneratedIds = loadIds() ?? emptyIds(fullGuild.id);
  ids.guildId = fullGuild.id;

  // 1. Rola "zatwierdzony"
  const approved = await ensureRole(fullGuild, APPROVED_ROLE_NAME, {
    color: Colors.Green,
    hoist: true,
  });
  ids.approvedRoleId = approved.id;

  // 2. Dodatkowe role (płeć, rok, szkoła)
  for (const role of allSelectableRoles()) {
    const roleName = `${role.name} ${role.emoji}`.trim();
    const created = await ensureRole(fullGuild, roleName);
    ids.extraRoles[role.name] = created.id;
  }

  // 3. Role + prywatne kanały dla kierunków.
  //    Discord ogranicza kategorię do 50 kanałów, więc dzielimy na paczki.
  const kierunki = loadKierunki();
  log('info', `Wczytano ${kierunki.length} kierunków.`);

  ids.kierunkiCategoryIds = [];
  const chunks = chunk(kierunki, CHANNELS_PER_CATEGORY);

  for (let i = 0; i < chunks.length; i++) {
    const categoryName =
      chunks.length > 1 ? `${KIERUNKI_CATEGORY_NAME} (${i + 1})` : KIERUNKI_CATEGORY_NAME;
    const category = await ensureCategory(fullGuild, categoryName);
    ids.kierunkiCategoryIds.push(category.id);

    for (const k of chunks[i]) {
      const role = await ensureRole(fullGuild, k.roleName);
      const channelId = await ensurePrivateChannel(fullGuild, category, k.slug, role);
      ids.kierunki[k.slug] = { name: k.name, roleId: role.id, channelId };
      // Zapisuj na bieżąco — gdyby skrypt padł, nie tracimy postępu
      saveIds(ids);
    }
  }

  saveIds(ids);
  log('koniec', `Zapisano ID do src/config/ids.generated.json`);
  log('podsumowanie', `Kierunki: ${Object.keys(ids.kierunki).length}, dodatkowe role: ${Object.keys(ids.extraRoles).length}`);

  await client.destroy();
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Setup nie powiódł się:', err);
  process.exit(1);
});

/**
 * Komenda /proporcje-plci — publiczny stosunek liczby kobiet do mężczyzn
 * (na podstawie ról z grupy „Płeć”), z podziałem procentowym i liczbowym.
 *
 * Uwaga: zliczanie osób na rolę wymaga danych o członkach serwera, dlatego bot
 * musi mieć włączony uprzywilejowany intent GuildMembers (Server Members Intent
 * w Discord Developer Portal).
 */
import {
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { Registry } from './registry.js';

/** Definicja komendy slash rejestrowanej na serwerze. */
export const GENDER_RATIO_COMMAND = {
  name: 'proporcje-plci',
  description: 'Pokazuje stosunek liczby kobiet do mężczyzn (procenty i liczby).',
};

function formatPercent(count: number, total: number): string {
  if (total === 0) return '0%';
  return `${((count / total) * 100).toFixed(1)}%`;
}

/** Obsługuje komendę /proporcje-plci — odpowiedź widoczna dla wszystkich na kanale. */
export async function handleGenderRatioCommand(
  interaction: ChatInputCommandInteraction,
  registry: Registry,
): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({ content: 'Ta komenda działa tylko na serwerze.' });
    return;
  }

  const group = registry.groups.find((g) => g.id === 'plec');
  if (!group) {
    await interaction.reply({ content: '❌ Nie znaleziono grupy ról „Płeć”.' });
    return;
  }

  // Odpowiedź publiczna (bez flagi Ephemeral) — widoczna dla wszystkich.
  await interaction.deferReply();

  const guild = interaction.guild;
  // Zaciągnij pełną listę członków, aby role miały aktualne liczby posiadaczy.
  await guild.members.fetch();

  const kobieta = group.options.find((o) => o.label === 'Kobieta');
  const mezczyzna = group.options.find((o) => o.label === 'Mężczyzna');

  const kobietyCount = kobieta ? guild.roles.cache.get(kobieta.roleId)?.members.size ?? 0 : 0;
  const mezczyzniCount = mezczyzna ? guild.roles.cache.get(mezczyzna.roleId)?.members.size ?? 0 : 0;
  const total = kobietyCount + mezczyzniCount;

  const lines = [
    `♀️ Kobiety: **${kobietyCount}** (${formatPercent(kobietyCount, total)})`,
    `♂️ Mężczyźni: **${mezczyzniCount}** (${formatPercent(mezczyzniCount, total)})`,
  ];

  const embed = new EmbedBuilder()
    .setTitle('⚖️ Stosunek kobiet do mężczyzn')
    .setDescription(total > 0 ? lines.join('\n') : 'Nikt nie wybrał jeszcze roli płci.')
    .setColor(0xe91e63)
    .setFooter({ text: `Łącznie: ${total} osób z ustawioną płcią` });

  await interaction.editReply({ embeds: [embed] });
}

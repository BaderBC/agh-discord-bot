/**
 * Komenda /proporcje-plci — publiczny stosunek liczby kobiet do mężczyzn
 * (na podstawie ról z grupy „Płeć”), z podziałem procentowym i liczbowym.
 *
 * Uwaga: zliczanie osób na rolę wymaga danych o członkach serwera, dlatego bot
 * musi mieć włączony uprzywilejowany intent GuildMembers (Server Members Intent
 * w Discord Developer Portal).
 */
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Registry } from './registry.js';

import { genderRatioEmbed } from './reports.js';
export { GENDER_RATIO_COMMAND } from './reports.js';

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

  const counts = new Map(guild.roles.cache.map(role => [role.id, role.members.size]));
  await interaction.editReply({ embeds: [genderRatioEmbed(registry, counts)] });
}

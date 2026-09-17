/**
 * Komenda /stats — publiczna lista wszystkich kierunków AGH wraz z liczbą osób
 * posiadających daną rolę, posortowana malejąco. Kierunki z 0 osobami są pomijane.
 *
 * Uwaga: zliczanie osób na rolę wymaga danych o członkach serwera, dlatego bot
 * musi mieć włączony uprzywilejowany intent GuildMembers (Server Members Intent
 * w Discord Developer Portal).
 */
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Registry } from './registry.js';

import { statsEmbeds } from './reports.js';
export { STATS_COMMAND } from './reports.js';

/** Obsługuje komendę /stats — odpowiedź widoczna dla wszystkich na kanale. */
export async function handleStatsCommand(
  interaction: ChatInputCommandInteraction,
  registry: Registry,
): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({ content: 'Ta komenda działa tylko na serwerze.' });
    return;
  }

  // Odpowiedź publiczna (bez flagi Ephemeral) — widoczna dla wszystkich.
  await interaction.deferReply();

  const guild = interaction.guild;
  // Zaciągnij pełną listę członków, aby role miały aktualne liczby posiadaczy.
  await guild.members.fetch();

  const counts = new Map(guild.roles.cache.map(role => [role.id, role.members.size]));
  await interaction.editReply({ embeds: statsEmbeds(registry, counts) });
}

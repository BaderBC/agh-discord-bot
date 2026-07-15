/**
 * Komenda /stats — publiczna lista wszystkich kierunków AGH wraz z liczbą osób
 * posiadających daną rolę, posortowana malejąco. Kierunki z 0 osobami są pomijane.
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
export const STATS_COMMAND = {
  name: 'stats',
  description: 'Pokazuje liczbę osób na każdym kierunku AGH (posortowane malejąco).',
};

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

  const rows = registry.kierunki
    .map((k) => {
      const role = guild.roles.cache.get(k.roleId);
      return { name: k.name, emoji: k.emoji, count: role ? role.members.size : 0 };
    })
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);

  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const lines = rows.map(
    (r) => `\`${String(r.count).padStart(3)}\` — ${r.emoji ? `${r.emoji} ` : ''}${r.name}`,
  );

  const embed = new EmbedBuilder()
    .setTitle('📊 Statystyki kierunków AGH')
    .setDescription(lines.join('\n') || 'Nikt nie wybrał jeszcze żadnego kierunku.')
    .setColor(0x3498db)
    .setFooter({ text: `Łącznie: ${total} osób na ${rows.length} kierunkach` });

  await interaction.editReply({ embeds: [embed] });
}

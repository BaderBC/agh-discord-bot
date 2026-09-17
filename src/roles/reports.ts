import type { APIEmbed } from 'discord-api-types/v10';
import type { Registry } from './registry-data.js';

export const STATS_COMMAND = {
  name: 'stats',
  description: 'Pokazuje liczbę osób na każdym kierunku AGH (posortowane malejąco).',
};
export const GENDER_RATIO_COMMAND = {
  name: 'proporcje-plci',
  description: 'Pokazuje stosunek liczby kobiet do mężczyzn (procenty i liczby).',
};

export function statsEmbeds(registry: Registry, counts: Map<string, number>): APIEmbed[] {
  const rows = registry.kierunki
    .map(k => ({ ...k, count: counts.get(k.roleId) ?? 0 }))
    .filter(k => k.count > 0)
    .sort((a, b) => b.count - a.count);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const pages: string[] = [];
  let page = '';
  for (const row of rows) {
    const line = `\`${String(row.count).padStart(3)}\` — ${row.emoji ? `${row.emoji} ` : ''}${row.name}`;
    if (page.length + line.length + 1 > 4000) { pages.push(page); page = ''; }
    page += (page ? '\n' : '') + line;
  }
  pages.push(page || 'Nikt nie wybrał jeszcze żadnego kierunku.');
  return pages.map((description, i) => ({
    title: i === 0 ? '📊 Statystyki kierunków AGH' : '📊 Statystyki kierunków AGH (ciąg dalszy)',
    description,
    color: 0x3498db,
    ...(i === pages.length - 1 ? { footer: { text: `Łącznie: ${total} osób na ${rows.length} kierunkach` } } : {}),
  }));
}

export function genderRatioEmbed(registry: Registry, counts: Map<string, number>): APIEmbed {
  const group = registry.groups.find(g => g.id === 'plec');
  const women = counts.get(group?.options.find(o => o.label === 'Kobieta')?.roleId ?? '') ?? 0;
  const men = counts.get(group?.options.find(o => o.label === 'Mężczyzna')?.roleId ?? '') ?? 0;
  const total = women + men;
  const percent = (count: number) => total ? `${((count / total) * 100).toFixed(1)}%` : '0%';
  return {
    title: '⚖️ Stosunek kobiet do mężczyzn',
    description: total ? `♀️ Kobiety: **${women}** (${percent(women)})\n♂️ Mężczyźni: **${men}** (${percent(men)})` : 'Nikt nie wybrał jeszcze roli płci.',
    color: 0xe91e63,
    footer: { text: `Łącznie: ${total} osób z ustawioną płcią` },
  };
}

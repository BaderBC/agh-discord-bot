/**
 * Publikacja i odświeżanie panelu wyboru ról w kanale ról.
 * Idempotentne: przy restarcie odnajduje istniejący panel (po znaczniku w stopce)
 * i aktualizuje go zamiast tworzyć duplikat.
 */
import { EmbedBuilder, type TextChannel } from 'discord.js';
import type { Registry } from './registry.js';
import { buildGroupRows, buildOpenKierunekRow } from './components.js';

/** Znacznik w stopce embeda, po którym rozpoznajemy nasz panel. */
export const PANEL_MARKER = 'agh-role-panel';

function buildPanelEmbed(registry: Registry): EmbedBuilder {
  const groupLines = registry.groups
    .map((g) => `• **${g.label}** — ${g.options.map((o) => o.label).join(' / ')}`)
    .join('\n');

  return new EmbedBuilder()
    .setTitle('🎓 Wybór ról — witaj na serwerze AGH!')
    .setDescription(
      [
        'Aby uzyskać dostęp do reszty serwera, uzupełnij **wszystkie** poniższe role:',
        '',
        groupLines,
        `• **Kierunek** — kliknij przycisk „Wybierz kierunek” (${registry.kierunki.length} kierunków)`,
        '',
        'Gdy wybierzesz po jednej opcji z każdej kategorii **oraz** swój kierunek,',
        'automatycznie otrzymasz rolę **Zatwierdzony ✅** i zobaczysz resztę serwera.',
      ].join('\n'),
    )
    .setColor(0x2ecc71)
    .setFooter({ text: PANEL_MARKER });
}

/** Tworzy lub aktualizuje panel w podanym kanale. */
export async function publishOrRefreshPanel(
  channel: TextChannel,
  registry: Registry,
): Promise<void> {
  const embed = buildPanelEmbed(registry);
  const components = [...buildGroupRows(registry), buildOpenKierunekRow()];

  const recent = await channel.messages.fetch({ limit: 50 });
  const existing = recent.find(
    (m) =>
      m.author.id === channel.client.user?.id &&
      m.embeds[0]?.footer?.text === PANEL_MARKER,
  );

  if (existing) {
    await existing.edit({ embeds: [embed], components });
    console.log(`[panel] Zaktualizowano istniejący panel w #${channel.name}`);
  } else {
    await channel.send({ embeds: [embed], components });
    console.log(`[panel] Opublikowano nowy panel w #${channel.name}`);
  }
}

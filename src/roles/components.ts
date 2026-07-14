/**
 * Budowanie komponentów interakcji (select menu + przyciski) dla panelu ról.
 *
 * Uwaga o emoji: umieszczamy je w treści etykiety (label), a nie w polu `emoji`
 * komponentu — część emoji kierunków to sekwencje z selektorem wariacji/ZWJ,
 * które bywają odrzucane przez API w polu `emoji`. W etykiecie działają zawsze.
 */
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import type { Registry } from './registry.js';

export const CUSTOM_ID = {
  /** Select grupy (płeć/rok/szkoła): `rs:g:<groupId>` */
  groupPrefix: 'rs:g:',
  /** Przycisk otwierający efemeryczny wybór kierunku */
  openKierunek: 'k:open',
  /** Efemeryczny select kierunku: `rs:k:<page>` */
  kierunekPrefix: 'rs:k:',
  /** Przyciski paginacji kierunku: `k:pg:<page>` */
  pagePrefix: 'k:pg:',
} as const;

export const KIERUNKI_PAGE_SIZE = 25;

function truncate(text: string, max = 100): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

/** Wiersze select menu dla grup podstawowych (płeć, rok, szkoła). */
export function buildGroupRows(
  registry: Registry,
): ActionRowBuilder<StringSelectMenuBuilder>[] {
  return registry.groups.map((group) => {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`${CUSTOM_ID.groupPrefix}${group.id}`)
      .setPlaceholder(`Wybierz: ${group.label}`)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        group.options.map((opt) => {
          const b = new StringSelectMenuOptionBuilder()
            .setLabel(truncate(`${opt.emoji ?? ''} ${opt.label}`.trim()))
            .setValue(opt.roleId);
          if (opt.description) b.setDescription(truncate(opt.description));
          return b;
        }),
      );
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
  });
}

/** Przycisk otwierający prywatny (efemeryczny) wybór kierunku. */
export function buildOpenKierunekRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_ID.openKierunek)
      .setLabel('Wybierz kierunek')
      .setEmoji('📚')
      .setStyle(ButtonStyle.Primary),
  );
}

export function kierunkiPageCount(registry: Registry): number {
  return Math.max(1, Math.ceil(registry.kierunki.length / KIERUNKI_PAGE_SIZE));
}

/**
 * Komponenty efemerycznego wyboru kierunku dla danej strony:
 * select z 25 kierunkami + wiersz paginacji.
 */
export function buildKierunekComponents(
  registry: Registry,
  page: number,
): ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] {
  const pages = kierunkiPageCount(registry);
  const safePage = Math.min(Math.max(page, 0), pages - 1);
  const start = safePage * KIERUNKI_PAGE_SIZE;
  const slice = registry.kierunki.slice(start, start + KIERUNKI_PAGE_SIZE);

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${CUSTOM_ID.kierunekPrefix}${safePage}`)
    .setPlaceholder(`Wybierz swój kierunek (strona ${safePage + 1}/${pages})`)
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      slice.map((k) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(truncate(`${k.emoji ?? ''} ${k.name}`.trim()))
          .setValue(k.roleId),
      ),
    );

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);

  const nav = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CUSTOM_ID.pagePrefix}${safePage - 1}`)
      .setLabel('Poprzednia')
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage === 0),
    new ButtonBuilder()
      .setCustomId('noop')
      .setLabel(`Strona ${safePage + 1}/${pages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`${CUSTOM_ID.pagePrefix}${safePage + 1}`)
      .setLabel('Następna')
      .setEmoji('➡️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= pages - 1),
  );

  return [selectRow, nav];
}

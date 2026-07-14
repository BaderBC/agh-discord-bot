/**
 * Obsługa interakcji panelu ról:
 *  - wybór z grup (płeć/rok/szkoła) — exkluzywnie, na publicznym panelu,
 *  - otwarcie efemerycznego wyboru kierunku + paginacja,
 *  - wybór kierunku — exkluzywnie,
 *  - automatyczne nadanie/odebranie roli „Zatwierdzony”.
 */
import {
  MessageFlags,
  type ButtonInteraction,
  type GuildMember,
  type Interaction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { Registry } from './registry.js';
import { CUSTOM_ID, buildKierunekComponents } from './components.js';

type ApprovalChange = 'granted' | 'revoked' | 'unchanged';

function managedRoleIds(registry: Registry): Set<string> {
  const set = new Set<string>(registry.kierunkiRoleIds);
  for (const g of registry.groups) g.roleIds.forEach((id) => set.add(id));
  set.add(registry.approvedRoleId);
  return set;
}

/** Zwraca listę wciąż brakujących kategorii do zatwierdzenia. */
function missingForApproval(desired: Set<string>, registry: Registry): string[] {
  const missing: string[] = [];
  for (const g of registry.groups) {
    if (g.requiredForApproval && !g.roleIds.some((id) => desired.has(id))) {
      missing.push(g.label);
    }
  }
  if (![...registry.kierunkiRoleIds].some((id) => desired.has(id))) {
    missing.push('Kierunek');
  }
  return missing;
}

/**
 * Ustala docelowy zestaw ról (exkluzywnie w obrębie grupy), przelicza status
 * „Zatwierdzony” i stosuje minimalny diff na członku.
 */
async function applyExclusiveChoice(
  member: GuildMember,
  groupRoleIds: readonly string[],
  chosenRoleId: string,
  registry: Registry,
): Promise<{ change: ApprovalChange; missing: string[] }> {
  const desired = new Set(member.roles.cache.keys());
  for (const id of groupRoleIds) desired.delete(id);
  desired.add(chosenRoleId);

  const missing = missingForApproval(desired, registry);
  const approved = missing.length === 0;
  const hadApproved = desired.has(registry.approvedRoleId);

  let change: ApprovalChange = 'unchanged';
  if (approved && !hadApproved) {
    desired.add(registry.approvedRoleId);
    change = 'granted';
  } else if (!approved && hadApproved) {
    desired.delete(registry.approvedRoleId);
    change = 'revoked';
  }

  const managed = managedRoleIds(registry);
  const current = new Set(member.roles.cache.keys());
  const toAdd = [...desired].filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !desired.has(id) && managed.has(id));

  if (toRemove.length) await member.roles.remove(toRemove, 'Panel ról AGH');
  if (toAdd.length) await member.roles.add(toAdd, 'Panel ról AGH');

  return { change, missing };
}

function statusMessage(
  chosenLabel: string,
  change: ApprovalChange,
  missing: string[],
): string {
  if (change === 'granted') {
    return `✅ Ustawiono: **${chosenLabel}**.\n🎉 Masz komplet ról — otrzymujesz **Zatwierdzony ✅** i widzisz resztę serwera!`;
  }
  if (change === 'revoked') {
    return `♻️ Ustawiono: **${chosenLabel}**. Odebrano **Zatwierdzony** — brakuje: ${missing.join(', ')}.`;
  }
  if (missing.length) {
    return `✅ Ustawiono: **${chosenLabel}**.\nPozostało jeszcze wybrać: **${missing.join(', ')}**.`;
  }
  return `✅ Ustawiono: **${chosenLabel}**.`;
}

async function getMember(interaction: Interaction): Promise<GuildMember | null> {
  if (!interaction.inGuild() || !interaction.guild) return null;
  return interaction.guild.members.fetch(interaction.user.id);
}

async function handleGroupSelect(
  interaction: StringSelectMenuInteraction,
  registry: Registry,
): Promise<void> {
  const groupId = interaction.customId.slice(CUSTOM_ID.groupPrefix.length);
  const group = registry.groups.find((g) => g.id === groupId);
  if (!group) return;

  const member = await getMember(interaction);
  if (!member) return;

  const chosenRoleId = interaction.values[0];
  const label = group.options.find((o) => o.roleId === chosenRoleId)?.label ?? group.label;

  const { change, missing } = await applyExclusiveChoice(member, group.roleIds, chosenRoleId, registry);
  await interaction.reply({
    content: statusMessage(label, change, missing),
    flags: MessageFlags.Ephemeral,
  });
}

async function handleKierunekSelect(
  interaction: StringSelectMenuInteraction,
  registry: Registry,
): Promise<void> {
  const member = await getMember(interaction);
  if (!member) return;

  const chosenRoleId = interaction.values[0];
  const kierunek = registry.kierunki.find((k) => k.roleId === chosenRoleId);
  const label = kierunek ? kierunek.name : 'Kierunek';
  const page = Number(interaction.customId.slice(CUSTOM_ID.kierunekPrefix.length)) || 0;

  const { change, missing } = await applyExclusiveChoice(
    member,
    [...registry.kierunkiRoleIds],
    chosenRoleId,
    registry,
  );

  await interaction.update({
    content: statusMessage(label, change, missing),
    components: buildKierunekComponents(registry, page),
  });
}

async function handleOpenKierunek(
  interaction: ButtonInteraction,
  registry: Registry,
): Promise<void> {
  await interaction.reply({
    content: 'Wybierz swój kierunek z listy (możesz przełączać strony):',
    components: buildKierunekComponents(registry, 0),
    flags: MessageFlags.Ephemeral,
  });
}

async function handlePage(
  interaction: ButtonInteraction,
  registry: Registry,
): Promise<void> {
  const page = Number(interaction.customId.slice(CUSTOM_ID.pagePrefix.length)) || 0;
  await interaction.update({
    components: buildKierunekComponents(registry, page),
  });
}

/** Główny dyspozytor interakcji panelu ról. */
export async function handleRoleInteraction(
  interaction: Interaction,
  registry: Registry,
): Promise<void> {
  try {
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith(CUSTOM_ID.groupPrefix)) {
        await handleGroupSelect(interaction, registry);
      } else if (interaction.customId.startsWith(CUSTOM_ID.kierunekPrefix)) {
        await handleKierunekSelect(interaction, registry);
      }
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId === CUSTOM_ID.openKierunek) {
        await handleOpenKierunek(interaction, registry);
      } else if (interaction.customId.startsWith(CUSTOM_ID.pagePrefix)) {
        await handlePage(interaction, registry);
      } else if (interaction.customId === 'noop') {
        await interaction.deferUpdate();
      }
    }
  } catch (err) {
    console.error('[panel] Błąd obsługi interakcji:', err);
    const msg =
      '❌ Nie udało się zaktualizować ról. Upewnij się, że rola bota jest **wyżej** w hierarchii niż role kierunków i dodatkowe.';
    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
      } else {
        await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  }
}

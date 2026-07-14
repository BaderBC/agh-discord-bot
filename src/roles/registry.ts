/**
 * Rejestr ról zbudowany na podstawie `ids.generated.json` (utworzone obiekty)
 * oraz statycznej konfiguracji (`roles.ts`, `kierunki.ts`).
 *
 * Dzięki temu handler interakcji operuje na konkretnych ID ról bez polegania
 * na ręcznie wpisanych wartościach.
 */
import { loadIds, type GeneratedIds } from '../config/ids.js';
import { loadKierunki } from '../config/kierunki.js';
import { ROLE_GROUPS } from '../config/roles.js';

export interface RegistryOption {
  roleId: string;
  label: string;
  emoji?: string;
  description?: string;
}

export interface RegistryGroup {
  id: string;
  label: string;
  requiredForApproval: boolean;
  options: RegistryOption[];
  roleIds: string[];
}

export interface KierunekOption {
  roleId: string;
  slug: string;
  name: string;
  emoji?: string;
}

export interface Registry {
  guildId: string;
  approvedRoleId: string;
  groups: RegistryGroup[];
  kierunki: KierunekOption[];
  kierunkiRoleIds: Set<string>;
}

/** Buduje rejestr z zapisanego pliku ID. Rzuca, jeśli setup nie był uruchomiony. */
export function buildRegistry(): Registry {
  const ids = loadIds();
  if (!ids) {
    throw new Error('Brak ids.generated.json — uruchom najpierw `pnpm setup`.');
  }
  if (!ids.approvedRoleId) {
    throw new Error('ids.generated.json nie zawiera approvedRoleId — uruchom `pnpm setup`.');
  }

  const groups = buildGroups(ids);
  const kierunki = buildKierunki(ids);

  return {
    guildId: ids.guildId,
    approvedRoleId: ids.approvedRoleId,
    groups,
    kierunki,
    kierunkiRoleIds: new Set(kierunki.map((k) => k.roleId)),
  };
}

function buildGroups(ids: GeneratedIds): RegistryGroup[] {
  return ROLE_GROUPS.map((group) => {
    const options: RegistryOption[] = [];
    for (const role of group.roles) {
      const roleId = ids.extraRoles[role.name];
      if (!roleId) {
        throw new Error(
          `Brak ID roli "${role.name}" w ids.generated.json — uruchom ponownie \`pnpm setup\`.`,
        );
      }
      options.push({
        roleId,
        label: role.name,
        emoji: role.emoji,
        description: role.description,
      });
    }
    return {
      id: group.id,
      label: group.label,
      requiredForApproval: group.requiredForApproval,
      options,
      roleIds: options.map((o) => o.roleId),
    };
  });
}

function buildKierunki(ids: GeneratedIds): KierunekOption[] {
  const emojiBySlug = new Map(loadKierunki().map((k) => [k.slug, k.emoji]));
  return Object.entries(ids.kierunki).map(([slug, data]) => ({
    roleId: data.roleId,
    slug,
    name: data.name,
    emoji: emojiBySlug.get(slug) || undefined,
  }));
}

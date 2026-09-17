import type { Registry } from './registry-data.js';

export type ApprovalChange = 'granted' | 'revoked' | 'unchanged';

/** Calculate only the managed-role diff; unrelated roles must never be replaced. */
export function planChoice(currentRoles: readonly string[], groupRoleIds: readonly string[], chosenRoleId: string, registry: Registry) {
  if (!groupRoleIds.includes(chosenRoleId)) throw new Error('Invalid role choice');
  const current = new Set(currentRoles);
  const desired = new Set(current);
  for (const id of groupRoleIds) desired.delete(id);
  desired.add(chosenRoleId);
  const missing = registry.groups
    .filter(g => g.requiredForApproval && !g.roleIds.some(id => desired.has(id)))
    .map(g => g.label);
  if (![...registry.kierunkiRoleIds].some(id => desired.has(id))) missing.push('Kierunek');
  const hadApproved = current.has(registry.approvedRoleId);
  if (missing.length === 0) desired.add(registry.approvedRoleId);
  else desired.delete(registry.approvedRoleId);
  const change: ApprovalChange = missing.length === 0
    ? (hadApproved ? 'unchanged' : 'granted')
    : (hadApproved ? 'revoked' : 'unchanged');
  const managed = new Set([...groupRoleIds, registry.approvedRoleId]);
  return {
    toAdd: [...desired].filter(id => !current.has(id)),
    toRemove: [...current].filter(id => managed.has(id) && !desired.has(id)),
    change,
    missing,
  };
}

export function statusMessage(
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

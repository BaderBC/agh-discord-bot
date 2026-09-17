import { planChoice, statusMessage } from '../roles/choice.js';
import type { Registry } from '../roles/registry-data.js';
import { DiscordAPI, type Member } from './discord.js';

export interface RoleChoice {
  interactionId: string;
  userId: string;
  groupId: string;
  roleId: string;
  deadline: number;
}

export async function applyRoleChoice(api: DiscordAPI, choice: RoleChoice, registry: Registry): Promise<string> {
  const group = registry.groups.find(g => g.id === choice.groupId);
  const options = choice.groupId === 'kierunek'
    ? registry.kierunki.map(k => ({ roleId: k.roleId, label: k.name }))
    : group?.options;
  const option = options?.find(o => o.roleId === choice.roleId);
  if (!option || !options) throw new Error('Invalid role choice');
  const path = `/guilds/${registry.guildId}/members/${choice.userId}`;
  const member = await api.call<Member>('GET', path);
  const plan = planChoice(member.roles, options.map(o => o.roleId), choice.roleId, registry);
  // Role-specific endpoints preserve unrelated roles changed by moderators/other bots.
  for (const roleId of plan.toRemove) await api.call('DELETE', `${path}/roles/${roleId}`);
  for (const roleId of plan.toAdd) await api.call('PUT', `${path}/roles/${roleId}`);
  return statusMessage(option.label, plan.change, plan.missing);
}

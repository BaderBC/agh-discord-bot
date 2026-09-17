import data from '../config/registry.generated.json';
import type { Registry } from '../roles/registry-data.js';

export const registry: Registry = {
  ...data,
  kierunkiRoleIds: new Set(data.kierunki.map(k => k.roleId)),
};

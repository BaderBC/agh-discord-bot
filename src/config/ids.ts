import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Plik, do którego skrypt `setup` zapisuje ID utworzonych ról i kanałów. */
export const IDS_FILE = join(__dirname, 'ids.generated.json');

export interface GeneratedIds {
  /** Kiedy ostatnio uruchomiono setup */
  updatedAt: string;
  guildId: string;
  /** ID kategorii z prywatnymi kanałami kierunków (może być kilka — limit 50 kanałów/kategorię) */
  kierunkiCategoryIds: string[];
  /** ID roli "zatwierdzony" */
  approvedRoleId: string | null;
  /** slug kierunku -> { roleId, channelId } */
  kierunki: Record<string, { name: string; roleId: string; channelId: string }>;
  /** nazwa roli -> roleId (dodatkowe role: płeć, rok, szkoła) */
  extraRoles: Record<string, string>;
}

export function emptyIds(guildId: string): GeneratedIds {
  return {
    updatedAt: new Date().toISOString(),
    guildId,
    kierunkiCategoryIds: [],
    approvedRoleId: null,
    kierunki: {},
    extraRoles: {},
  };
}

export function loadIds(): GeneratedIds | null {
  if (!existsSync(IDS_FILE)) return null;
  return JSON.parse(readFileSync(IDS_FILE, 'utf-8')) as GeneratedIds;
}

export function saveIds(ids: GeneratedIds): void {
  ids.updatedAt = new Date().toISOString();
  writeFileSync(IDS_FILE, JSON.stringify(ids, null, 2) + '\n', 'utf-8');
}

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { buildRegistry } from '../roles/registry.js';

const { kierunkiRoleIds: _, ...registry } = buildRegistry();
const target = new URL('../config/registry.generated.json', import.meta.url);
const content = JSON.stringify(registry, null, 2) + '\n';
// Avoid triggering Wrangler's file watcher again when nothing has changed.
if (!existsSync(target) || readFileSync(target, 'utf8') !== content) writeFileSync(target, content);
console.log(`Bundled ${registry.kierunki.length} courses for guild ${registry.guildId}.`);

import type { APIEmbed } from 'discord-api-types/v10';
import type { Registry } from './registry-data.js';

export const INFO_COMMAND = {
  name: 'agh-bot-info',
  description: 'Shows the bot version, build information, and public runtime details.',
};

export interface BuildInfo {
  version: string;
  commit: string | null;
  builtAt: string | null;
}

interface RuntimeInfo {
  platform: 'Cloudflare Workers' | 'Node.js';
  interactions: 'HTTP' | 'Gateway';
  datacenter?: unknown;
}

/** An explicit allowlist of public fields; never accept the environment or interaction payload. */
export function botInfoEmbed(build: BuildInfo, registry: Registry, runtime: RuntimeInfo): APIEmbed {
  const unavailable = 'Local / unavailable';
  const commit = build.commit && /^[a-f0-9]{40}$/i.test(build.commit) ? build.commit : null;
  const builtAt = build.builtAt ? new Date(build.builtAt) : null;
  const built = builtAt && Number.isFinite(builtAt.getTime())
    ? new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
      hour12: false, timeZone: 'UTC',
    }).format(builtAt) + ' UTC'
    : unavailable;
  const datacenter = typeof runtime.datacenter === 'string' && /^[A-Z0-9]{3}$/.test(runtime.datacenter)
    ? runtime.datacenter : unavailable;
  return {
    title: 'ℹ️ AGH Bot — Info',
    color: 0x3498db,
    fields: [
      { name: 'Version', value: `\`${build.version}\`` },
      { name: 'Commit', value: commit ? `[\`${commit.slice(0, 7)}\`](https://github.com/BaderBC/agh-discord-bot/commit/${commit})` : unavailable },
      { name: 'Built', value: built },
      { name: 'Platform', value: runtime.platform },
      { name: 'Interactions', value: runtime.interactions },
      { name: 'Datacenter', value: datacenter },
      { name: 'Configuration', value: `${registry.kierunki.length} courses · ${registry.groups.length} role groups` },
    ],
  };
}

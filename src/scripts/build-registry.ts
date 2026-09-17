import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { buildRegistry } from '../roles/registry.js';
import type { BuildInfo } from '../roles/info.js';

const { kierunkiRoleIds: _, ...registry } = buildRegistry();
const target = new URL('../config/registry.generated.json', import.meta.url);
const content = JSON.stringify(registry, null, 2) + '\n';
// Avoid triggering Wrangler's file watcher again when nothing has changed.
if (!existsSync(target) || readFileSync(target, 'utf8') !== content) writeFileSync(target, content);
console.log(`Bundled ${registry.kierunki.length} courses for guild ${registry.guildId}.`);

// Only explicitly selected public build data is bundled, never process.env.
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };
let commit = process.env.WORKERS_CI_COMMIT_SHA ?? '';
if (!commit) {
  try {
    const root = new URL('../../', import.meta.url);
    // A dirty local checkout must not claim to exactly match a published commit.
    if (!execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()) {
      commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    }
  } catch { /* Source archives and local development can have no Git metadata. */ }
}
const buildTarget = new URL('../config/build.generated.json', import.meta.url);
const previous = existsSync(buildTarget) ? JSON.parse(readFileSync(buildTarget, 'utf8')) as BuildInfo : null;
const publicCommit = /^[a-f0-9]{40}$/i.test(commit) ? commit.toLowerCase() : null;
// Preserve the timestamp during repeated checks/watch rebuilds. Deployment explicitly refreshes it.
const reuse = !process.argv.includes('--refresh-build-info') && previous?.version === pkg.version && previous.commit === publicCommit;
const build: BuildInfo = { version: pkg.version, commit: publicCommit, builtAt: reuse ? previous.builtAt : new Date().toISOString() };
const buildContent = JSON.stringify(build, null, 2) + '\n';
if (!existsSync(buildTarget) || readFileSync(buildTarget, 'utf8') !== buildContent) writeFileSync(buildTarget, buildContent);

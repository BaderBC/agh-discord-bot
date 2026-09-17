import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import app from '../src/worker/app.js';
import { registry } from '../src/worker/registry.js';
import type { Env } from '../src/worker/env.js';
import { planChoice } from '../src/roles/choice.js';
import { statsEmbeds, genderRatioEmbed } from '../src/roles/reports.js';
import { DiscordAPI, countRoles } from '../src/worker/discord.js';
import { applyRoleChoice } from '../src/worker/role-service.js';
import { botInfoEmbed } from '../src/roles/info.js';
import buildInfo from '../src/config/build.generated.json';

const keys = generateKeyPairSync('ed25519');
const publicKey = keys.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
const env = { DISCORD_PUBLIC_KEY: publicKey, DISCORD_APPLICATION_ID: '123', DISCORD_TOKEN: 'test' } as Env;
const ctx = { waitUntil: () => { throw new Error('Unexpected background work'); } } as unknown as ExecutionContext;
function request(payload: unknown, timestamp = String(Math.floor(Date.now() / 1000))) {
  const body = JSON.stringify(payload);
  return new Request('https://bot.test/interactions', { method: 'POST', body, headers: {
    'X-Signature-Timestamp': timestamp,
    'X-Signature-Ed25519': sign(null, Buffer.from(timestamp + body), keys.privateKey).toString('hex'),
  } });
}
const component = (data: object) => ({ id: '456', application_id: '123', guild_id: registry.guildId, type: 3, token: 'test-token', member: { user: { id: '789' } }, data });

test('Discord signed PING works; bad, missing, stale and body-tampered signatures fail', async () => {
  assert.deepEqual(await (await app.fetch(request({ type: 1 }), env, ctx)).json(), { type: 1 });
  const missing = new Request('https://bot.test/interactions', { method: 'POST', body: '{"type":1}' });
  assert.equal((await app.fetch(missing, env, ctx)).status, 401);
  const bad = request({ type: 1 }); bad.headers.set('X-Signature-Ed25519', '0'.repeat(128));
  assert.equal((await app.fetch(bad, env, ctx)).status, 401);
  assert.equal((await app.fetch(request({ type: 1 }, '1'), env, ctx)).status, 401);
  const original = request({ type: 1 });
  assert.equal((await app.fetch(new Request(original, { body: '{"type":2}' }), env, ctx)).status, 401);
});

test('existing panel IDs open an ephemeral menu and paginate without API calls', async () => {
  const open = await (await app.fetch(request(component({ custom_id: 'k:open', component_type: 2 })), env, ctx)).json() as any;
  assert.equal(open.type, 4); assert.equal(open.data.flags, 64);
  assert.equal(open.data.components[0].components[0].options.length, 25);
  const next = await (await app.fetch(request(component({ custom_id: 'k:pg:1', component_type: 2 })), env, ctx)).json() as any;
  assert.equal(next.type, 7); assert.equal(next.data.components[0].components[0].custom_id, 'rs:k:1');
  assert.equal(next.data.components[0].components[0].options[0].value, registry.kierunki[25].roleId);
  const invalid = await (await app.fetch(request(component({ custom_id: 'k:pg:999', component_type: 2 })), env, ctx)).json() as any;
  assert.equal(invalid.type, 4); assert.equal(invalid.data.flags, 64);
});

test('foreign guilds and role IDs outside their group cannot trigger background mutations', async () => {
  const foreign = { ...component({ custom_id: 'k:open', component_type: 2 }), guild_id: 'other' };
  assert.equal((await (await app.fetch(request(foreign), env, ctx)).json() as any).data.flags, 64);
  const invalid = component({ custom_id: 'rs:g:plec', component_type: 3, values: [registry.approvedRoleId] });
  assert.equal((await (await app.fetch(request(invalid), env, ctx)).json() as any).type, 4);
});

test('role plan grants approval only when complete, revokes it if incomplete, preserves unrelated roles', () => {
  const group = registry.groups[0];
  const otherGroups = registry.groups.slice(1).map(g => g.roleIds[0]);
  const initial = ['moderator-role', group.roleIds[1], ...otherGroups];
  const plan = planChoice(initial, [...registry.kierunkiRoleIds], registry.kierunki[0].roleId, registry);
  assert.equal(plan.change, 'granted');
  assert.deepEqual(plan.toAdd, [registry.kierunki[0].roleId, registry.approvedRoleId]);
  assert.deepEqual(plan.toRemove, []);
  const revoke = planChoice(['moderator-role', registry.approvedRoleId, group.roleIds[1]], group.roleIds, group.roleIds[0], registry);
  assert.equal(revoke.change, 'revoked');
  assert.deepEqual(new Set(revoke.toRemove), new Set([registry.approvedRoleId, group.roleIds[1]]));
  assert.throws(() => planChoice([], group.roleIds, registry.approvedRoleId, registry));
});

test('role service fetches fresh state, uses individual role endpoints, and repeated choices are idempotent', async () => {
  const group = registry.groups[0];
  const roles = new Set(['unrelated', ...registry.groups.map(g => g.roleIds[0]), registry.kierunki[0].roleId, registry.approvedRoleId]);
  const calls: string[] = [];
  const api = new DiscordAPI('test', Date.now() + 10_000, async (input, init) => {
    const url = String(input); const method = init?.method!; calls.push(method);
    if (method === 'GET') return Response.json({ roles: [...roles] });
    const id = url.split('/').at(-1)!;
    if (method === 'DELETE') roles.delete(id);
    if (method === 'PUT') roles.add(id);
    return new Response(null, { status: 204 });
  });
  const choice = { interactionId: '1', userId: '2', groupId: group.id, roleId: group.roleIds[1], deadline: Date.now() + 10_000 };
  await applyRoleChoice(api, choice, registry);
  assert.deepEqual(calls, ['GET', 'DELETE', 'PUT']); assert.ok(roles.has('unrelated'));
  assert.ok(!roles.has(group.roleIds[0])); assert.ok(roles.has(group.roleIds[1]));
  calls.length = 0;
  await applyRoleChoice(api, choice, registry); assert.deepEqual(calls, ['GET']);
});

test('member pagination counts every page and uses exact snowflake cursors', async () => {
  const seen: string[] = [];
  const first = Array.from({ length: 1000 }, (_, i) => ({ user: { id: String(9007199254740993n + BigInt(i)) }, roles: ['a', 'b'] }));
  const api = new DiscordAPI('test', Date.now() + 10_000, async input => {
    seen.push(String(input));
    return Response.json(seen.length === 1 ? first : [{ user: { id: '9007199254741993' }, roles: ['b'] }]);
  });
  const counts = await countRoles(api, registry.guildId);
  assert.equal(counts.get('a'), 1000); assert.equal(counts.get('b'), 1001);
  assert.ok(seen[1].endsWith('after=9007199254741992'));
});

test('REST retries a 429, respects deadlines, and does not expose webhook tokens in errors', async () => {
  let attempts = 0;
  const api = new DiscordAPI('test', Date.now() + 10_000, async () => ++attempts === 1
    ? Response.json({ retry_after: 0 }, { status: 429 }) : Response.json({ ok: true }));
  assert.deepEqual(await api.call('GET', '/test'), { ok: true }); assert.equal(attempts, 2);
  const expired = new DiscordAPI('test', Date.now() - 1, async () => { throw new Error('Must not call'); });
  await assert.rejects(expired.call('GET', '/test'), /deadline/);
  const rejected = new DiscordAPI('test', Date.now() + 10_000, async () => Response.json({}, { status: 403 }));
  await assert.rejects(rejected.call('PATCH', '/webhooks/123/secret'), error => error instanceof Error && error.message === 'Discord API returned 403');
});

test('reports preserve sorting, zero filtering and gender percentages', () => {
  const counts = new Map([[registry.kierunki[0].roleId, 2], [registry.kierunki[1].roleId, 5]]);
  const embeds = statsEmbeds(registry, counts);
  assert.ok(embeds[0].description!.indexOf(registry.kierunki[1].name) < embeds[0].description!.indexOf(registry.kierunki[0].name));
  assert.equal(embeds[0].footer?.text, 'Łącznie: 7 osób na 2 kierunkach');
  const gender = registry.groups.find(g => g.id === 'plec')!;
  const ratio = genderRatioEmbed(registry, new Map([[gender.roleIds[0], 1], [gender.roleIds[1], 3]]));
  assert.match(ratio.description!, /25\.0%/); assert.match(ratio.description!, /75\.0%/);
  assert.equal(genderRatioEmbed(registry, new Map()).description, 'Nikt nie wybrał jeszcze roli płci.');
});

test('role interaction immediately defers, then sends an ephemeral result via webhook', async () => {
  const jobs: Promise<unknown>[] = []; const calls: any[] = [];
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method, body: JSON.parse(String(init?.body)) });
    return Response.json({ id: 'message' });
  };
  try {
    const roleEnv = { ...env, ROLE_COORDINATORS: { idFromName: (name: string) => name, get: () => ({ choose: async () => 'Done' }) } } as unknown as Env;
    const context = { waitUntil: (job: Promise<unknown>) => jobs.push(job) } as unknown as ExecutionContext;
    const payload = component({ custom_id: 'rs:g:plec', component_type: 3, values: [registry.groups[0].roleIds[0]] });
    const response = await app.fetch(request(payload), roleEnv, context);
    assert.deepEqual(await response.json(), { type: 5, data: { flags: 64 } });
    await Promise.all(jobs);
    assert.equal(calls[0].method, 'PATCH'); assert.equal(calls[0].body.content, 'Done');
    assert.ok(calls[0].url.endsWith('/messages/@original'));
  } finally { globalThis.fetch = oldFetch; }
});

test('both slash commands defer publicly and report REST results without a Gateway', async () => {
  const oldFetch = globalThis.fetch;
  try {
    for (const name of ['stats', 'proporcje-plci']) {
      const jobs: Promise<unknown>[] = []; const replies: any[] = [];
      globalThis.fetch = async (_input, init) => init?.method === 'GET'
        ? Response.json([{ user: { id: '999' }, roles: [registry.kierunki[0].roleId, registry.groups[0].roleIds[0]] }])
        : (replies.push(JSON.parse(String(init?.body))), Response.json({ id: 'message' }));
      const context = { waitUntil: (job: Promise<unknown>) => jobs.push(job) } as unknown as ExecutionContext;
      const payload = { ...component({}), type: 2, data: { type: 1, name } };
      assert.deepEqual(await (await app.fetch(request(payload), env, context)).json(), { type: 5 });
      await Promise.all(jobs);
      assert.equal(replies.length, 1); assert.equal(replies[0].embeds.length, 1);
      assert.match(replies[0].embeds[0].footer.text, /Łącznie: 1 osób/);
    }
  } finally { globalThis.fetch = oldFetch; }
});

test('course selections defer an update, and failed role writes produce a visible error', async () => {
  const oldFetch = globalThis.fetch;
  const jobs: Promise<unknown>[] = []; const replies: any[] = [];
  globalThis.fetch = async (_input, init) => {
    replies.push(JSON.parse(String(init?.body))); return Response.json({ id: 'message' });
  };
  try {
    const roleEnv = { ...env, ROLE_COORDINATORS: { idFromName: (name: string) => name, get: () => ({ choose: async () => { throw new Error('Forbidden'); } }) } } as unknown as Env;
    const context = { waitUntil: (job: Promise<unknown>) => jobs.push(job) } as unknown as ExecutionContext;
    const payload = component({ custom_id: 'rs:k:0', component_type: 3, values: [registry.kierunki[0].roleId] });
    assert.deepEqual(await (await app.fetch(request(payload), roleEnv, context)).json(), { type: 6 });
    await Promise.all(jobs);
    assert.equal(replies.length, 1); assert.match(replies[0].content, /Nie udało/);
  } finally { globalThis.fetch = oldFetch; }
});

test('info command replies publicly with allowlisted English diagnostics and no API/background work', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Info must not call an API'); };
  try {
    const infoRequest = request({ ...component({}), type: 2, data: { type: 1, name: 'agh-bot-info' } });
    Object.defineProperty(infoRequest, 'cf', { value: { colo: 'WAW', city: 'PRIVATE_CITY', asOrganization: 'PRIVATE_NETWORK' } });
    const privateEnv = { ...env, DISCORD_TOKEN: 'SECRET_BOT_TOKEN', UNRELATED_SECRET: 'SECRET_SENTINEL' };
    const response = await app.fetch(infoRequest, privateEnv, ctx);
    const body = await response.json() as any;
    assert.equal(body.type, 4); assert.equal(body.data.flags, undefined);
    assert.deepEqual(body.data.allowed_mentions, { parse: [] });
    assert.equal(body.data.embeds[0].title, 'ℹ️ AGH Bot — Info');
    const fields = Object.fromEntries(body.data.embeds[0].fields.map((field: any) => [field.name, field.value]));
    assert.deepEqual(Object.keys(fields), ['Version', 'Commit', 'Built', 'Platform', 'Interactions', 'Datacenter', 'Configuration']);
    assert.equal(fields.Version, `\`${buildInfo.version}\``);
    assert.equal(fields.Platform, 'Cloudflare Workers'); assert.equal(fields.Interactions, 'HTTP');
    assert.equal(fields.Datacenter, 'WAW'); assert.equal(fields.Configuration, '75 courses · 3 role groups');
    assert.doesNotMatch(JSON.stringify(body), /SECRET_|PRIVATE_|test-token|1526527810716438622/);
  } finally { globalThis.fetch = oldFetch; }
});

test('info uses a real commit link and UTC build time, with honest unavailable fallbacks', () => {
  const commit = 'abc1234' + '0'.repeat(33);
  const embed = botInfoEmbed({ version: '0.2.0', commit, builtAt: '2026-09-17T16:30:00.000Z' }, registry,
    { platform: 'Cloudflare Workers', interactions: 'HTTP', datacenter: 'WAW' });
  assert.equal(embed.fields![1].value, `[\`abc1234\`](https://github.com/BaderBC/agh-discord-bot/commit/${commit})`);
  assert.match(embed.fields![2].value, /September 17, 2026/); assert.match(embed.fields![2].value, /16:30 UTC/);
  const local = botInfoEmbed({ version: '0.2.0', commit: null, builtAt: null }, registry, { platform: 'Node.js', interactions: 'Gateway' });
  for (const index of [1, 2, 5]) assert.equal(local.fields![index].value, 'Local / unavailable');
  const malformed = botInfoEmbed({ version: '0.2.0', commit: 'not-a-commit', builtAt: 'invalid-date' }, registry,
    { platform: 'Cloudflare Workers', interactions: 'HTTP', datacenter: '@everyone' });
  for (const index of [1, 2, 5]) assert.equal(malformed.fields![index].value, 'Local / unavailable');
});

test('build metadata captures the CI commit and current build time without bundling environment secrets', () => {
  const target = new URL('../src/config/build.generated.json', import.meta.url);
  const previous = readFileSync(target, 'utf8');
  const commit = '1234567' + 'a'.repeat(33);
  const started = Date.now();
  try {
    const run = (args: string[]) => execFileSync(process.execPath, ['--import', 'tsx', 'src/scripts/build-registry.ts', ...args], {
      env: { ...process.env, WORKERS_CI_COMMIT_SHA: commit, DISCORD_TOKEN: 'SECRET_BUILD_SENTINEL' }, stdio: 'pipe',
    });
    run(['--refresh-build-info']);
    const built = JSON.parse(readFileSync(target, 'utf8'));
    assert.deepEqual(Object.keys(built).sort(), ['builtAt', 'commit', 'version']);
    assert.equal(built.commit, commit); assert.equal(built.version, buildInfo.version);
    assert.ok(Date.parse(built.builtAt) >= started && Date.parse(built.builtAt) <= Date.now());
    assert.ok(!JSON.stringify(built).includes('SECRET_BUILD_SENTINEL'));
    run([]);
    assert.deepEqual(JSON.parse(readFileSync(target, 'utf8')), built, 'watch rebuilds must not endlessly refresh their own input');
  } finally { writeFileSync(target, previous); }
});

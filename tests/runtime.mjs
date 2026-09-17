import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Miniflare, createFetchMock } from 'miniflare';

// Exercise the actual compiled Durable Object and SQLite storage in workerd.
// Every outbound request is mocked; this test cannot contact Discord.
const registry = JSON.parse(readFileSync('src/config/registry.generated.json', 'utf8'));
const group = registry.groups[0];
const roles = new Set(['unrelated', ...registry.groups.map(g => g.roleIds[0]), registry.kierunki[0].roleId, registry.approvedRoleId]);
const mutations = [];
let inFlight = 0;
let maxInFlight = 0;
const mock = createFetchMock();
mock.disableNetConnect();
const origin = mock.get('https://discord.com');
const memberPath = `/api/v10/guilds/${registry.guildId}/members/999`;
origin.intercept({ path: memberPath, method: 'GET' }).reply(() => {
  maxInFlight = Math.max(maxInFlight, ++inFlight);
  return { statusCode: 200, data: JSON.stringify({ roles: [...roles] }) };
}).persist();
for (const role of group.roleIds) {
  origin.intercept({ path: `${memberPath}/roles/${role}`, method: 'DELETE' }).reply(() => {
    roles.delete(role); mutations.push(['DELETE', role]);
    return { statusCode: 204 };
  }).persist();
  origin.intercept({ path: `${memberPath}/roles/${role}`, method: 'PUT' }).reply(() => {
    roles.add(role); mutations.push(['PUT', role]); inFlight--;
    return { statusCode: 204 };
  }).persist();
}
const mf = new Miniflare({
  workers: [
    {
      name: 'bot', modules: true, scriptPath: 'dist/worker/index.js', compatibilityDate: '2026-05-15',
      bindings: { DISCORD_TOKEN: 'test-token' }, fetchMock: mock,
      durableObjects: { ROLE_COORDINATORS: { className: 'RoleCoordinator', useSQLite: true } },
    },
    {
      name: 'harness', modules: true, compatibilityDate: '2026-05-15',
      durableObjects: { ROLES: { className: 'RoleCoordinator', scriptName: 'bot', useSQLite: true } },
      script: `export default { async fetch(request, env) {
        const choices = await request.json();
        const object = env.ROLES.get(env.ROLES.idFromName('test-member'));
        return Response.json(await Promise.all(choices.map(choice => object.choose(choice))));
      } };`,
    },
  ],
});
try {
  const harness = await mf.getWorker('harness');
  const choice = (id, role) => ({ interactionId: id, userId: '999', groupId: group.id, roleId: role, deadline: Date.now() + 20_000 });
  const first = choice('interaction-1', group.roleIds[1]);
  const second = choice('interaction-2', group.roleIds[0]);
  const response = await harness.fetch('http://test/choose', { method: 'POST', body: JSON.stringify([first, second]) });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(maxInFlight, 1, 'member read/write sequences must not overlap');
  assert.equal(mutations.length, 4);
  assert.ok(roles.has(group.roleIds[0])); assert.ok(!roles.has(group.roleIds[1]));
  assert.ok(roles.has('unrelated')); assert.ok(roles.has(registry.approvedRoleId));
  const duplicate = await harness.fetch('http://test/choose', { method: 'POST', body: JSON.stringify([first]) });
  assert.equal(duplicate.status, 200, await duplicate.clone().text());
  assert.equal(mutations.length, 4, 'redelivery of a completed older choice must not undo the newer choice');
  console.log('PASS: workerd serializes concurrent role updates and deduplicates completed interactions.');
} finally {
  await mf.dispose();
  await mock.close();
}

/** A bounded REST client. Never put request URLs/tokens in errors or logs. */
export class DiscordAPI {
  constructor(
    private readonly token: string,
    private readonly deadline = Date.now() + 20_000,
    private readonly request: typeof fetch = (...args) => fetch(...args),
  ) {}

  async call<T>(method: string, path: string, body?: unknown, botAuth = true): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const remaining = this.deadline - Date.now();
      if (remaining <= 0) throw new Error('Discord request deadline exceeded');
      const response = await this.request(`https://discord.com/api/v10${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(botAuth ? { Authorization: `Bot ${this.token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(Math.min(remaining, 8_000)),
      });
      if (response.status === 429) {
        const data = await response.json() as { retry_after?: number };
        const delay = Math.max(0, Number(data.retry_after ?? 1) * 1_000) + 100;
        if (!Number.isFinite(delay) || delay >= this.deadline - Date.now()) {
          throw new Error('Discord rate limit exceeds request deadline');
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Discord API returned ${response.status}`);
      }
      if (response.status === 204) return undefined as T;
      return await response.json() as T;
    }
    throw new Error('Discord rate limit retry budget exhausted');
  }
}

export interface Member { user: { id: string }; roles: string[] }

export async function countRoles(api: DiscordAPI, guildId: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  let after = '0';
  for (;;) {
    const members = await api.call<Member[]>('GET', `/guilds/${guildId}/members?limit=1000&after=${after}`);
    for (const member of members) {
      for (const role of member.roles) counts.set(role, (counts.get(role) ?? 0) + 1);
    }
    if (members.length < 1000) return counts;
    const next = members.reduce((max, member) => BigInt(member.user.id) > BigInt(max) ? member.user.id : max, after);
    if (BigInt(next) <= BigInt(after)) throw new Error('Discord member pagination did not advance');
    after = next;
  }
}

import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env.js';
import { DiscordAPI } from './discord.js';
import { registry } from './registry.js';
import { applyRoleChoice, type RoleChoice } from './role-service.js';

/** One object per guild member. No sockets, timers, or idle processing. */
export class RoleCoordinator extends DurableObject<Env> {
  private tail: Promise<unknown> = Promise.resolve();

  async choose(choice: RoleChoice): Promise<string> {
    const result = this.tail.then(async () => {
      if (Date.now() >= choice.deadline) throw new Error('Role choice expired in queue');
      const cached = await this.ctx.storage.get<{ content: string; expires: number }>(choice.interactionId);
      if (cached && cached.expires > Date.now()) return cached.content;
      const api = new DiscordAPI(this.env.DISCORD_TOKEN, choice.deadline);
      const content = await applyRoleChoice(api, choice, registry);
      await this.ctx.storage.put(choice.interactionId, { content, expires: Date.now() + 15 * 60_000 });
      if (await this.ctx.storage.getAlarm() === null) await this.ctx.storage.setAlarm(Date.now() + 15 * 60_000);
      return content;
    });
    this.tail = result.catch(() => {});
    return result;
  }

  async alarm(): Promise<void> {
    const entries = await this.ctx.storage.list<{ expires: number }>();
    let next = Infinity;
    for (const [id, value] of entries) {
      if (value.expires <= Date.now()) await this.ctx.storage.delete(id);
      else next = Math.min(next, value.expires);
    }
    if (Number.isFinite(next)) await this.ctx.storage.setAlarm(next);
  }
}

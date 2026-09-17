import type { RoleCoordinator } from './coordinator.js';

export interface Env {
  DISCORD_TOKEN: string;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_APPLICATION_ID: string;
  ROLE_COORDINATORS: DurableObjectNamespace<RoleCoordinator>;
}

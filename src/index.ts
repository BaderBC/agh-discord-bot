/**
 * Punkt wejścia bota.
 *
 * Na razie minimalny: loguje się, weryfikuje, że skrypt `setup` został
 * uruchomiony (istnieje plik z ID) i czeka na zdarzenia.
 *
 * Kolejne kroki (osobne moduły): kanał z wyborem ról oraz logika nadawania
 * roli "Zatwierdzony" po wybraniu wszystkich wymaganych ról.
 */
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { env } from './config/env.js';
import { loadIds } from './config/ids.js';

const ids = loadIds();
if (!ids) {
  console.warn(
    '⚠️  Brak pliku src/config/ids.generated.json — uruchom najpierw `pnpm setup`.',
  );
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Bot online jako ${c.user.tag}`);
});

client.login(env.token).catch((err) => {
  console.error('❌ Logowanie nie powiodło się:', err);
  process.exit(1);
});

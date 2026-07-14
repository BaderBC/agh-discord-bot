import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Brak zmiennej środowiskowej ${name}. Uzupełnij plik .env (patrz .env.example).`);
  }
  return value.trim();
}

export const env = {
  token: required('DISCORD_TOKEN'),
  guildId: required('GUILD_ID'),
  // CLIENT_ID nie jest wymagane do skryptu setup, więc czytamy opcjonalnie
  clientId: process.env.CLIENT_ID?.trim() ?? '',
};

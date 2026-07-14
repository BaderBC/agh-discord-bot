# syntax=docker/dockerfile:1

FROM node:20-alpine

# pnpm przez corepack (wersja zgodna z pnpm-lock.yaml)
RUN corepack enable

WORKDIR /app

# 1. Zależności — osobna warstwa dla cache'owania.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# 2. Kod źródłowy (zawiera już ids.generated.json — setup NIE jest uruchamiany).
COPY tsconfig.json ./
COPY kierunki_agh ./kierunki_agh
COPY src ./src

ENV NODE_ENV=production

# Uruchamiamy bota bezpośrednio przez node, żeby poprawnie obsłużyć sygnały.
CMD ["node", "--import", "tsx", "src/index.ts"]

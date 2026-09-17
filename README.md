# AGH Discord bot


Role selection, automatic **Zatwierdzony ✅** approval, `/stats`, and
`/proporcje-plci`, and `/agh-bot-info`, hosted on Cloudflare Workers.

`/agh-bot-info` replies publicly in English with the package version, a GitHub
commit link, Warsaw build time (including daylight-saving adjustments), platform, interaction transport, the Cloudflare
datacenter serving the request, and configured course/role-group counts. It uses
only an explicit list of public fields and makes no external API requests.
Build metadata is generated locally from `package.json` and Cloudflare's
`WORKERS_CI_COMMIT_SHA` (or a clean local Git checkout). `pnpm run deploy` refreshes
the build timestamp; no extra API keys or build secrets are required. Missing
metadata displays as `Local / unavailable`. The Gateway fallback reports Node.js
and Gateway, with no commit/build timestamp.

## Production

- Worker: `agh-discord-bot`
- Discord Interactions Endpoint URL: `https://agh-bot.bstrama.com/interactions`
- Health endpoint: `https://agh-bot.bstrama.com/health`
- Cloudflare account, custom domain, application ID, and public key: `wrangler.jsonc`
- Secret: `DISCORD_TOKEN` (the existing bot token)

Discord sends signed HTTP requests to the Worker. Buttons and page navigation
respond directly. Role changes and reports acknowledge immediately, then edit
the response after the REST requests finish. A Durable Object per member
serializes role changes and remembers completed interaction IDs for 15 minutes.
It holds no Gateway connection and sleeps when idle. Role-specific REST endpoints
preserve unrelated roles. The reports page through live guild members; **Server
Members Intent** must remain enabled in the Discord Developer Portal.

Background REST work has a 20-second budget, leaving room to report failures
within Workers' 30-second post-response `waitUntil` window. Long rate limits
produce a retryable user-facing error instead of a silent timeout. For a much
larger guild requiring longer scans, move report work to a Queue or Workflow.

## Develop and deploy

Use Node 22+ and the pinned pnpm version.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm test:runtime
pnpm dev
```

`wrangler dev` can read `DISCORD_TOKEN` from the local `.env`. An optional ignored
`.dev.vars` file can override bindings for local testing. Never commit either
file. Wrangler regenerates the bundled role registry from
`src/config/ids.generated.json`, the role definitions, and `kierunki_agh` on build.

Initial provisioning (or token rotation):

```sh
pnpm exec wrangler login
pnpm exec wrangler secret put DISCORD_TOKEN
pnpm run deploy
```

The custom domain route lets Cloudflare manage DNS and TLS. Deployment does not
change Discord's interaction delivery settings or stop the VPS. Future code
changes require only `pnpm run deploy`, provided the domain stays the same.

## Discord cutover

1. Deploy and check `/health`.
2. In the existing application's **General Information** page, set
   **Interactions Endpoint URL** to `https://agh-bot.bstrama.com/interactions`.
   Discord validates signatures and sends a PING before accepting the URL.
3. Test the existing role panel: all three groups, course selection, pagination,
   approval, `/stats`, and `/proporcje-plci`.
4. Stop the VPS bot after successful live checks.

Saving the endpoint immediately redirects all interactions from Gateway to HTTP.
No re-invite, replacement roles/channels, or channel webhook is needed. The
existing panel's component IDs are preserved. The bot does not maintain online
presence over Gateway.

Rollback: clear the Interactions Endpoint URL and ensure the old Gateway bot is
running. Its entry point (`pnpm start`) and Docker files are retained for rollback.

## Maintenance

The existing commands and panel survive deployment. Use these only when changing
their definitions or creating a new panel:

```sh
pnpm sync:discord                         # upsert all three commands
pnpm sync:discord --panel                 # also edit the existing recent panel
pnpm sync:discord --panel --create-panel  # allow creation if no panel was found
```

Local maintenance uses `.env` (`DISCORD_TOKEN`, `GUILD_ID`, and
`ROLES_CHANNEL_ID`). `pnpm run setup` remains available for provisioning roles and
channels, but is not needed to migrate an existing server. Rebuild/redeploy after
changing generated IDs. Do not run setup or panel publishing on Worker startup.

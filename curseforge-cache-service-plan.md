# ARK Mod Catalog Cache Service Plan

## Proposed project

Name: `ark-mod-catalog-service`  
Location: `I:\repos\ark-mod-catalog-service`  
GitHub: `kbs-cloud/ark-mod-catalog-service`

Build a Node.js/TypeScript service that searches the official CurseForge API for ARK: Survival Ascended mods, normalizes the response, caches results, and exposes a small authenticated API to `node_rcon`.

## New-session handoff prompt

```text
Create a new Node.js + TypeScript project at I:\repos\ark-mod-catalog-service.
The target GitHub repository is kbs-cloud/ark-mod-catalog-service.
Implement the requirements in curseforge-cache-service-plan.md.
Use only the official CurseForge API and an approved API key. Do not scrape or use undocumented endpoints. Do not create or push the GitHub repository without explicit confirmation.
```

## Required information to provide

- Final project/repository name if different from the proposal.
- Approved CurseForge API key, supplied through environment/secret storage only.
- Confirmed ASA game ID (`83374` is currently used, but verify it).
- CurseForge-approved request limits, cache TTL, attribution, and redistribution rules.
- Deployment host, public URL, TLS, and whether Redis is needed.
- Service-to-service authentication token for `node_rcon`.

## API contract

`GET /v1/mods/search?q=<name-or-id>&page=1&pageSize=12`

Return normalized fields: `id`, `name`, `author`, `thumbnailUrl`, `summary`, `page`, `pageSize`, `total`, `hasMore`, and `cached`.

Also provide `/health` and `/ready`. Bound page size to 25 and reject empty/oversized queries. Keep the upstream CurseForge schema out of the existing frontend.

## Required safeguards

- Keep `CURSEFORGE_API_KEY` server-side; never log or return it.
- Provider abstraction with strict timeout and normalized responses.
- Retry only network errors, 429, and selected 5xx responses; honor `Retry-After` and add jitter.
- No retries for 401/403/other permanent failures.
- Shared upstream token-bucket limiter and separate per-client limiter.
- Coalesce identical concurrent cache misses.
- Bounded LRU cache keyed by normalized query/page/page size.
- Configurable TTL, with stale-if-error disabled by default until approved.
- Configurable CORS, service token, request IDs, redacted structured logs, and metrics.
- No live CurseForge calls in CI; mock the provider.

## Configuration

```text
PORT=3010
HOST=127.0.0.1
CURSEFORGE_API_KEY=
CURSEFORGE_GAME_ID=83374
CURSEFORGE_BASE_URL=https://api.curseforge.com
CACHE_TTL_SECONDS=600
CACHE_MAX_ENTRIES=500
UPSTREAM_REQUESTS_PER_SECOND=1
UPSTREAM_BURST=2
CLIENT_REQUESTS_PER_MINUTE=60
SERVICE_TOKEN=
ALLOWED_ORIGINS=
```

Start health even when credentials are missing, but make readiness fail with an actionable message. Commit `.env.example`, never `.env`.

## Tests

Cover provider request construction, ASA game ID, response normalization, pagination limits, cache hit/expiry/eviction, concurrent misses, stale policy, 429/Retry-After, 403, 5xx, timeout, client throttling, auth, log redaction, readiness, and the `node_rcon` client contract.

## Initialize locally

```powershell
New-Item -ItemType Directory -Path I:\repos\ark-mod-catalog-service
Set-Location I:\repos\ark-mod-catalog-service
npm init -y
git init -b main
```

Use small commits: scaffold, provider/API, cache/throttling, tests, docs. Add `.env`, logs, cache files, and build output to `.gitignore`.

## GitHub organization setup

After confirming the name and authorization:

```powershell
gh auth status
gh repo create kbs-cloud/ark-mod-catalog-service --private --description "Cached, rate-limited CurseForge catalog service for ARK: Survival Ascended" --source . --remote origin --push
```

Do not make it public without confirmation. Then configure branch protection, required CI checks, Dependabot, secret scanning, and repository secrets (`CURSEFORGE_API_KEY`, deployment credentials, and optional `SERVICE_TOKEN`).

## Connect `node_rcon`

Configure it with `MOD_CATALOG_URL` and `MOD_CATALOG_SERVICE_TOKEN`. The existing UI must retain manual IDs and display retry/error states when this service is unavailable. During migration, the direct provider may remain as an explicitly disabled fallback.

## Deployment checklist

Confirm CurseForge approval covers this caching/aggregation use; verify TTL and attribution rules; use HTTPS and authentication outside localhost; configure health probes; redact secrets; monitor 403/429/5xx, latency, cache hit rate, and upstream volume; document terms and privacy; and never commit credentials.

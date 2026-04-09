# CentralPerk

CentralPerk is a loyalty rewards web application built with Next.js, React, Supabase, and Tailwind CSS.

This repository contains:

- the main web app
- Supabase SQL, migrations, and test seed scripts
- Sprint 4 API testing assets for contract, provider, integration, and load testing

## Project Layout

- `LOYALTY_SYSTEM-main/CentralPerk/` - main Next.js application
- `LOYALTY_SYSTEM-main/CentralPerk/supabase/` - consolidated SQL, migrations, and Supabase-related files
- `LOYALTY_SYSTEM-main/CentralPerk/src/pages/api/` - Sprint 4 API routes for points and campaigns
- `LOYALTY_SYSTEM-main/CentralPerk/src/server/` - shared server-side rules used by the API tests
- `LOYALTY_SYSTEM-main/CentralPerk/tests/` - Pact, integration, DB, and k6 test assets
- `.github/workflows/` - CI workflows for verification and nightly load runs

## Running The Code

From the app directory:

```bash
cd LOYALTY_SYSTEM-main/CentralPerk
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

Production commands:

```bash
npm run build
npm run start
```

`npm run server` is also available as a production-server alias.

## Environment And Supabase

Supabase connection values are read from:

- `LOYALTY_SYSTEM-main/CentralPerk/.env`
- or `LOYALTY_SYSTEM-main/CentralPerk/.env.local`

If you cloned the repo fresh, create the env file first before running the app.

For client-side Supabase access in Next.js, define:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

or:

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Demo auth flags use:

- `NEXT_PUBLIC_ENABLE_DEMO_AUTH`
- `NEXT_PUBLIC_FORCE_CUSTOMER_DEMO_AUTH`

The project still mirrors legacy `VITE_*` values during the migration, but `NEXT_PUBLIC_*` is the preferred format now.

The main Supabase source of truth is:

- `LOYALTY_SYSTEM-main/CentralPerk/supabase/final_consolidated_sprint1.sql`

If your live Supabase project is behind, apply the consolidated SQL or the matching migration files before testing promotion and loyalty features.

## Member Engagement

Developer 12's sprint scope for `EPIC-LYL-08: Member Engagement` is available in:

- `/customer/engagement`
- `/admin/engagement`

The feature set includes push campaign scheduling, challenge tracking, social sharing, surveys, and win-back campaign dashboards.

Additional engagement-related environment placeholders may be added to your local `.env` as needed for app URL and push provider setup.

## Sprint 4 API Testing

This repo does not use separate `services/points-engine`, `services/campaign-service`, or `services/gateway` folders.

Instead, the Sprint 4 API and testing work is implemented inside the main Next.js project through:

- points routes in `src/pages/api/points/`
- campaign routes in `src/pages/api/campaigns/`
- shared server logic in `src/server/`

### Points API

Location:

- `LOYALTY_SYSTEM-main/CentralPerk/src/pages/api/points/award.ts`
- `LOYALTY_SYSTEM-main/CentralPerk/src/pages/api/points/redeem.ts`

Shared logic:

- `LOYALTY_SYSTEM-main/CentralPerk/src/server/api/points-core.mjs`

### Campaign API

Location:

- `LOYALTY_SYSTEM-main/CentralPerk/src/pages/api/campaigns/resolve-purchase.ts`
- `LOYALTY_SYSTEM-main/CentralPerk/src/pages/api/campaigns/flash-sale/claim.ts`
- `LOYALTY_SYSTEM-main/CentralPerk/src/pages/api/campaigns/performance.ts`
- `LOYALTY_SYSTEM-main/CentralPerk/src/pages/api/campaigns/notifications/queue.ts`

Shared rules:

- `LOYALTY_SYSTEM-main/CentralPerk/src/server/rewards-rules-core.mjs`

### Contract Tests

Files:

- `tests/contract/points.consumer.pact.test.mjs`
- `tests/contract/campaigns.consumer.pact.test.mjs`

Run:

```bash
npm run test:contract
npm run test:contract:points
npm run test:contract:campaigns
```

### Provider Verification

Files:

- `tests/provider/verify-points-provider.mjs`
- `tests/provider/verify-campaigns-provider.mjs`

Run:

```bash
npm run test:provider
npm run test:provider:points
npm run test:provider:campaigns
```

### Integration Tests

Files:

- `tests/integration/points.api.integration.test.mjs`
- `tests/integration/rewards-rules.integration.test.mjs`

Coverage includes:

- award flow
- redeem flow
- idempotency / duplicate replay handling
- tier transition rules
- points expiry rules
- campaign multiplier activation

Run:

```bash
npm run test:integration
```

### Test DB Seed / Teardown

Files:

- `supabase/tests/rewards_api_seed.sql`
- `supabase/tests/rewards_api_teardown.sql`

Command wrapper:

- `tests/db/run-sql.mjs`

Set `SUPABASE_DB_URL` first, then run:

```bash
npm run db:test:seed
npm run db:test:teardown
```

### Load Test

k6 scenario file:

- `tests/load/k6/points-and-campaigns.js`

Triage helper:

- `tests/load/k6/triage-breaches.mjs`

The load mix includes:

- points award
- points redeem
- campaign resolution
- flash-sale claim
- campaign analytics reads
- campaign notification queue writes

For the cleanest baseline, run k6 against the production server:

```bash
npm run build
npm run start
```

Then in a second terminal:

```bash
K6_BASE_URL=http://localhost:3000 npm run test:load:k6
npm run test:load:k6:triage
```

On Windows PowerShell:

```powershell
$env:K6_BASE_URL="http://localhost:3000"
npm.cmd run test:load:k6
npm.cmd run test:load:k6:triage
```

k6 must be installed locally before these commands will run.

Generated load-test output is written to:

- `tests/load/results/summary.txt`
- `tests/load/results/summary.json`
- `tests/load/results/triage.md`

### Grafana And CI

Grafana dashboard JSON:

- `LOYALTY_SYSTEM-main/CentralPerk/monitoring/grafana/dashboards/centralperk-rewards-load.json`

GitHub Actions workflows:

- `.github/workflows/rewards-api-ci.yml`
- `.github/workflows/rewards-load-nightly.yml`

## Notes

- The frontend was migrated from Vite to Next.js.
- The app README with more app-specific details is in `LOYALTY_SYSTEM-main/CentralPerk/README.md`.
- The repo-root `package-lock.json` is unrelated to the app and is not needed to run the Next.js project inside `LOYALTY_SYSTEM-main/CentralPerk/`.

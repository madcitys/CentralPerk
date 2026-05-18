
  # CentralPerk

  This project runs as a Next.js frontend and connects directly to Supabase.

  ## Running the code

  From the outer project root:

  Run `npm install` once to install the app dependencies.

  Run `npm run dev` to start the local development server on `http://localhost:3000`.

  Run `npm run build` to generate the production build.

  Run `npm run server` to serve the production build on `http://localhost:3000`.

  Supabase connection values are read from `CentralPerk/.env`.

  If you cloned the repo from GitHub, create `CentralPerk/.env` first.

  For client-side Supabase access in Next.js, define these variables in `CentralPerk/.env.local`
  or `CentralPerk/.env`:

  `NEXT_PUBLIC_SUPABASE_URL`

  and either:

  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

  or:

  `NEXT_PUBLIC_SUPABASE_ANON_KEY`

  Demo auth flags use:

  `NEXT_PUBLIC_ENABLE_DEMO_AUTH`

  `NEXT_PUBLIC_FORCE_CUSTOMER_DEMO_AUTH`

  ## Member Engagement

  Developer 12's sprint scope for `EPIC-LYL-08: Member Engagement` is now available in:

  ` /customer/engagement `

  ` /admin/engagement `

  The feature set includes push campaign scheduling, challenge tracking, social sharing, surveys, and win-back campaign dashboards.

  Additional engagement-related environment placeholders may be added to your local `.env` as needed for app URL and push provider setup.

## Points Engine Service (Sprint 4)

- Location: `services/points-engine`
- Env: set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `POINTS_ENGINE_URL` (or `NEXT_PUBLIC_POINTS_ENGINE_URL`) in `.env`.
- Install deps and build (service only):
  - `cd services/points-engine`
  - `npm install`
  - `npm run build`
  - `npm run start` (listens on port 4001 by default)
- Docker: `docker build -t points-engine ./services/points-engine`
- Nightly expiry is scheduled in SQL via `points_run_nightly_expiry`; SQL migrations live in `SQL_CODES/6_points_engine.sql`.

## Campaign Service (Sprint 4)
- Location: `services/campaign-service`
- Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CAMPAIGN_SERVICE_URL` (or `NEXT_PUBLIC_CAMPAIGN_SERVICE_URL`)
- Commands (from service dir): `npm run build`, `npm test`, `npm start`
- Migration: `SQL_CODES/7_campaign_service.sql` adds budget/variant RPs and multiplier RPCs.

## Gateway (Sprint 4)
- Location: `services/gateway`
- Env: `GATEWAY_URL` (default http://localhost:4000), `POINTS_ENGINE_URL`, `CAMPAIGN_SERVICE_URL`, `ADMIN_ROLE` (default `admin`)
- Commands: `npm run build`, `npm run verify` (runs mock integration), `npm start`
- Rate limit: `/points/award` limited to 1000 req/min. Campaign write routes require header `x-role: admin`.
- Load test: `k6 run services/gateway/load-test/k6-gateway.js` (requires k6).

## Frontend/clients
- Points and campaign clients prefer `GATEWAY_URL`/`NEXT_PUBLIC_GATEWAY_URL` so the gateway is the single entry point.

## Quick local bring-up (mock upstreams)
```
cd services/gateway
npm run verify   # spins mock upstreams and exercises health/campaigns/award with auth+rate-limit
```

## Load test
```
GATEWAY_URL=http://localhost:4000 k6 run services/gateway/load-test/k6-gateway.js
```
(Install k6 first; not executed in this environment.)
  

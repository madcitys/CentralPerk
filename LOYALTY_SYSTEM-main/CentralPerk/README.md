
  # CentralPerk

  This project runs as a Next.js frontend and connects directly to Supabase.

  ## Running the code

  From the outer project root:

  Run `npm install` once to install the app dependencies.

  Run `npm run dev` to start the local development server on `http://localhost:3000`.

  Run `npm run build` to generate the production build.

  Run `npm run server` to serve the production build on `http://localhost:3000`.

  Supabase connection values are read from `CentralPerk/.env`.

  If you cloned the repo from GitHub, create `CentralPerk/.env` first by copying `CentralPerk/.env.example`.

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

  The Next config also mirrors existing `VITE_*` values so old env files still work during migration.

  ## Member Engagement

  Developer 12's sprint scope for `EPIC-LYL-08: Member Engagement` is now available in:

  ` /customer/engagement `

  ` /admin/engagement `

  The feature set includes push campaign scheduling, challenge tracking, social sharing, surveys, and win-back campaign dashboards.

  Additional engagement-related placeholders were added to `.env.example` for app URL and push provider setup.

  ## Test Work

  This repo now includes scaffolding for the Sprint 4 independent test tasks:

  - `SCRUM-401` Pact consumer tests for points award and redeem flows
  - `SCRUM-402` Pact consumer tests for campaign resolution and flash-sale claim flows
  - `SCRUM-403` Pact provider verification harness for points and campaign providers
  - `SCRUM-404` CI workflow for contract, provider, integration, and build checks
  - `SCRUM-406` k6 weighted load scenarios for points and campaign endpoints
  - `SCRUM-408` nightly CI schedule and threshold enforcement for the k6 baseline
  - `SCRUM-409` Grafana dashboard JSON for k6 load telemetry
  - `SCRUM-410` baseline breach triage report generation from k6 summaries
  - `SCRUM-412` integration-style tests for award, redeem, and duplicate transaction handling
  - `SCRUM-413` integration-style tests for tier transitions and points expiry handling
  - `SCRUM-414` integration-style tests for campaign multiplier activation
  - `SCRUM-415` test DB seed and teardown scripts with CI hooks

  The consolidated Supabase source of truth also includes the latest flash-sale claim SQL fix in
  `supabase/final_consolidated_sprint1.sql`. If your live project is still using an older copy,
  re-apply that script or the matching migration before running the promotion-related tests.

  Run the contract tests after installing dependencies:

  ```bash
  npm run test:contract
  ```

  Run the integration tests:

  ```bash
  npm run test:integration
  ```

  Run the provider verification checks:

  ```bash
  npm run test:provider
  npm run test:provider:points
  npm run test:provider:campaigns
  ```

  Run just one contract suite:

  ```bash
  npm run test:contract:points
  npm run test:contract:campaigns
  ```

  Run the weighted k6 scenarios once k6 is installed on your machine:

  ```bash
  npm run test:load:k6
  ```

  For the cleanest baseline, run k6 against the production server instead of `next dev`:

  ```bash
  npm run build
  npm run start
  ```

  Then in a second terminal:

  ```bash
  K6_BASE_URL=http://localhost:3000 npm run test:load:k6
  npm run test:load:k6:triage
  ```

  On Windows PowerShell, use:

  ```powershell
  $env:K6_BASE_URL="http://localhost:3000"
  npm.cmd run test:load:k6
  npm.cmd run test:load:k6:triage
  ```

  Create or clear test data with a Supabase/Postgres connection string in `SUPABASE_DB_URL`:

  ```bash
  npm run db:test:seed
  npm run db:test:teardown
  ```

  The k6 script reads:

  - `K6_BASE_URL` for the target host
  - `K6_AUTH_TOKEN` for an optional bearer token

  The k6 mix now includes:

  - points award
  - points redeem
  - campaign resolution
  - flash-sale claim
  - campaign analytics reads
  - campaign notification queue writes

  The default thresholds are calibrated to the current production baseline for these Supabase-backed API paths, so the nightly run alerts on meaningful regressions instead of the existing steady-state latency profile.

  The repo also includes:

  - provider verification scripts in `tests/provider`
  - a Grafana dashboard JSON in `monitoring/grafana/dashboards/centralperk-rewards-load.json`
  - GitHub Actions workflows in `.github/workflows`
  - Supabase test seed and teardown SQL in `supabase/tests`

  The k6 baseline run writes its output to:

  - `tests/load/results/summary.txt`
  - `tests/load/results/summary.json`
  - `tests/load/results/triage.md`
  

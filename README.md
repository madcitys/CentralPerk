# CentralPerk

CentralPerk is a loyalty rewards web application built with Next.js, React, Supabase, and Tailwind CSS.

## Project Layout

- `LOYALTY_SYSTEM-main/CentralPerk/` - main web application
- `LOYALTY_SYSTEM-main/CentralPerk/supabase/` - SQL scripts, migrations, and Supabase functions
- `.github/workflows/` - CI workflows for contract tests, provider verification, and nightly k6 runs

## Run The App

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

## Test Work

The repo includes the Sprint 4 API testing work for the rewards system:

- Pact consumer tests for points and campaign flows
- Pact provider verification for points and campaign APIs
- Integration tests for award, redeem, idempotency, tier transitions, expiry, and multiplier logic
- k6 load scenarios, Grafana dashboard config, and baseline triage output
- Supabase test seed and teardown SQL

## Notes

- The frontend was migrated from Vite to Next.js.
- The consolidated Supabase source of truth is `LOYALTY_SYSTEM-main/CentralPerk/supabase/final_consolidated_sprint1.sql`.
- The main app README with detailed run and test commands is in `LOYALTY_SYSTEM-main/CentralPerk/README.md`.

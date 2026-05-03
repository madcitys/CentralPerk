# CentralPerk Loyalty

Local loyalty platform for System 3.

## Layout

```text
centralperk-frontend/
  src/
  public/
  package.json
  Dockerfile
centralperk-backend/
  src/
  gateway/
  member-service/
  points-engine/
  campaign-service/
  segment-service/
  notification-service/
  reward-service/
postman/
scripts/
docs/
.github/workflows/
  backend-ci.yml
  frontend-ci.yml
  loyalty-load-nightly.yml
  points-expiry-nightly.yml
```

Explorer tip: dependency folders and generated build outputs are ignored so the root view stays focused on the deployable frontend, backend, Postman, docs, and scripts.

## Docker Stack

The Docker stack runs the frontend on `http://127.0.0.1:3000` and the gateway on `http://127.0.0.1:4000`.

Use:

```powershell
npm run setup:local
npm run compose:config
docker compose up --build -d
```

Key microservice containers:

```text
gateway            -> 4000
points-engine      -> internal 4001
campaign-service   -> internal 4002
member-service     -> internal 4003
segment-service    -> internal 4004
notification-service -> internal 4005
reward-service     -> internal 4006
```

## Frontend Handoff

```powershell
npm run test:contracts
npm run build:frontend
```

`centralperk-frontend` is prepared for FE-only push and contains:

```text
.env.example
tests/contracts
src/
public/
```

## CI/CD

- `.github/workflows/frontend-ci.yml` runs the frontend build and Pact consumer tests for `centralperk-frontend/**`, then publishes Pact files when the broker secrets are configured.
- `.github/workflows/backend-ci.yml` runs service builds, coverage, provider verification, Docker validation, and gateway API checks for backend and shared stack changes.
- `.github/workflows/loyalty-load-nightly.yml` runs the Sprint 5 k6 baseline nightly and can forward metrics to Grafana Prometheus Remote Write when the Grafana secrets are set.

## Project Buckets

- `postman/` keeps the API inventory and local environments together.
- `supabase/` keeps database-side work together: migrations, seeds, and query references.
- `centralperk-frontend/` keeps the member/admin portal code.
- `centralperk-backend/` keeps the NestJS API plus Loyalty microservices.
- `docs/` is reference-only and not part of the running Docker stack.

## Local Dev

Bootstrap everything:

```powershell
npm run setup:local
```

Frontend:
```powershell
npm run dev:frontend
```

Legacy Nest backend:
```powershell
npm run dev:backend
```

Unified local stack:

```powershell
docker compose up --build -d
```

Local API checks:
```powershell
Invoke-RestMethod http://127.0.0.1:4000/health
Invoke-RestMethod http://127.0.0.1:4000/members
Invoke-RestMethod http://127.0.0.1:4000/campaigns
Invoke-RestMethod http://127.0.0.1:4000/segments
Invoke-RestMethod http://127.0.0.1:4000/notifications?limit=20
Invoke-RestMethod http://127.0.0.1:4000/tiers/rules
Invoke-RestMethod http://127.0.0.1:4000/rewards
Invoke-RestMethod http://127.0.0.1:4000/analytics/program-health
```

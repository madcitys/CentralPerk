# CentralPerk Loyalty

Local loyalty platform for System 3.

## Layout

```text
postman/
supabase/
  migrations/
  seeds/
  queries/
src/
  frontend/
  backend/
    src/
    gateway/
    member-service/
    points-engine/
    campaign-service/
    segment-service/
    notification-service/
    reward-service/
docs/
  archive/
    legacy-frontend/
    legacy-services/
```

Explorer tip: `.github`, `.runtime`, `.vscode`, `docs`, `scripts`, and dependency folders are hidden in the shared VS Code workspace settings so the root view stays close to the cleaner Carlos-style layout.

## Docker Stack

The Docker stack runs the frontend on `http://localhost:3000` and the gateway on `http://localhost:4000`.

Use:

```powershell
npm run setup:backend
npm run compose:config
npm run compose:up
```

Key microservice containers:

```text
gateway            -> 4000
backend-api        -> internal 4000 (legacy Nest support for UI-only routes)
points-engine      -> internal 4001
campaign-service   -> internal 4002
member-service     -> internal 4003
segment-service    -> internal 4004
notification-service -> internal 4005
reward-service     -> internal 4006
```

## Frontend Handoff

```powershell
npm run verify:loyalty-frontend
npm run test:contracts
npm run build:frontend
```

`src/frontend` is prepared for FE-only push and contains:

```text
README.md
.env.example
.github/workflows/master-pipeline-fe.yml
.github/workflows/frontend-handoff.yml
tests/contracts
tests/performance
```

## Project Buckets

- `postman/` keeps the API inventory and local environments together.
- `supabase/` keeps database-side work together: migrations, seeds, and query references.
- `src/` keeps the active frontend and backend code together.
- `docs/` is reference-only and not part of the running Docker stack.

## Local Dev

Frontend:
```powershell
npm run dev:frontend
```

Legacy Nest backend:
```powershell
npm run dev:backend
```

Smoke checks:
```powershell
Invoke-RestMethod http://localhost:4000/health
Invoke-RestMethod http://localhost:4000/members
Invoke-RestMethod http://localhost:4000/campaigns
Invoke-RestMethod http://localhost:4000/segments
Invoke-RestMethod http://localhost:4000/notifications?limit=20
Invoke-RestMethod http://localhost:4000/tiers/rules
Invoke-RestMethod http://localhost:4000/rewards
```

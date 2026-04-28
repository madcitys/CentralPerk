# System 3 NestJS Backend

NestJS backend for local API testing on port `4000`.

## Windows PowerShell

```powershell
cd C:\Users\cedru\Downloads\LOYALTYSYSTEM-main\LOYALTYSYSTEM-main
npm run setup:backend
npm run build:backend
npm run start:backend
```

Run the frontend separately:

```powershell
npm run dev
```

Health checks:

```powershell
Invoke-RestMethod http://localhost:4000/health
Invoke-RestMethod http://localhost:4000/segments
Invoke-RestMethod http://localhost:4000/rewards
Invoke-RestMethod http://localhost:4000/partners/dashboard
Invoke-RestMethod http://localhost:4000/communications/analytics
```

Local/demo mode reads and writes `../.runtime/api-store.json`. If Supabase env is missing or invalid, the backend stays usable with local fallback data.

## Supabase

For real persistence, create `backend/.env` with backend-safe variables:

```powershell
PORT=4000
USE_LOCAL_LOYALTY_API=false
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Run the SQL files in `backend/migrations` in Supabase SQL Editor. The migrations are idempotent and seed the default tiers and rewards.

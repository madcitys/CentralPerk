# System 3 NestJS Backend

NestJS backend for local API testing on `http://127.0.0.1:4000`.

## Windows PowerShell

```powershell
cd C:\Users\cedru\Downloads\CentralPerk-develop\CentralPerk-develop
npm run setup:backend
npm run build:backend
npm run start:backend
```

Run the frontend separately:

```powershell
npm run dev:frontend
```

Health checks:

```powershell
Invoke-RestMethod http://127.0.0.1:4000/health
Invoke-RestMethod http://127.0.0.1:4000/segments
Invoke-RestMethod http://127.0.0.1:4000/rewards
Invoke-RestMethod http://127.0.0.1:4000/partners/dashboard
Invoke-RestMethod http://127.0.0.1:4000/communications/analytics
Invoke-RestMethod http://127.0.0.1:4000/notifications?limit=20
```

Local/demo mode reads and writes `../.runtime/api-store.json`. If Supabase env is missing or invalid, the backend stays usable with local fallback data.

## Supabase

For real persistence, create `centralperk-backend/.env` with backend-safe variables:

```powershell
PORT=4000
USE_LOCAL_LOYALTY_API=false
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

The current Docker stack reads backend-safe Supabase variables from `centralperk-frontend/.env` and forwards them to the microservices. Keep service-role keys out of browser code.

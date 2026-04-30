# System 3 Postman Setup

This folder is the centralized API inventory for local and shared testing.

Import these two files into Postman:

1. `system-3-local.postman_environment.json`
2. `system-3-api.postman_collection.json`

Or use the newer localhost-specific pair:

1. `System-3-Loyalty-Local.postman_environment.json`
2. `System-3-Loyalty-API.postman_collection.json`

Select the `System 3 Loyalty Local` environment in the top-right environment dropdown.

For local testing, keep:

```text
baseUrl = http://localhost:4000
```

For deployed testing, replace `baseUrl` with the deployed gateway or Next API domain, for example:

```text
baseUrl = https://your-loyalty-app.vercel.app
```

Do not use the Supabase project URL as `baseUrl`. Supabase is the database/auth layer behind the Nest backend.

Do not use the Next frontend URL as `baseUrl`. If Postman points to `http://localhost:3000`, it will return a Next.js HTML page with `/_next/static` or `__NEXT_DATA__` instead of API JSON.

Start the full local stack before testing.

Preferred Docker flow:

```powershell
npm run compose:up
```

Alternative local dev flow:

```powershell
npm run setup:local
npm run local
```

Then run `00 Health / Health Check` first. If it returns `ok: true`, continue with `01 Points Service / Award Points - No Body Params`.

`Award Points - No Body Params` and `Transaction Completed Event` generate a fresh `transactionRef` before every send. This is required because duplicate POS references are intentionally ignored by the API.

Expected local ports:

```text
Frontend: http://localhost:3000
Backend API: http://localhost:4000
Postman baseUrl: http://localhost:4000
```

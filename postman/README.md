# System 3 Postman Setup

This folder is the centralized API inventory for local and shared testing.

Import these two files into Postman:

1. `system-3-local.postman_environment.json`
2. `system-3-api.postman_collection.json`

Or use the newer localhost-specific pair:

1. `System-3-Loyalty-Local.postman_environment.json`
2. `System-3-Loyalty-API.postman_collection.json`

Select the `System 3 Loyalty Local` environment in the top-right environment dropdown.

The environment keeps entity variables such as `memberId`, `campaignId`, `rewardId`, `partnerId`, and `notificationId` blank by default. The collection pre-request script auto-loads the latest valid IDs from the running gateway before each request, and create requests overwrite those variables from the backend response.

For local testing, keep:

```text
baseUrl = http://127.0.0.1:4000
```

Docker host ports:

```text
frontendUrl = http://127.0.0.1:3000
gatewayUrl = http://127.0.0.1:4000
pointsEngineUrl = http://127.0.0.1:4001
campaignServiceUrl = http://127.0.0.1:4002
memberServiceUrl = http://127.0.0.1:4003
segmentServiceUrl = http://127.0.0.1:4004
notificationServiceUrl = http://127.0.0.1:4005
rewardServiceUrl = http://127.0.0.1:4006
```

For deployed testing, replace `baseUrl` with the deployed gateway or Next API domain, for example:

```text
baseUrl = https://your-loyalty-app.vercel.app
```

Do not use the Supabase project URL as `baseUrl`. Supabase is the database/auth layer behind the Nest backend.

Do not use the Next frontend URL as `baseUrl`. If Postman points to `http://127.0.0.1:3000`, it will return a Next.js HTML page with `/_next/static` or `__NEXT_DATA__` instead of API JSON.

Why that happens:

- `3000` is the Next frontend container, so `/health` there is handled as a page route and returns HTML.
- `4000` is the Docker-exposed gateway, so `/health` there returns the backend JSON you want.
- `4001` to `4006` are the direct microservice ports if you want to bypass the gateway while debugging.
- On Windows, `127.0.0.1` is more reliable than `localhost` for Postman because some tools try IPv6 `::1` first.

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

Then run `00 Health / Health Check` first. If it returns `ok: true`, continue with `01 Points Service / Award Points - Purchase Claim`.

`Award Points - Purchase Claim` and `Transaction Completed Event` generate a fresh `transactionRef` before every send. This is required because duplicate POS references are intentionally ignored by the API.

For the centralized loyalty monitoring flow, `06 Analytics / Get Program Health` should also return `200` from the same `baseUrl`.

Expected local ports:

```text
Frontend: http://127.0.0.1:3000
Backend API: http://127.0.0.1:4000
Points Engine: http://127.0.0.1:4001
Campaign Service: http://127.0.0.1:4002
Member Service: http://127.0.0.1:4003
Segment Service: http://127.0.0.1:4004
Notification Service: http://127.0.0.1:4005
Reward Service: http://127.0.0.1:4006
Postman baseUrl: http://127.0.0.1:4000
```

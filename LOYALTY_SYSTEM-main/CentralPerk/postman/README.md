# System 3 Postman Setup

Import these two files into Postman:

1. `system-3-local.postman_environment.json`
2. `system-3-api.postman_collection.json`

Select the `System 3 Loyalty Local` environment in the top-right environment dropdown.

For local testing, keep:

```text
baseUrl = http://127.0.0.1:4000
```

For direct Next API debugging, use this only when the Next app is running:

```text
baseUrl = http://127.0.0.1:3000/api
```

For deployed testing, replace `baseUrl` with the deployed gateway or Next API domain, for example:

```text
baseUrl = https://your-loyalty-app.vercel.app
```

Do not use the Supabase project URL as `baseUrl`. Supabase is only the database/auth backend; these API routes live in the Next app.

Start the full local stack before testing:

```powershell
npm run setup:local
npm run local
```

Then run `00 Health / Health Check` first. If it returns `ok: true`, continue with `01 Points Service / Award Points - No Body Params`.

`Award Points - No Body Params` and `Transaction Completed Event` generate a fresh `transactionRef` before every send. This is required because duplicate POS references are intentionally ignored by the API.

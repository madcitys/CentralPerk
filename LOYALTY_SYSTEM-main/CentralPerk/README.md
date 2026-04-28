# SYSTEM-3-Revise

Local loyalty platform for System 3.

## Local QA Setup

## Windows QA Setup From ZIP

This project can run locally without Supabase keys. When keys are missing, the app and services use the local/demo runtime store in `.runtime/api-store.json`.

Use PowerShell from the project root:

```powershell
npm run setup:local
npm run local
npm run qa
```

Open the app with:

```text
http://127.0.0.1:3000/admin/settings
```

Use `127.0.0.1`, not `localhost`, for local QA and Postman. If Chrome shows `chrome-error://chromewebdata`, the local server is not running yet. Run `npm run local` again and verify ports `3000`, `4000`, `4001`, and `4002` are listening.

If you run `npm run build` while the local stack is already open, run `npm run local` again before testing. Next.js rewrites `.next` during production builds, so restarting avoids mixed dev/build artifacts.

Postman local gateway base URL:

```text
http://127.0.0.1:4000
```

Real Supabase persistence is optional for QA. To test against Supabase, copy `.env.example` to `.env.local` and fill in the real project values.

## Contract Testing

Consumer contract tests:

```powershell
npm run test:contracts
```

Provider verification from local pact files:

```powershell
npm run verify:contracts:points
npm run verify:contracts:campaign
```

For the local Pact Broker workflow, see [contracts/README.md](C:/CentralPerk-main/CentralPerk-main/contracts/README.md).

## Local Pact Broker

Start the broker with Docker:

```powershell
docker compose -f contracts/docker-compose.pact-broker.yml up -d
```

Set the local broker environment:

```powershell
$env:PACT_BROKER_BASE_URL="http://127.0.0.1:9292"
$env:PACT_BROKER_USERNAME="pact"
$env:PACT_BROKER_PASSWORD="pact"
$env:PACT_CONSUMER_VERSION="dev-local"
$env:PACT_BRANCH="local"
$env:PACT_TARGET_ENVIRONMENT="test"
```

Then run:

```powershell
npm run contracts:publish
npm run verify:contracts:points
npm run verify:contracts:campaign
npm run contracts:can-i-deploy
npm run test:contracts:break
```

## Load Testing

Baseline load test:

```powershell
npm run loadtest:baseline
```

Grafana / Prometheus remote-write mode:

```powershell
npm run loadtest:grafana
```

Baseline artifacts are written to:

```text
services/gateway/load-test/artifacts
```

## GitHub Actions

The nightly k6 workflow lives in:

```text
.github/workflows/loyalty-k6-nightly.yml
```

It supports both scheduled execution and manual `workflow_dispatch`, builds the loyalty services, runs the gateway k6 baseline, and uploads the nightly summary plus service logs as artifacts.

# Loyalty Theme 1 Remaining Tasks

This guide maps the remaining Theme 1 tasks to the repo commands and artifacts that now exist.

## Contract testing

### LYL-S5-003-T1

Write Pact consumer tests for points endpoints in loyalty frontend.

Command:

```powershell
npm run test:contracts
```

Proof:

- Terminal output showing the `loyalty frontend -> points engine pact` suite passing
- Generated file `pacts/loyalty-frontend-points-engine.json`

### LYL-S5-003-T2

Write Pact consumer tests for campaign endpoints in loyalty frontend.

Command:

```powershell
npm run test:contracts
```

Proof:

- Terminal output showing the `loyalty frontend -> campaign service pact` suite passing
- Generated file `pacts/loyalty-frontend-campaign-service.json`

### LYL-S5-003-T3

Set up provider verification in Points Engine.

Command:

```powershell
npm run verify:contracts:points
```

Proof:

- Terminal output showing the points provider verification interactions and `OK` matches

### LYL-S5-003-T4

Set up provider verification in Campaign Service.

Command:

```powershell
npm run verify:contracts:campaign
```

Proof:

- Terminal output showing the campaign provider verification interactions and `OK` matches

### LYL-S5-003-T5

Configure Pact Broker and run intentional breaking test.

Commands:

```powershell
docker compose -f contracts/docker-compose.pact-broker.yml up -d
$env:PACT_BROKER_BASE_URL="http://127.0.0.1:9292"
$env:PACT_CONSUMER_VERSION="dev-local"
$env:PACT_BRANCH="local"
npm run contracts:publish
npm run test:contracts:break
```

Proof:

- Broker publish output
- Breaking verification output ending with `Intentional breaking pact failed provider verification as expected.`

## Load testing

### LYL-S5-004-T1

Write k6 script with weighted scenario distribution.

Primary asset:

- `services/gateway/load-test/k6-gateway.js`

What it covers:

- weighted constant-arrival-rate scenarios for health, tiers, award, redeem, and campaign reads

### LYL-S5-004-T2

Configure threshold assertions including 0.1% error rate.

Primary asset:

- `services/gateway/load-test/k6-gateway.js`

What it covers:

- `http_req_failed: ["rate<0.001"]`
- scenario-specific latency thresholds
- `checks: ["rate>0.99"]`

### LYL-S5-004-T3

Add k6 nightly job to GitHub Actions.

Primary asset:

- `.github/workflows/loyalty-k6-nightly.yml`

### LYL-S5-004-T4

Connect k6 output to Grafana dashboard.

Primary assets:

- `services/gateway/load-test/run-grafana-output.ps1`
- `services/gateway/load-test/observability/prometheus.yml`
- `services/gateway/load-test/observability/grafana-dashboard.json`
- `services/gateway/load-test/observability/README.md`

### LYL-S5-004-T5

Run baseline test and document results.

Commands:

```powershell
npm run loadtest:baseline
```

Expected artifacts:

- `services/gateway/load-test/artifacts/baseline-summary.json`
- `services/gateway/load-test/artifacts/baseline-results.json`
- `services/gateway/load-test/artifacts/baseline-summary.md`

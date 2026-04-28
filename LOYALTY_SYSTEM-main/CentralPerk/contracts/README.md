# Pact Broker

The repo publishes consumer contracts from `./pacts` and verifies providers from the service packages.

## Local broker

If Docker is available in your environment, start the broker with:

```bash
docker compose -f contracts/docker-compose.pact-broker.yml up -d
```

The broker will be available at `http://127.0.0.1:9292`.

For the local Docker broker in this repo, the default basic auth credentials are:

```text
username: pact
password: pact
```

## Publish pacts

Set these environment variables before publishing:

- `PACT_BROKER_BASE_URL`
- `PACT_BROKER_USERNAME` / `PACT_BROKER_PASSWORD` if your broker uses basic auth
- `PACT_CONSUMER_VERSION`
- `PACT_BRANCH`
- `PACT_BROKER_TOKEN` if your broker requires auth

Then run:

```bash
npm run contracts:publish
```

For the local Docker broker in this repo, these values work:

```powershell
$env:PACT_BROKER_BASE_URL="http://127.0.0.1:9292"
$env:PACT_BROKER_USERNAME="pact"
$env:PACT_BROKER_PASSWORD="pact"
$env:PACT_CONSUMER_VERSION="dev-local"
$env:PACT_BRANCH="local"
$env:PACT_TARGET_ENVIRONMENT="test"
```

## Provider verification

Points Engine:

```bash
npm run verify:contracts:points
```

Campaign Service:

```bash
npm run verify:contracts:campaign
```

If `PACT_BROKER_BASE_URL` is set, verification reads the latest pact for the configured branch from the broker and publishes verification results back to the broker.

## Can I Deploy

Set the target environment first if it is not already set:

```powershell
$env:PACT_TARGET_ENVIRONMENT="test"
```

```bash
npm run contracts:can-i-deploy
```

With the local broker flow working, this should return `Computer says yes` after:

1. `npm run test:contracts`
2. `npm run contracts:publish`
3. `npm run verify:contracts:points`
4. `npm run verify:contracts:campaign`

## Intentional breaking verification

```bash
npm run test:contracts:break
```

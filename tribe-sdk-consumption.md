# Tribe SDK Consumption Guide

This guide is for tribe teams that need to call API Center, shared services,
or governed Kafka publishing from their own service.

For a step-by-step consumer-side operating checklist, use
`docs/consumer-runbook.md`.

## What You Install

Install the SDK from GitHub Packages:

```text
@implementsprint/sdk
```

The SDK is not the gateway. It is a client wrapper that calls API Center.
Installing it does not grant access by itself.

## Is The SDK Public?

Right now, the SDK package is **not public npm**. It is published to GitHub
Packages:

```text
https://npm.pkg.github.com
```

The package is configured with restricted access, so tribe teams need GitHub
Packages authentication to install it.

Even if the package visibility is changed to public in GitHub Packages, npm
install flows still normally need GitHub Packages auth. If the goal is
token-free installs for any tribe repository, the SDK should be published to the
public npm registry instead.

The SDK package being visible does not give anyone access to API Center. Live
API access still requires a registered tribe ID, a valid tribe secret, allowed
scopes, and `consumes` policy in API Center.

## What You Need From API Center

Before your service can use the SDK, the API Center/platform team must give you:

| Value | Example | Purpose |
| --- | --- | --- |
| `APICENTER_URL` | `https://api-center.itsandbox.site` | Public API Center gateway URL |
| `APICENTER_TRIBE_ID` | `campusone` | Your registered service or tribe ID |
| `APICENTER_TRIBE_SECRET` | secret value issued by platform | Used by API Center to issue tokens |
| Allowed `consumes` list | `payment`, `email`, `geo` | Shared/tribe services your tribe can call |
| Required scopes | `payment:charge`, `email:send` | Authorization scopes issued in your token |

API Center stores only the hashed tribe secret in a per-tribe Secret Manager
secret:

```text
api-center-tribe-secret-<service-id>
```

For `campusone`, that is:

```text
api-center-tribe-secret-campusone
```

The old `TRIBE_SECRET_<SERVICE_ID_UPPER_SNAKE>` env var is only a local/dev or
temporary rollback fallback. New production tribe onboarding should not require
editing `api-center-prod`.

## Configure GitHub Packages

Create `.npmrc` in your tribe repository:

```ini
@implementsprint:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Set `GITHUB_TOKEN` to a GitHub token with `read:packages` permission and access
to the `ImplementSprint` package.

For local development on Windows PowerShell:

```powershell
$env:GITHUB_TOKEN = "ghp_..."
npm install @implementsprint/sdk
```

For CI in a tribe repository, store the token as a repository or organization
secret and expose it only during install:

```yaml
- uses: actions/setup-node@v6
  with:
    node-version: '24'
    registry-url: https://npm.pkg.github.com
    scope: '@implementsprint'

- run: npm ci
  env:
    NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

If the consuming tribe repository is not allowed to read the package with its
default `GITHUB_TOKEN`, use a classic PAT secret with `read:packages`.

## Install

```bash
npm install @implementsprint/sdk
```

Then commit the resulting `package.json` and lockfile changes.

## Runtime Environment

Your service needs these runtime variables:

```env
APICENTER_URL=https://api-center.itsandbox.site
APICENTER_TRIBE_ID=campusone
APICENTER_TRIBE_SECRET=<secret-issued-by-platform>
```

Do not store provider credentials such as PayMongo, Resend, Google Maps, or
Confluent credentials in tribe apps for shared-service calls. Those belong to
API Center or the shared-service runtimes.

## Basic Usage

```ts
import { TribeClient } from '@implementsprint/sdk';

export const apiCenter = new TribeClient({
  gatewayUrl: process.env.APICENTER_URL!,
  tribeId: process.env.APICENTER_TRIBE_ID!,
  secret: process.env.APICENTER_TRIBE_SECRET!,
});
```

The client authenticates lazily before the first request. You can also fail fast
during startup:

```ts
await apiCenter.authenticate();
```

## Calling Shared Services

Prefer typed wrappers when available:

```ts
await apiCenter.emailSend({
  to: 'customer@example.com',
  subject: 'Welcome',
  body: 'Thanks for joining.',
});
```

```ts
const checkout = await apiCenter.paymentCreateCheckoutSession({
  referenceId: 'order-123',
  successUrl: 'https://app.example.com/payment/success',
  cancelUrl: 'https://app.example.com/payment/cancel',
  paymentMethods: ['card', 'gcash', 'maya', 'grabpay', 'qrph'],
  lineItems: [
    {
      name: 'Starter Plan',
      quantity: 1,
      amount: { value: 99900, currency: 'PHP' },
    },
  ],
});
```

`paymentMethods` is optional. If you omit it, API Center routes the call to the
PayMongo shared service and that service applies the platform default. Use this
field only when your checkout needs to limit the available choices.

Supported payment method request values:

| Option | Value |
| --- | --- |
| QRPh | `qrph` |
| GCash | `gcash` |
| GrabPay | `grabpay` or `grab_pay` |
| Maya | `maya` or `paymaya` |
| Visa / Mastercard | `card`, `visa`, or `mastercard` |
| Direct Online Banking | `direct_online_banking`, `online_banking`, `dob`, or `brankas` |

The platform may still reject a method if it is not enabled for the environment
or PayMongo account. Do not call PayMongo directly to bypass that policy.

```ts
const location = await apiCenter.geoReverseGeocode({
  latitude: 14.5995,
  longitude: 120.9842,
});
```

The runtime path is:

```text
tribe service
  -> @implementsprint/sdk
  -> API Center /api/v1/shared/:serviceId/*
  -> API Center auth, registry, consumes, scope, and rate-limit checks
  -> shared-service runtime
  -> provider API
```

## Calling Another Tribe

Use `callService` for tribe-to-tribe calls:

```ts
const profile = await apiCenter.callService('profile-service', '/users/123', {
  method: 'GET',
});
```

API Center checks whether your tribe is allowed to consume `profile-service`
before proxying the request.

## Publishing Events For S3

Use governed Kafka helpers for tribe business events:

```ts
const topic = TribeClient.buildTenantTopic('campusone', 'events');

await apiCenter.kafkaPublish({
  topic,
  key: 'order-123',
  eventType: 'order.created',
  payload: {
    orderId: 'order-123',
    amount: 99900,
    currency: 'PHP',
  },
});
```

The event path is:

```text
tribe service
  -> @implementsprint/sdk
  -> API Center /api/v1/kafka/publish
  -> API Center Kafka governance
  -> Confluent Cloud topic
  -> Confluent S3 Sink
  -> AWS S3 raw data lake
```

Only data published to governed Kafka topics can flow into S3. Normal HTTP API
calls do not automatically become tribe business datasets unless API Center or
the tribe publishes an event for them.

Analytics consumers should be added downstream from S3 later. They are not
required for tribe SDK usage.

## Common Errors

| Error | Meaning | Fix |
| --- | --- | --- |
| `401` token request | Wrong tribe ID or secret | Check `APICENTER_TRIBE_ID` and `APICENTER_TRIBE_SECRET` |
| `403` shared-service call | Missing `consumes` entry or scope | Ask platform to update your tribe registration |
| `404` service call | Target service is not registered or not healthy | Check discovery or API Center registry |
| npm `404` installing SDK | Missing GitHub Packages auth or access | Check `.npmrc` and token `read:packages` |
| npm `401` installing SDK | Token is missing/invalid | Refresh the GitHub token |

## Tribe Checklist

Before going live:

- `.npmrc` points `@implementsprint` to `https://npm.pkg.github.com`.
- CI can run `npm ci`.
- `@implementsprint/sdk` is in `package.json`.
- Runtime has `APICENTER_URL`, `APICENTER_TRIBE_ID`, and `APICENTER_TRIBE_SECRET`.
- Tribe is registered in API Center.
- Tribe manifest lists every shared or tribe service it needs in `consumes`.
- At least one SDK smoke test passes against API Center.

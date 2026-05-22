# APICenter Shared SDK

This repository contains the shared SDK package used by tribe services and partner consumers to call APICenter through the supported gateway contracts.

## Package

- Package: `@implementsprint/sdk`
- Runtime: Node.js 24
- Build output: `dist/`
- Registry target: GitHub Packages npm registry
- Publish access: restricted by default

## Package Visibility

The SDK is currently published through GitHub Packages, not the public npm
registry.

```text
Registry: https://npm.pkg.github.com
Package:  @implementsprint/sdk
Access:   restricted/private package access
```

That means tribe teams need GitHub Packages authentication to install it.

Even if the GitHub Package is made visible/public later, GitHub's npm registry
still expects authentication for npm installs in normal package-manager flows.
If we want truly public, token-free install, we should publish to the public npm
registry instead.

Public SDK code does not grant API Center access. API Center access is still
controlled by tribe registration, tribe secrets, scopes, `consumes` policy, and
gateway rate limits.

## How the Repositories Fit Together

APICenter is split into two repos on purpose:

- `api-center` is the gateway runtime. It owns auth, registry state, policy enforcement, proxying, rate limits, circuit breakers, metrics, and audit events.
- `api-shared-services` is the consumer and shared-service artifact repo. It owns `@implementsprint/sdk`, shared-service manifests, shared-service runtime scaffolds, and contract checks.

The SDK never calls a shared service directly. It always calls AP Center, and AP Center decides whether the request is allowed before proxying it to the registered runtime.

```text
tribe service
  -> @implementsprint/sdk
  -> AP Center gateway
  -> registry and scope checks
  -> shared-service runtime
  -> provider API or mock provider
```

This keeps provider credentials and runtime policy out of tribe services.

## Tribe Consumption

Tribe services install the SDK from GitHub Packages.

Example `.npmrc` (consumer repo):

```ini
@implementsprint:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Then install normally:

```bash
npm install @implementsprint/sdk
```

See `.npmrc.example` in this repository for the canonical template.

If we later switch to the public npm registry, tribe teams would remove the
GitHub Packages `.npmrc` entry and install directly with the same package name:

```bash
npm install @implementsprint/sdk
```

Full tribe onboarding guide:

- `docs/tribe-sdk-consumption.md`
- `docs/consumer-runbook.md`

## Getting Started

Install dependencies:

```bash
npm install
```

Build the SDK:

```bash
npm run build
```

Validate CI-equivalent checks locally:

```bash
npm run ci
```

## Usage

```ts
import { TribeClient } from '@implementsprint/sdk';

const client = new TribeClient({
  gatewayUrl: process.env.APICENTER_URL || 'http://localhost:3000',
  tribeId: 'orders-service',
  secret: process.env.ORDERS_SERVICE_SECRET || ''
});

await client.authenticate();
const user = await client.callService('user-service', '/users/123');
```

### What the SDK Does

`TribeClient` is a gateway client, not a service implementation. It handles:

- Token issuance through `/api/v1/auth/token`.
- Token refresh before expiry.
- Bearer authorization headers.
- `X-Tribe-Id` and optional correlation ID propagation.
- Gateway route construction for tribe and shared-service calls.
- Retry with exponential backoff for transient gateway/upstream failures.
- Response unwrapping from AP Center's `{ success, data }` envelope.
- Error mapping into SDK error classes.

The three generic routing methods are:

```ts
await client.callService('user-service', '/users/123');
await client.callSharedService('email', '/send', { method: 'POST', data: payload });
await client.callSharedService('geo', '/reverse-geocode', {
  method: 'POST',
  data: { latitude: 14.5995, longitude: 120.9842 },
});
```

Typed helpers such as `paymentCreateCheckoutSession`, `emailSend`, `smsSend`, `gauthExchangeCode`, and `otpGenerate` are thin wrappers over `callSharedService`.

### Required AP Center Setup

An SDK call succeeds only when AP Center has the right runtime configuration:

1. The calling tribe is registered in AP Center.
2. AP Center can resolve the calling tribe's per-tribe Secret Manager hash at
   `api-center-tribe-secret-<service-id>`; `TRIBE_SECRET_*` is only a local/dev
   or rollback fallback.
3. The target shared service is registered with `serviceType: "shared"`.
4. The calling tribe manifest lists the target shared service in `consumes`.
5. The token issued to the tribe includes the target service's required scopes.

If `consumes` or scopes are missing, the SDK request still reaches AP Center, but AP Center rejects it before the shared-service runtime receives the request.

### Service discovery helpers

```ts
const tribeServices = await client.listTribeServices();
const sharedServices = await client.listSharedServices();
const allServices = await client.listAllServices();
const billingService = await client.getService('billing-service');
```

Scope catalog discovery is exposed for platform-operator style clients:

```ts
const scopes = await client.getServiceScopes();
```

`getServiceScopes()` calls `/api/v1/registry/scopes`. If the caller is not allowed to read that admin endpoint, the SDK falls back to deriving dynamic service scopes from accessible tribe/shared service discovery results.

### Draft payment wrapper helpers

The SDK now includes draft payment wrapper methods routed through AP Center shared services:

```ts
const checkout = await client.paymentCreateCheckoutSession({
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

await client.paymentGetCheckoutSession(checkout.checkoutId);
await client.paymentGetCheckoutStatus(checkout.checkoutId);

await client.paymentMarkCheckoutCancelled(checkout.checkoutId, {
  reason: 'user_returned_from_cancel_url',
});

await client.paymentCreateRefund('pay_123', {
  amount: { value: 5000, currency: 'PHP' },
  reason: 'customer_request',
});
```

These wrappers intentionally abstract provider-specific details so tribes stay
decoupled from PayMongo API surface changes.

The PayMongo shared service normalizes friendly payment method aliases and checks
them against platform policy. Supported request values include `qrph`, `gcash`,
`grabpay` / `grab_pay`, `maya` / `paymaya`, `card` / `visa` / `mastercard`, and
`direct_online_banking`.

### Google OAuth wrapper helpers

Google login can be routed through AP Center shared services using `gauth` wrappers:

```ts
const authUrl = await client.gauthGetAuthorizationUrl({
  redirectUri: 'https://app.example.com/auth/google/callback',
  scopes: ['openid', 'email', 'profile'],
  accessType: 'offline',
});

const tokens = await client.gauthExchangeCode({
  code: '<authorization_code>',
  redirectUri: 'https://app.example.com/auth/google/callback',
});

await client.gauthRefreshToken({
  refreshToken: tokens.refreshToken || '',
});

await client.gauthLogout({
  refreshToken: tokens.refreshToken || undefined,
});
```

This keeps Google provider handling centralized in platform-owned shared service logic.

### Geo wrapper helpers

Google Maps Platform geocoding is routed through the platform-owned `geo`
shared service. Tribes do not receive or store Google Maps API keys.

```ts
const geocoded = await client.geoGeocodeAddress({
  address: 'Manila, Philippines',
});

const reverseGeocoded = await client.geoReverseGeocode({
  latitude: 14.5995,
  longitude: 120.9842,
});

const allowed = await client.geoFenceCheck({
  latitude: 14.5995,
  longitude: 120.9842,
  fenceId: 'metro-manila',
});
```

`geoFenceCheck()` is evaluated locally by the geo shared service against the
provided or configured fences. Google Maps is used for geocoding and reverse
geocoding, not IP geolocation.

### Kafka with Confluent Cloud

New tribe integrations should use the governed Kafka helpers. The SDK calls AP Center, AP Center enforces scopes and topic policy, and AP Center publishes to Confluent Cloud with server-side credentials.

```ts
const governance = await client.kafkaGetGovernanceCatalog();
const topic = TribeClient.buildTenantTopic('orders-service', 'events');

await client.kafkaPublish({
  topic,
  key: 'order-123',
  eventType: 'order.created',
  payload: { orderId: 'order-123' },
});
```

Direct Kafka REST helpers have been removed. Use `kafkaGetGovernanceCatalog()` and `kafkaPublish()` so AP Center can enforce scopes, tenant topic rules, and Confluent Cloud producer credentials centrally.

## SDK Boundary

This package is the only SDK source of truth for tribe consumers.

SDK responsibilities:

- Token lifecycle wrappers: `authenticate`, `refresh`, `revoke`
- Gateway routing wrappers: `callService`, `callSharedService`; `callExternal` remains only for the gateway's legacy guarded external namespace.
- Tribe convenience wrappers: shared-service geo, Kafka helpers
- Typed error mapping and retry behavior

Gateway runtime-only responsibilities (not part of this SDK):

- Auth provider internals (API Center internal JWT, optional Descope validation fallback, Google OAuth shared service)
- Secret and credential management
- Policy guards and authorization enforcement
- Circuit breaker state and distributed runtime controls
- Registry admin operations and revocation storage

For non-Node consumers, use APICenter OpenAPI-generated clients.

## Shared Service Ownership

This repository is also the source of truth for platform-owned shared service artifacts.

Location:

- `shared-services/manifests/`

Runtime scaffolds:

- `shared-services/paymongo/`
- `shared-services/email-gateway/`
- `shared-services/sms-gateway/`
- `shared-services/gauth-gateway/`
- `shared-services/otp-gateway/`
- `shared-services/geo-gateway/`

Add or update shared-service registration manifests here and consume them from APICenter
registration workflows (for example, local bootstrap or onboarding scripts). APICenter
should stay runtime-only and must not store shared-service manifests or implementation code.

### Shared Service Runtime Pattern

Each shared-service runtime follows the same shape:

1. Start an HTTP server with a `/health` endpoint.
2. Implement the provider-facing routes listed in its manifest.
3. Load its manifest from `shared-services/manifests/`.
4. Override `manifest.baseUrl` from `SERVICE_BASE_URL` when deployed.
5. Register with AP Center at `POST /api/v1/registry/register`.
6. Trust AP Center forwarding headers for caller identity and correlation context.

Example payment manifest:

```json
{
  "serviceId": "payment",
  "serviceType": "shared",
  "baseUrl": "http://payment-service:4010",
  "requiredScopes": ["payment:charge", "payment:refund"],
  "exposes": ["/checkout/sessions", "/checkout/sessions/:id", "/payments/:id/refunds"],
  "consumes": []
}
```

When a tribe calls:

```ts
await client.paymentCreateCheckoutSession(payload);
```

the SDK sends:

```text
POST /api/v1/shared/payment/checkout/sessions
```

AP Center validates the caller and proxies the runtime request as:

```text
POST /checkout/sessions
```

The runtime should keep responses stable against the SDK contract even if the provider implementation changes from mock mode to a real provider integration.

### Shared-Service Database Boundary

Shared-service Postgres schemas live in this repo, not in API Center gateway
code:

```text
prisma/shared-services/schema.prisma
supabase/migrations/
```

They create separate schemas for provider/domain records:

```text
shared_payment
shared_otp
shared_email
shared_sms
shared_geo
shared_gauth
```

The schemas can use the same Supabase Postgres project/database as API Center
to save cost, but they use a separate runtime connection string:

```env
SHARED_SERVICES_DATABASE_ENABLED=false
SHARED_SERVICES_DATABASE_URL=postgresql://shared_services_app:<password>@<supabase-pooler-host>:6543/postgres?pgbouncer=true
```

Keep `SHARED_SERVICES_DATABASE_ENABLED=false` until Supabase migrations have
been deployed, and each shared-service gateway has DB write,
Redis fallback, and secret-redaction tests. See
`docs/shared-service-database-schemas.md`.

For payment runtime scaffolding before provider API finalization, use:

- `shared-services/paymongo/` (Official PayMongo shared gateway)

For Google OAuth runtime integration, use:

- `shared-services/gauth-gateway/`

For Google Maps Platform geo integration, use:

- `shared-services/geo-gateway/`

Required production variables:

- `GOOGLE_MAPS_API_KEY`
- `GOOGLE_MAPS_GEOCODING_URL` (optional, defaults to `https://maps.googleapis.com/maps/api/geocode/json`)

Contract snapshot used by CI:

- `contracts/shared-service-contract.json`

Run contract compatibility checks locally:

```bash
npm run check:contracts
```

Run Google OAuth flow smoke tests (against `gauth-gateway`):

```bash
npm run test:gauth
```

To run the full code exchange/refresh/logout sequence, provide:

- `GOOGLE_AUTHORIZATION_CODE` (copied from callback URL after consent)
- optional `GOOGLE_REFRESH_TOKEN` (if your app does not receive a new refresh token)

## Required Runtime Variables for Consumers

- `APICENTER_URL` (gateway base URL)
- `APICENTER_TRIBE_ID` (registered service ID)
- `APICENTER_TRIBE_SECRET` (service secret)

## Publishing

Release automation is configured in `.github/workflows/release.yml`.

Required GitHub configuration:

- No registry variable is required; the workflow pins `https://npm.pkg.github.com`.
- The workflow uses the repository `GITHUB_TOKEN` with `packages: write`.

The workflow publishes on semver tag pushes (`v*.*.*`) or manual dispatch.

Full CI/CD runbook:

- `docs/ci-cd.md`

Release safeguards:

- Package policy check enforces the `@implementsprint/*` scope.
- Package policy check enforces GitHub Packages as the publish registry.

Collaboration runbook:

- `docs/shared-service-delivery-workflow.md`

Tribe SDK usage guide:

- `docs/consumer-runbook.md`
- `docs/sdk-shared-services-apicenter-guide.md`
- `docs/tribe-sdk-consumption.md`

Full APICenter and shared-services setup guide:

- `../api-center/docs/apicenter-platform-setup.md`

## Status

SDK extraction is active and this repository owns tribe-facing SDK evolution independently from gateway runtime versioning.

# API Center Consumer Runbook

This runbook is for a tribe or partner service team that consumes API Center
through `@implementsprint/sdk`.

Use it when you need to:

- Install the SDK in your own backend.
- Authenticate as your registered tribe service.
- Consume platform shared services such as payment, email, SMS, Google auth,
  OTP, and geo.
- Call another tribe service through API Center.
- Expose your own service so other tribes can call it through API Center.
- Publish business events that API Center exports to the S3 raw data lake.

API Center is the gateway and policy layer. The SDK is only the client wrapper.
Installing the SDK does not grant live API access.

## 1. Confirm Your Platform Handoff

Before touching code, get these values from the API Center platform team:

| Value | Example | Why you need it |
| --- | --- | --- |
| `APICENTER_URL` | `https://api-center.itsandbox.site` | Gateway base URL |
| `APICENTER_TRIBE_ID` | `orders-service` | Your registered service ID |
| `APICENTER_TRIBE_SECRET` | one-time secret | Used to request API Center tokens |
| Allowed shared services | `payment`, `email`, `geo` | What your service may consume |
| Allowed tribe services | `profile-service` | Other tribe APIs you may call |
| Required scopes | `payment:charge`, `external:kafka:write` | Scopes issued in your token |
| S3 export topic | `tribe.orders-service.events` | Topic API Center will export to S3 |

Ask the platform team to confirm:

1. Your tribe is registered in API Center.
2. Your `consumes` list includes every shared service and tribe service you
   will call.
3. Your token scopes include every required target scope.
4. Your per-tribe Secret Manager record exists:

```text
api-center-tribe-secret-<service-id>
```

5. If you will publish events to S3, your tribe event topic exists and is in
   the `api-center-s3-sink` connector topic list.

## 2. Check Your Runtime

The current SDK release expects Node.js 24.

```powershell
node --version
npm --version
```

Expected:

```text
v24.x.x
```

If your service uses a different Node version, align it before installing the
SDK. Do this in local development, CI, and production containers.

## 3. Configure GitHub Packages Install Access

The SDK is published to GitHub Packages, not public npm.

Create `.npmrc` in your service repository:

```ini
@implementsprint:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

For local Windows PowerShell:

```powershell
$env:GITHUB_TOKEN = "ghp_..."
npm install @implementsprint/sdk
```

Token requirements:

- `read:packages`
- Access to the `ImplementSprint` package owner or organization

Install-time token rules:

- Use the token only for installing packages.
- Do not put this token in runtime environment variables.
- Do not confuse this with `APICENTER_TRIBE_SECRET`.

## 4. Install The SDK

From your service repository:

```powershell
npm install @implementsprint/sdk
```

Commit the package changes:

```text
package.json
package-lock.json
```

Commit `.npmrc` only if your repository policy allows committing registry
mappings. The file must not contain a literal token value.

## 5. Configure CI Install

If your repository uses the committed `.npmrc` shown above, expose a CI secret
as `GITHUB_TOKEN` during install:

```yaml
- uses: actions/setup-node@v6
  with:
    node-version: '24'

- run: npm ci
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_PACKAGES_READ_TOKEN }}
```

If you let `actions/setup-node` generate the npm auth config instead, use
`NODE_AUTH_TOKEN`:

```yaml
- uses: actions/setup-node@v6
  with:
    node-version: '24'
    registry-url: https://npm.pkg.github.com
    scope: '@implementsprint'

- run: npm ci
  env:
    NODE_AUTH_TOKEN: ${{ secrets.GITHUB_PACKAGES_READ_TOKEN }}
```

Either approach is fine. Keep install-time package auth separate from runtime
API Center auth.

## 6. Add Runtime Environment Variables

Add these variables to your service runtime:

```env
APICENTER_URL=https://api-center.itsandbox.site
APICENTER_TRIBE_ID=orders-service
APICENTER_TRIBE_SECRET=<secret-issued-by-platform>
```

Do not add provider credentials for platform shared services:

- No PayMongo secret key
- No Resend API key
- No SMS provider key
- No Google Maps API key
- No Google OAuth client secret for `gauth` shared-service calls
- No Confluent credentials
- No AWS S3 credentials

Those belong to API Center or the platform shared-service runtimes.

## 7. Create The API Center Client

Create a small client module in your backend:

```ts
import { TribeClient } from '@implementsprint/sdk';

export const apiCenter = new TribeClient({
  gatewayUrl: process.env.APICENTER_URL!,
  tribeId: process.env.APICENTER_TRIBE_ID!,
  secret: process.env.APICENTER_TRIBE_SECRET!,
});
```

Fail fast on startup if your service should not boot without API Center:

```ts
await apiCenter.authenticate();
```

Or skip explicit startup auth and let the first SDK call authenticate lazily.

## 8. Validate Authentication

Add a temporary local smoke script:

```ts
import { apiCenter } from './api-center-client';

async function main() {
  await apiCenter.authenticate();
  console.log('API Center token acquired');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Run it with your runtime variables loaded.

Expected:

```text
API Center token acquired
```

If this fails:

1. Confirm `APICENTER_URL` is API Center, not a shared-service URL.
2. Confirm `APICENTER_TRIBE_ID` matches your registered service ID exactly.
3. Confirm `APICENTER_TRIBE_SECRET` is the current plaintext secret.
4. Ask platform to confirm `api-center-tribe-secret-<service-id>` exists.
5. Ask platform to confirm API Center runtime can read that Secret Manager
   record.

## 9. Discover Available Services

Use discovery to confirm what API Center sees:

```ts
const sharedServices = await apiCenter.listSharedServices();
const tribeServices = await apiCenter.listTribeServices();
const allServices = await apiCenter.listAllServices();

console.log({ sharedServices, tribeServices, allServices });
```

Use this before debugging a `404`. If a target service does not appear, the
problem is registration, lifecycle state, or your access policy.

## 10. Consume A Shared Service

Use typed wrappers when they exist.

Email:

```ts
await apiCenter.emailSend({
  to: 'customer@example.com',
  subject: 'Welcome',
  body: 'Thanks for joining.',
});
```

Payment checkout:

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

Payment status before fulfillment:

```ts
const status = await apiCenter.paymentGetCheckoutStatus(checkout.checkoutId);
```

Geo:

```ts
const address = await apiCenter.geoReverseGeocode({
  latitude: 14.5995,
  longitude: 120.9842,
});
```

OTP:

```ts
const otp = await apiCenter.otpGenerate({
  recipient: '+639171234567',
  channel: 'sms',
  purpose: 'login',
});

await apiCenter.otpVerify({
  otpId: otp.otpId,
  code: '123456',
});
```

Generic fallback:

```ts
await apiCenter.callSharedService('email', '/send', {
  method: 'POST',
  data: {
    to: 'customer@example.com',
    subject: 'Hello',
    body: 'Message body',
  },
});
```

Runtime path:

```text
your service
  -> @implementsprint/sdk
  -> API Center /api/v1/shared/<shared-service-id>/*
  -> API Center auth, registry, consumes, scope, and rate-limit checks
  -> shared-service runtime
  -> provider API or platform implementation
```

## 11. Call Another Tribe Service

Use `callService` for tribe-to-tribe calls:

```ts
const profile = await apiCenter.callService('profile-service', '/users/123', {
  method: 'GET',
});
```

Runtime path:

```text
your service
  -> @implementsprint/sdk
  -> API Center /api/v1/tribes/profile-service/users/123
  -> API Center auth, registry, consumes, scope, and lifecycle checks
  -> profile-service backend
```

If this returns `403`, ask platform to confirm your manifest includes
`profile-service` in `consumes` and that your token includes the required target
scope.

## 12. Expose Your Service To Other Consumers

If other tribes need to call your backend through API Center, give the platform
team your provider-service details:

| Field | Example |
| --- | --- |
| Service ID | `orders-service` |
| Service name | `Orders Service` |
| Base URL | `https://orders.example.com` |
| Health path | `/health` |
| Exposed routes | `/orders`, `/orders/:id` |
| Required scopes | `orders:read`, `orders:write` |
| Owner/contact | team and support channel |

Your backend must:

1. Expose a stable health endpoint.
2. Accept requests from API Center.
3. Read forwarding headers when useful:
   - `X-Tribe-Id`
   - `X-Correlation-ID`
   - `X-Forwarded-By`
4. Return stable JSON responses for consumers.
5. Keep API Center as the public integration path for other tribes.

Do not ask other tribes to call your backend URL directly. They should call:

```ts
await apiCenter.callService('orders-service', '/orders/123');
```

## 13. Publish Business Events For S3 Export

Use governed Kafka publishing when your service needs durable raw events in S3.
You do not receive Confluent or AWS credentials.

Ask platform to confirm:

1. Your token includes `external:kafka:write`.
2. Your tenant topic exists:

```text
tribe.<service-id>.events
```

3. The topic is included in the `api-center-s3-sink` connector.

Publish from your service:

```ts
import { TribeClient } from '@implementsprint/sdk';

const topic = TribeClient.buildTenantTopic(
  process.env.APICENTER_TRIBE_ID!,
  'events',
);

await apiCenter.kafkaPublish({
  topic,
  key: 'order-123',
  eventType: 'order.created',
  payload: {
    orderId: 'order-123',
    amount: 99900,
    currency: 'PHP',
  },
  metadata: {
    source: 'orders-service',
  },
});
```

Publish the base tenant topic such as `tribe.orders-service.events`. API Center
applies the environment prefix, such as `test.` or `prod.`, when it writes to
Kafka.

Event path:

```text
your service
  -> @implementsprint/sdk
  -> API Center POST /api/v1/kafka/publish
  -> API Center Kafka governance
  -> Confluent Cloud topic
  -> Confluent S3 Sink Connector
  -> s3://api-center-raw-data/topics/<topic-name>/...
```

Data rules:

- Publish business events, not request logs.
- Include `eventType`.
- Keep `payload` as an object.
- Use stable IDs in `key`, such as order ID or customer ID.
- Do not publish secrets, API keys, OTP codes, OAuth tokens, raw email bodies,
  or raw SMS bodies.

## 14. Validate S3 Export

After publishing:

1. Confirm your SDK call returns `accepted: true`.
2. Ask platform to confirm API Center logged the governed publish.
3. Ask platform to confirm the Confluent topic received the message.
4. Ask platform to confirm `api-center-s3-sink` is running.
5. Ask platform to confirm the connector includes your topic.
6. Wait for connector flush.
7. Ask platform to confirm S3 objects appear under:

```text
s3://api-center-raw-data/topics/<topic-name>/...
```

One event may not immediately create an S3 object. The connector may flush by
time interval or record batch size.

## 15. Go-Live Checklist

Before production traffic:

1. `npm ci` works in CI with GitHub Packages auth.
2. Runtime uses Node.js 24.
3. Runtime has `APICENTER_URL`, `APICENTER_TRIBE_ID`, and
   `APICENTER_TRIBE_SECRET`.
4. Startup auth or first SDK call succeeds.
5. Your `consumes` list includes every target service.
6. Your token includes required target scopes.
7. Shared-service safe checks pass.
8. Tribe-to-tribe calls pass through API Center.
9. Your own service health endpoint passes through API Center.
10. Kafka publish returns `accepted: true` if S3 export is required.
11. Platform confirms S3 export after connector flush.
12. Provider credentials are not stored in your service.
13. Install-time GitHub token is not present in runtime.

## 16. Troubleshooting

### SDK Install Fails With `401`

Meaning:

```text
GitHub Packages auth is missing or invalid.
```

Fix:

1. Confirm `.npmrc` uses the lowercase scope:

```ini
@implementsprint:registry=https://npm.pkg.github.com
```

2. Confirm the token has `read:packages`.
3. Confirm the token can access the `ImplementSprint` package owner.
4. Confirm the token is exposed as the env var your npm config expects.

### SDK Install Fails With `404`

Meaning:

```text
npm cannot see the package in GitHub Packages.
```

Fix:

1. Confirm the package name is `@implementsprint/sdk`.
2. Confirm the registry is `https://npm.pkg.github.com`.
3. Confirm your GitHub account or token has package access.

### Token Request Fails With `401`

Meaning:

```text
API Center rejected your tribe ID or tribe secret.
```

Fix:

1. Check `APICENTER_TRIBE_ID`.
2. Check `APICENTER_TRIBE_SECRET`.
3. Ask platform whether the per-tribe Secret Manager hash is current.
4. Ask platform whether API Center runtime can read that secret.

### Shared-Service Or Tribe Call Fails With `403`

Meaning:

```text
API Center authenticated you but policy blocked the target call.
```

Fix:

1. Ask platform to check your manifest `consumes` list.
2. Ask platform to check your token scopes.
3. Ask platform to check target lifecycle state.

### Target Call Fails With `404`

Meaning:

```text
The target service is not registered, not visible to you, or the path is wrong.
```

Fix:

1. Use `listSharedServices()` or `listTribeServices()`.
2. Confirm the target service ID.
3. Confirm the path starts with `/`.
4. Ask platform to confirm the target manifest `exposes` list.

### Kafka Publish Fails

Meaning:

```text
API Center rejected the publish request or could not publish to Kafka.
```

Fix:

1. Confirm your token includes `external:kafka:write`.
2. Confirm the topic starts with `tribe.<your-service-id>.`.
3. Confirm you are not publishing to `api-center.*` or `__*`.
4. Confirm `payload` is an object.
5. Ask platform to check API Center Kafka readiness and audit logs.

### S3 Object Does Not Appear

Meaning:

```text
Publishing may have succeeded, but S3 export has not flushed or the connector
does not cover the topic.
```

Fix:

1. Confirm `kafkaPublish()` returned `accepted: true`.
2. Ask platform to confirm the message reached Confluent.
3. Ask platform to confirm `api-center-s3-sink` includes your topic.
4. Wait for the connector flush interval or publish enough test records.
5. Ask platform to check the S3 topic path.

# Loyalty Frontend

This is the Sprint 5 loyalty frontend package for CentralPerk.

## Setup

```powershell
Copy-Item .env.example .env.local
npm install
```

## Run

```powershell
npm run dev
```

## Build

```powershell
npm run build
npm run start
```

## Tests

Contract consumer tests:

```powershell
npm run test:contracts
```

Performance script:

```powershell
npm run test:performance:baseline
```

Never commit `.env.local`, `.env`, credentials, or service-role keys.


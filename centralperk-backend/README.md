# CentralPerk Backend

This folder contains the service-owned backend runtimes for the GREENOVATE / CentralPerk loyalty system.

Services:

- `gateway` on port `3011`
- `points-engine` on port `3017`
- `campaign-service` on port `3014`
- `member-service` on port `3012`
- `segment-service` on port `3013`
- `notification-service` on port `3015`
- `reward-service` on port `3016`

Install and build from this folder:

```powershell
npm install
npm run build
```

Run each service in its own terminal with the corresponding `start:*` script.

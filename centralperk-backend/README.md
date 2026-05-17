# CentralPerk Backend

This folder contains the service-owned backend runtimes for the GREENOVATE / CentralPerk loyalty system.

Services:

- `gateway` on port `4000`
- `points-engine` on port `4001`
- `campaign-service` on port `4002`
- `member-service` on port `4003`
- `segment-service` on port `4004`
- `notification-service` on port `4005`
- `reward-service` on port `4006`

Install and build from this folder:

```powershell
npm install
npm run build
```

Run each service in its own terminal with the corresponding `start:*` script.

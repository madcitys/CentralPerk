# k6 Observability

Use the Prometheus remote write receiver to stream k6 metrics into Grafana.

## Prometheus

Run Prometheus with remote write enabled and the config in `prometheus.yml`.

Example flags:

```bash
prometheus \
  --config.file=services/gateway/load-test/observability/prometheus.yml \
  --web.enable-remote-write-receiver
```

## k6 Output

From PowerShell, stream the gateway test into Prometheus:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\services\gateway\load-test\run-grafana-output.ps1
```

This script sets:

- `K6_PROMETHEUS_RW_SERVER_URL`
- `K6_PROMETHEUS_RW_TREND_STATS=p(95),p(99),min,max`
- `LOYALTY_K6_DURATION`

## Grafana

1. Add Prometheus as a data source pointing to your Prometheus base URL.
2. Import either:
   - the local dashboard file `services/gateway/load-test/observability/grafana-dashboard.json`, or
   - the official k6 Prometheus dashboard with ID `19718`.
3. Filter by the `testid` tag when comparing baseline runs.

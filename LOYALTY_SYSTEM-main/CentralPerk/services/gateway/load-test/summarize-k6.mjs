import fs from "fs";
import path from "path";

const summaryPath = process.argv[2];
const outputPath = process.argv[3];

if (!summaryPath) {
  throw new Error("Usage: node summarize-k6.mjs <summary.json> [output.md]");
}

const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
const metrics = summary.metrics || {};

function metricValue(metricName, field, fallback = "n/a") {
  return metrics?.[metricName]?.[field] ?? fallback;
}

function ratioMetric(metricName, fallback = "n/a") {
  const metric = metrics?.[metricName];
  if (!metric) return fallback;
  if (typeof metric.value === "number") return metric.value;
  const passes = Number(metric.passes ?? 0);
  const fails = Number(metric.fails ?? 0);
  const total = passes + fails;
  if (total <= 0) return fallback;
  return passes / total;
}

const markdown = [
  "# Loyalty k6 Baseline",
  "",
  `Generated from \`${path.basename(summaryPath)}\` on ${new Date().toISOString()}.`,
  "",
  "| Metric | Value |",
  "| --- | --- |",
  `| Iterations | ${metricValue("iterations", "count", 0)} |`,
  `| HTTP requests | ${metricValue("http_reqs", "count", 0)} |`,
  `| Error rate | ${ratioMetric("http_req_failed", 0)} |`,
  `| Checks pass rate | ${ratioMetric("checks", 0)} |`,
  `| Average response time (ms) | ${metricValue("http_req_duration", "avg", 0)} |`,
  `| P95 response time (ms) | ${metricValue("http_req_duration", "p(95)", 0)} |`,
  `| Max response time (ms) | ${metricValue("http_req_duration", "max", 0)} |`,
  "",
  "## Threshold Summary",
  "",
  `- \`http_req_failed < 0.001\`: actual ${ratioMetric("http_req_failed", 0)}`,
  `- \`checks > 0.99\`: actual ${ratioMetric("checks", 0)}`,
  `- \`award p95 < 900ms\`: actual ${metricValue("http_req_duration{scenario:award_points}", "p(95)", 0)}`,
];

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${markdown.join("\n")}\n`, "utf8");
}

console.log(markdown.join("\n"));

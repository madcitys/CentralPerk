import fs from "node:fs/promises";
import path from "node:path";

const [, , summaryPathArg = "tests/load/results/summary.json", outputPathArg = "tests/load/results/triage.md"] =
  process.argv;

const summaryPath = path.resolve(process.cwd(), summaryPathArg);
const outputPath = path.resolve(process.cwd(), outputPathArg);

const raw = await fs.readFile(summaryPath, "utf8");
const summary = JSON.parse(raw);
const metrics = summary.metrics || {};

const breaches = [];

for (const [metricName, metric] of Object.entries(metrics)) {
  const thresholds = metric?.thresholds || {};
  for (const [thresholdName, threshold] of Object.entries(thresholds)) {
    if (threshold && typeof threshold === "object" && threshold.ok === false) {
      breaches.push({
        metricName,
        thresholdName,
        actual: metric.values || {},
      });
    }
  }
}

const lines = [
  "# CentralPerk k6 Baseline Triage",
  "",
  `Generated at: ${new Date().toISOString()}`,
  "",
];

if (breaches.length === 0) {
  lines.push("No threshold breaches detected.");
} else {
  lines.push("Threshold breaches detected:");
  lines.push("");

  for (const breach of breaches) {
    lines.push(`- Metric \`${breach.metricName}\` failed threshold \`${breach.thresholdName}\`.`);
    const values = Object.entries(breach.actual)
      .map(([key, value]) => `${key}=${typeof value === "number" ? value.toFixed(3) : value}`)
      .join(", ");
    lines.push(`  Latest values: ${values || "n/a"}`);
  }

  lines.push("");
  lines.push("Suggested triage steps:");
  lines.push("- Check whether the failing flow maps to points award, redeem, campaign resolution, analytics, or notifications.");
  lines.push("- Review the deployed provider or Supabase latency for the affected endpoint.");
  lines.push("- Re-run the baseline after fixing the bottleneck to confirm the breach is cleared.");
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");
console.log(`Wrote triage report to ${outputPath}`);

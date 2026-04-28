import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createSeedState, summarizeSeedState } from "./local-runtime-seed-data.mjs";

const rootDir = process.cwd();
const runtimeDir = path.join(rootDir, ".runtime");
const runtimeFile = path.join(runtimeDir, "api-store.json");

const state = createSeedState();
const counts = summarizeSeedState(state);

await mkdir(runtimeDir, { recursive: true });
await writeFile(runtimeFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");

console.log(`Seeded local runtime data at ${runtimeFile}`);
console.log(JSON.stringify(counts, null, 2));

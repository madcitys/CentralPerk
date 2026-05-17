import { promises as fs } from "fs";
import path from "path";

export type AuditLogEntry = {
  route: string;
  method: string;
  ip: string;
  actor: string | null;
  statusCode: number;
  durationMs: number;
  createdAt: string;
  summary: Record<string, unknown>;
  idempotencyKey?: string | null;
  error?: string | null;
};

const AUDIT_DIR = path.join(process.cwd(), ".runtime");
const AUDIT_PATH = path.join(AUDIT_DIR, "api-audit.jsonl");

export async function appendAuditLog(entry: AuditLogEntry) {
  await fs.mkdir(AUDIT_DIR, { recursive: true });
  await fs.appendFile(AUDIT_PATH, `${JSON.stringify(entry)}\n`, "utf8");
}

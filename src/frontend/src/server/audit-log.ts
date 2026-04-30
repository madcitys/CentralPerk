import { promises as fs } from "fs";
import path from "path";
import { createServerSupabaseClient } from "./supabase-admin";

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

export type EventAuditLogEntry = {
  eventId: string;
  eventType: string;
  transactionReference: string;
  route: string;
  actor: string | null;
  processedAt: string;
  status: "processed" | "replayed";
  summary: Record<string, unknown>;
};

const AUDIT_DIR = path.join(process.cwd(), ".runtime");
const AUDIT_PATH = path.join(AUDIT_DIR, "api-audit.jsonl");
const EVENT_AUDIT_PATH = path.join(AUDIT_DIR, "event-audit.jsonl");

function hasServerAuditTableConfig() {
  return Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() &&
      (process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim()),
  );
}

export async function appendAuditLog(entry: AuditLogEntry) {
  await fs.mkdir(AUDIT_DIR, { recursive: true });
  await fs.appendFile(AUDIT_PATH, `${JSON.stringify(entry)}\n`, "utf8");
}

export async function appendEventAuditLog(entry: EventAuditLogEntry) {
  await fs.mkdir(AUDIT_DIR, { recursive: true });
  await fs.appendFile(EVENT_AUDIT_PATH, `${JSON.stringify(entry)}\n`, "utf8");

  if (!hasServerAuditTableConfig()) return;

  try {
    const { error } = await createServerSupabaseClient()
      .from("api_event_audit")
      .insert({
        event_id: entry.eventId,
        event_type: entry.eventType,
        transaction_reference: entry.transactionReference,
        route: entry.route,
        actor: entry.actor,
        processed_at: entry.processedAt,
        status: entry.status,
        summary: entry.summary,
      });
    if (error) throw error;
  } catch {
  }
}

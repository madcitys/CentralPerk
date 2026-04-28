import { updateApiState, withApiState, type LocalSegmentRecord } from "./local-store";
import type { SegmentPreviewCondition } from "./segment-preview";

function hasUnresolvedVariable(value: unknown) {
  return typeof value === "string" && (value.includes("{{") || value.includes("}}"));
}

function generatedSegmentId(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `SEG-${slug || "segment"}-${Date.now()}`;
}

function cleanLocalSegmentName(name: string) {
  const trimmed = String(name || "").trim().replace(/\s+/g, " ");
  const systemSegmentCandidate = trimmed
    .replace(/^(?:(?:postman|qa|gateway)\s+)+/i, "")
    .replace(/\s+local$/i, "")
    .trim();

  if (/^high\s+value$/i.test(systemSegmentCandidate)) return "High Value";
  if (/^active$/i.test(systemSegmentCandidate)) return "Active";
  if (/^at\s+risk$/i.test(systemSegmentCandidate)) return "At Risk";
  if (/^inactive$/i.test(systemSegmentCandidate)) return "Inactive";

  return systemSegmentCandidate || "Segment";
}

function cleanLocalSegmentDescription(description?: string | null) {
  const trimmed = String(description || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!trimmed) return null;
  if (/postman-created segment/i.test(trimmed)) return "Created from API.";
  if (/created by local verification/i.test(trimmed)) return "Created locally.";
  if (/created by local .*qa/i.test(trimmed)) return "Created locally.";
  if (/created from gateway/i.test(trimmed)) return "Created from API.";
  return trimmed;
}

export async function saveLocalSegment(input: {
  id?: string;
  name: string;
  description?: string | null;
  logicMode?: "AND" | "OR";
  conditions?: SegmentPreviewCondition[];
  memberIds?: string[];
}) {
  return updateApiState((state) => {
    const cleanName = cleanLocalSegmentName(input.name);
    const normalizedName = cleanName.toLowerCase();
    const existingByName = Object.values(state.segments).find(
      (segment) => cleanLocalSegmentName(segment.name).toLowerCase() === normalizedName,
    );
    const id = input.id && !hasUnresolvedVariable(input.id) ? input.id : existingByName?.id || generatedSegmentId(cleanName);
    const existing = state.segments[id];
    const now = new Date().toISOString();
    const segment: LocalSegmentRecord = {
      id,
      name: cleanName,
      description: cleanLocalSegmentDescription(input.description),
      is_system: false,
      created_at: existing?.created_at || now,
      updated_at: now,
      logicMode: input.logicMode,
      conditions: input.conditions,
      memberIds: input.memberIds ?? existing?.memberIds ?? [],
    };
    state.segments[id] = segment;
    return segment;
  });
}

export async function listLocalSegments() {
  return withApiState((state) => {
    const byName = new Map<string, LocalSegmentRecord>();
    for (const segment of Object.values(state.segments)) {
      if (hasUnresolvedVariable(segment.id)) continue;
      const name = cleanLocalSegmentName(segment.name);
      const key = name.toLowerCase();
      const existing = byName.get(key);
      const normalized = { ...segment, name, description: cleanLocalSegmentDescription(segment.description) };
      if (!existing) {
        byName.set(key, normalized);
        continue;
      }
      byName.set(key, {
        ...existing,
        description: existing.description ?? normalized.description ?? null,
        updated_at: existing.updated_at > normalized.updated_at ? existing.updated_at : normalized.updated_at,
        memberIds: Array.from(new Set([...(existing.memberIds || []), ...(normalized.memberIds || [])])),
      });
    }
    return Array.from(byName.values()).sort((left, right) => left.name.localeCompare(right.name));
  });
}

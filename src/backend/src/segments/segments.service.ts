import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { LocalRuntimeService, type PointMemberRecord } from "../local-runtime/local-runtime.service";
import { PointsService } from "../points/points.service";
import { hasTemplateToken, nowIso, numberValue } from "../common/utils";

type SegmentCondition = {
  id?: string;
  field: string;
  operator: string;
  value: string;
};

const READ_CACHE_TTL_MS = 5_000;

type SegmentRecord = {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
  logicMode: "AND" | "OR";
  conditions: SegmentCondition[];
  memberIds: string[];
};

type SegmentPreview = {
  count: number;
  memberIds: string[];
  sampleMembers: PointMemberRecord[];
  logicMode: "AND" | "OR";
  conditions: SegmentCondition[];
};

@Injectable()
export class SegmentsService {
  private listCache: { loadedAt: number; value: SegmentRecord[] } | null = null;
  private previewCache = new Map<string, { loadedAt: number; value: SegmentPreview }>();

  constructor(
    private readonly runtime: LocalRuntimeService,
    private readonly points: PointsService,
  ) {}

  private isFresh(loadedAt: number) {
    return Date.now() - loadedAt < READ_CACHE_TTL_MS;
  }

  private clearReadCaches() {
    this.listCache = null;
    this.previewCache.clear();
  }

  private slug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  }

  private normalizeCondition(condition: Record<string, unknown>, index: number): SegmentCondition {
    const field = String(condition.field || "Tier").trim();
    const operator = String(condition.operator || "is").trim();
    const value = String(condition.value || "").trim();
    return {
      id: String(condition.id || `${field}-${operator}-${value || index}`).toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      field,
      operator,
      value,
    };
  }

  private normalize(input: Record<string, unknown>): SegmentRecord {
    const name = String(input.name || "Segment").trim();
    const conditions = Array.isArray(input.conditions)
      ? input.conditions.map((condition, index) => this.normalizeCondition(condition as Record<string, unknown>, index))
      : [];
    return {
      id: String(input.id || `SEG-${this.slug(name) || "segment"}-${Date.now()}`),
      name,
      description: input.description ? String(input.description) : null,
      is_system: Boolean(input.is_system ?? false),
      created_at: String(input.created_at || nowIso()),
      updated_at: String(input.updated_at || nowIso()),
      logicMode: String(input.logicMode || input.logic_mode || "AND").toUpperCase() === "OR" ? "OR" : "AND",
      conditions,
      memberIds: Array.isArray(input.memberIds) ? input.memberIds.map(String) : [],
    };
  }

  private matches(member: { memberId: string; pointsBalance: number; tier: string; history: unknown[] }, condition: SegmentCondition) {
    const field = condition.field.toLowerCase();
    const operator = condition.operator.toLowerCase();
    const value = condition.value.toLowerCase();
    if (field.includes("tier")) {
      return operator.includes("not")
        ? member.tier.toLowerCase() !== value
        : member.tier.toLowerCase() === value;
    }
    if (field.includes("point") || field.includes("spend")) {
      const target = numberValue(condition.value, 0);
      if (operator.includes("greater") || operator.includes("above") || operator === ">=") return member.pointsBalance >= target;
      if (operator.includes("less") || operator.includes("below") || operator === "<=") return member.pointsBalance <= target;
      return member.pointsBalance === target;
    }
    return true;
  }

  async preview(input: Record<string, unknown>): Promise<SegmentPreview> {
    const conditions = Array.isArray(input.conditions)
      ? input.conditions.map((condition, index) => this.normalizeCondition(condition as Record<string, unknown>, index))
      : [];
    const logicMode: SegmentPreview["logicMode"] = String(input.logicMode || "AND").toUpperCase() === "OR" ? "OR" : "AND";
    const cacheKey = JSON.stringify({ logicMode, conditions });
    const cached = this.previewCache.get(cacheKey);
    if (cached && this.isFresh(cached.loadedAt)) {
      return cached.value;
    }

    const members = await this.points.snapshot();
    const matched = members.filter((member) => {
      if (conditions.length === 0) return true;
      const checks = conditions.map((condition) => this.matches(member, condition));
      return logicMode === "OR" ? checks.some(Boolean) : checks.every(Boolean);
    });
    const value = {
      count: matched.length,
      memberIds: matched.map((member) => member.memberId),
      sampleMembers: matched.slice(0, 10),
      logicMode,
      conditions,
    };
    this.previewCache.set(cacheKey, { loadedAt: Date.now(), value });
    return value;
  }

  async create(input: Record<string, unknown>) {
    const name = String(input.name || "").trim();
    if (!name) throw new BadRequestException("Segment name is required.");
    const preview = await this.preview(input);
    return this.runtime.update((state) => {
      const existing = Object.values(state.segments).find(
        (segment) => String(segment.name || "").toLowerCase() === name.toLowerCase(),
      );
      const segment = this.normalize({
        ...existing,
        ...input,
        id: existing?.id || input.id,
        memberIds: preview.memberIds,
      });
      state.segments[String(segment.id)] = segment;
      this.clearReadCaches();
      return segment;
    });
  }

  async list(): Promise<SegmentRecord[]> {
    if (this.listCache && this.isFresh(this.listCache.loadedAt)) {
      return this.listCache.value;
    }

    const state = await this.runtime.read();
    const value = Object.values(state.segments)
      .filter((segment) => !hasTemplateToken(segment.id))
      .map((segment) => this.normalize(segment))
      .sort((left, right) => left.name.localeCompare(right.name));
    this.listCache = { loadedAt: Date.now(), value };
    return value;
  }

  async update(id: string, patch: Record<string, unknown>) {
    return this.runtime.update((state) => {
      const existing = state.segments[id];
      if (!existing) throw new NotFoundException("Segment not found.");
      const segment = this.normalize({ ...existing, ...patch, id, updated_at: nowIso() });
      state.segments[id] = segment;
      this.clearReadCaches();
      return segment;
    });
  }

  async remove(id: string) {
    return this.runtime.update((state) => {
      if (!state.segments[id]) throw new NotFoundException("Segment not found.");
      delete state.segments[id];
      this.clearReadCaches();
      return { deleted: true };
    });
  }
}

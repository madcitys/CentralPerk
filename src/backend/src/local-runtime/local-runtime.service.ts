import { Injectable } from "@nestjs/common";
import { promises as fs } from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { ApiConfigService } from "../config/api-config.service";

export type PointHistoryRecord = {
  id: string;
  type: string;
  points: number;
  reason: string;
  date: string;
  expiry_date: string | null;
  reference: string | null;
};

export type PointMemberRecord = {
  memberId: string;
  memberNumber?: string;
  email: string | null;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  birthdate?: string | null;
  enrollmentDate?: string | null;
  profileImage?: string | null;
  status?: "Active" | "Inactive";
  pointsBalance: number;
  tier: string;
  history: PointHistoryRecord[];
};

export type LocalState = {
  idempotency: Record<string, unknown>;
  partners: Record<string, Record<string, unknown>>;
  rewards: Record<string, Record<string, unknown>>;
  partnerTransactions: Array<Record<string, unknown>>;
  partnerSettlements: Array<Record<string, unknown>>;
  pointMembers: Record<string, PointMemberRecord>;
  campaigns: Record<string, Record<string, unknown>>;
  segments: Record<string, Record<string, unknown>>;
  notifications: Array<Record<string, unknown>>;
  communicationPreferences: Record<string, Record<string, unknown>>;
} & Record<string, unknown>;

type SeedModule = {
  createSeedState: () => LocalState;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mergeById(
  seeded: Array<Record<string, unknown>>,
  current: Array<Record<string, unknown>>,
  sortField = "createdAt",
) {
  const byId = new Map<string, Record<string, unknown>>();

  for (const row of seeded) {
    const id = String(row.id || "");
    if (!id) continue;
    byId.set(id, clone(row));
  }

  for (const row of current) {
    const id = String(row.id || "");
    if (!id) continue;
    byId.set(id, { ...(byId.get(id) || {}), ...row });
  }

  return Array.from(byId.values()).sort((left, right) =>
    String(right[sortField] || right.updatedAt || "").localeCompare(
      String(left[sortField] || left.updatedAt || ""),
    ),
  );
}

function mergeSeedState(value: Partial<LocalState> | null, seed: LocalState): LocalState {
  const next: LocalState = {
    ...clone(seed),
    ...(value ?? {}),
    idempotency: value?.idempotency ?? {},
    partners: { ...clone(seed.partners), ...(value?.partners ?? {}) },
    rewards: { ...clone(seed.rewards), ...(value?.rewards ?? {}) },
    partnerTransactions: mergeById(seed.partnerTransactions, Array.isArray(value?.partnerTransactions) ? value.partnerTransactions : []),
    partnerSettlements: mergeById(
      seed.partnerSettlements,
      Array.isArray(value?.partnerSettlements) ? value.partnerSettlements : [],
      "updatedAt",
    ),
    pointMembers: { ...clone(seed.pointMembers), ...(value?.pointMembers ?? {}) },
    campaigns: { ...clone(seed.campaigns), ...(value?.campaigns ?? {}) },
    segments: { ...clone(seed.segments), ...(value?.segments ?? {}) },
    notifications: mergeById(seed.notifications, Array.isArray(value?.notifications) ? value.notifications : []),
    communicationPreferences: {
      ...clone(seed.communicationPreferences),
      ...(value?.communicationPreferences ?? {}),
    },
  };

  for (const member of Object.values(next.pointMembers)) {
    member.history = Array.isArray(member.history) ? member.history.slice(0, 300) : [];
  }

  return next;
}

@Injectable()
export class LocalRuntimeService {
  private cache: { loadedAt: number; value: LocalState } | null = null;
  private seedCache: LocalState | null = null;
  private writeChain = Promise.resolve();

  constructor(private readonly config: ApiConfigService) {}

  private get storePath() {
    return this.config.localRuntimeStorePath;
  }

  private get seedModulePath() {
    const candidates = [
      path.resolve(process.cwd(), "../../scripts/local-runtime-seed-data.mjs"),
      path.resolve(process.cwd(), "../scripts/local-runtime-seed-data.mjs"),
      path.resolve(process.cwd(), "scripts/local-runtime-seed-data.mjs"),
    ];
    return candidates[0];
  }

  private async ensureDir() {
    await fs.mkdir(path.dirname(this.storePath), { recursive: true });
  }

  private async loadSeedState() {
    if (this.seedCache) return clone(this.seedCache);
    let seedPath = this.seedModulePath;
    for (const candidate of [
      path.resolve(process.cwd(), "../../scripts/local-runtime-seed-data.mjs"),
      path.resolve(process.cwd(), "../scripts/local-runtime-seed-data.mjs"),
      path.resolve(process.cwd(), "scripts/local-runtime-seed-data.mjs"),
    ]) {
      try {
        await fs.access(candidate);
        seedPath = candidate;
        break;
      } catch {
      }
    }
    const module = (await new Function("specifier", "return import(specifier)")(pathToFileURL(seedPath).href)) as SeedModule;
    const value = module.createSeedState();
    this.seedCache = clone(value);
    return clone(value);
  }

  async read(): Promise<LocalState> {
    if (this.cache && Date.now() - this.cache.loadedAt < 5000) {
      return this.cache.value;
    }

    await this.ensureDir();
    const seed = await this.loadSeedState();
    try {
      const parsed = JSON.parse(await fs.readFile(this.storePath, "utf8")) as Partial<LocalState>;
      const value = mergeSeedState(parsed, seed);
      this.cache = { loadedAt: Date.now(), value };
      return value;
    } catch {
      const value = clone(seed);
      this.cache = { loadedAt: Date.now(), value };
      return value;
    }
  }

  async snapshotPoints() {
    const state = await this.read();
    return Object.values(state.pointMembers || {}).sort((left, right) =>
      String(left.memberId || "").localeCompare(String(right.memberId || "")),
    );
  }

  async writeSeedFile() {
    const value = await this.loadSeedState();
    await this.ensureDir();
    await fs.writeFile(this.storePath, JSON.stringify(value, null, 2), "utf8");
    this.cache = { loadedAt: Date.now(), value };
    return value;
  }

  async update<T>(updater: (state: LocalState) => T | Promise<T>): Promise<T> {
    let result!: T;
    this.writeChain = this.writeChain.then(async () => {
      const state = await this.read();
      result = await updater(state);
      for (const member of Object.values(state.pointMembers)) {
        member.history = (member.history || []).slice(0, 300);
      }
      await this.ensureDir();
      await fs.writeFile(this.storePath, JSON.stringify(state, null, 2), "utf8");
      this.cache = { loadedAt: Date.now(), value: state };
    });
    await this.writeChain;
    return result;
  }
}

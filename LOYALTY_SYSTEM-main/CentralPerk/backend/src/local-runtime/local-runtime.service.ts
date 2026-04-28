import { Injectable } from "@nestjs/common";
import { promises as fs } from "fs";
import path from "path";
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
  email: string | null;
  pointsBalance: number;
  tier: string;
  history: PointHistoryRecord[];
};

export type LocalState = {
  idempotency: Record<string, unknown>;
  partnerTransactions: Array<Record<string, unknown>>;
  partnerSettlements: Array<Record<string, unknown>>;
  pointMembers: Record<string, PointMemberRecord>;
  campaigns: Record<string, Record<string, unknown>>;
  segments: Record<string, Record<string, unknown>>;
  notifications: Array<Record<string, unknown>>;
  communicationPreferences: Record<string, Record<string, unknown>>;
} & Record<string, unknown>;

const defaultState: LocalState = {
  idempotency: {},
  partnerTransactions: [],
  partnerSettlements: [],
  pointMembers: {
    "MEM-000011": {
      memberId: "MEM-000011",
      email: "soundwave@example.com",
      pointsBalance: 625,
      tier: "Silver",
      history: [],
    },
  },
  campaigns: {},
  segments: {},
  notifications: [],
  communicationPreferences: {},
};

@Injectable()
export class LocalRuntimeService {
  private cache: { loadedAt: number; value: LocalState } | null = null;
  private writeChain = Promise.resolve();

  constructor(private readonly config: ApiConfigService) {}

  private get storePath() {
    return this.config.localRuntimeStorePath;
  }

  private async ensureDir() {
    await fs.mkdir(path.dirname(this.storePath), { recursive: true });
  }

  private normalizeState(value: Partial<LocalState> | null): LocalState {
    return {
      ...(value ?? {}),
      idempotency: value?.idempotency ?? {},
      partnerTransactions: value?.partnerTransactions ?? [],
      partnerSettlements: value?.partnerSettlements ?? [],
      pointMembers: value?.pointMembers ?? defaultState.pointMembers,
      campaigns: value?.campaigns ?? {},
      segments: value?.segments ?? {},
      notifications: value?.notifications ?? [],
      communicationPreferences: value?.communicationPreferences ?? {},
    };
  }

  async read(): Promise<LocalState> {
    if (this.cache && Date.now() - this.cache.loadedAt < 250) {
      return this.cache.value;
    }
    await this.ensureDir();
    try {
      const parsed = JSON.parse(await fs.readFile(this.storePath, "utf8")) as Partial<LocalState>;
      const value = this.normalizeState(parsed);
      this.cache = { loadedAt: Date.now(), value };
      return value;
    } catch {
      const value = this.normalizeState(defaultState);
      this.cache = { loadedAt: Date.now(), value };
      return value;
    }
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
      await fs.writeFile(this.storePath, JSON.stringify(state), "utf8");
      this.cache = { loadedAt: Date.now(), value: state };
    });
    await this.writeChain;
    return result;
  }
}

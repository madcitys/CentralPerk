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
  receipt_id?: string | null;
  amount_spent?: number | null;
  product_category?: string | null;
  product_code?: string | null;
  notes?: string | null;
};

export type PointMemberRecord = {
  memberId: string;
  email: string | null;
  pointsBalance: number;
  tier: string;
  history: PointHistoryRecord[];
};

export type MemberRecord = {
  id: string;
  memberId: string;
  memberNumber: string;
  name: string;
  email: string;
  mobile: string;
  memberSince: string;
  tier: string;
  points: number;
  lifetimePoints: number;
  segment: string;
  status: "Active" | "Inactive";
  profileImage?: string | null;
  birthdate?: string | null;
  address?: string | null;
  surveysCompleted?: number;
};

export type PurchaseRecord = {
  id: string;
  memberId: string;
  receiptReference: string;
  amount: number;
  date: string;
  category: string;
  notes: string | null;
  pointsAwarded: number;
  createdAt: string;
};

export type TaskRecord = {
  id: string;
  title: string;
  description: string;
  type: "survey" | "task";
  status: "available" | "inactive";
  points: number;
  oncePerMember: boolean;
  requiredFields: string[];
};

export type TaskProgressRecord = {
  taskId: string;
  memberId: string;
  status: "available" | "in_progress" | "completed" | "already_claimed";
  startedAt?: string | null;
  submittedAt?: string | null;
  answers?: Record<string, string>;
};

export type ReferralRecord = {
  id: string;
  memberId: string;
  referralCode: string;
  recipientEmail: string;
  referralLink: string;
  status: "pending" | "joined" | "duplicate";
  createdAt: string;
};

export type TierRuleRecord = {
  tier_label: string;
  min_points: number;
  is_active: boolean;
};

export type EarningRuleRecord = {
  tier_label: string;
  peso_per_point: number;
  multiplier: number;
  is_active: boolean;
};

export type LocalState = {
  idempotency: Record<string, unknown>;
  partnerTransactions: Array<Record<string, unknown>>;
  partnerSettlements: Array<Record<string, unknown>>;
  pointMembers: Record<string, PointMemberRecord>;
  members: Record<string, MemberRecord>;
  purchases: PurchaseRecord[];
  tasks: TaskRecord[];
  taskProgress: TaskProgressRecord[];
  referrals: ReferralRecord[];
  campaigns: Record<string, Record<string, unknown>>;
  segments: Record<string, Record<string, unknown>>;
  notifications: Array<Record<string, unknown>>;
  communicationPreferences: Record<string, Record<string, unknown>>;
  tierRules: TierRuleRecord[];
  earningRules: EarningRuleRecord[];
  rewards: Array<Record<string, unknown>>;
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
    "MEM-000008": {
      memberId: "MEM-000008",
      email: "test3@gmail.com",
      pointsBalance: 200,
      tier: "Bronze",
      history: [],
    },
  },
  members: {
    "MEM-000011": {
      id: "MEM-000011",
      memberId: "MEM-000011",
      memberNumber: "MEM-000011",
      name: "Sound Wave",
      email: "soundwave@example.com",
      mobile: "+639195555786",
      memberSince: "2026-04-01T00:00:00.000Z",
      tier: "Silver",
      points: 625,
      lifetimePoints: 625,
      segment: "High Value",
      status: "Active",
      surveysCompleted: 0,
    },
    "MEM-000008": {
      id: "MEM-000008",
      memberId: "MEM-000008",
      memberNumber: "MEM-000008",
      name: "Test Three",
      email: "test3@gmail.com",
      mobile: "+639123412312",
      memberSince: "2026-04-03T00:00:00.000Z",
      tier: "Bronze",
      points: 200,
      lifetimePoints: 200,
      segment: "Active",
      status: "Active",
      surveysCompleted: 0,
    },
  },
  purchases: [],
  tasks: [
    {
      id: "survey-feedback",
      title: "Customer Experience Survey",
      description: "Answer the quick survey to unlock bonus points.",
      type: "survey",
      status: "available",
      points: 50,
      oncePerMember: true,
      requiredFields: ["rating", "feedback"],
    },
    {
      id: "app-profile-check",
      title: "Profile Review",
      description: "Review your profile details once per member account.",
      type: "task",
      status: "available",
      points: 25,
      oncePerMember: true,
      requiredFields: ["confirmation"],
    },
  ],
  taskProgress: [],
  referrals: [],
  campaigns: {},
  segments: {},
  notifications: [],
  communicationPreferences: {},
  tierRules: [
    { tier_label: "Platinum", min_points: 1500, is_active: true },
    { tier_label: "Gold", min_points: 750, is_active: true },
    { tier_label: "Silver", min_points: 250, is_active: true },
    { tier_label: "Bronze", min_points: 0, is_active: true },
  ],
  earningRules: [
    { tier_label: "Bronze", peso_per_point: 10, multiplier: 1, is_active: true },
    { tier_label: "Silver", peso_per_point: 10, multiplier: 1.25, is_active: true },
    { tier_label: "Gold", peso_per_point: 10, multiplier: 1.5, is_active: true },
    { tier_label: "Platinum", peso_per_point: 10, multiplier: 2, is_active: true },
  ],
  rewards: [
    {
      id: "REWARD-001",
      reward_id: "REWARD-001",
      name: "Free Pastry",
      description: "Choose from croissant, muffin, or danish.",
      points_cost: 150,
      category: "food",
      is_active: true,
    },
    {
      id: "REWARD-002",
      reward_id: "REWARD-002",
      name: "Free Regular Coffee",
      description: "Any regular-sized hot or iced coffee.",
      points_cost: 120,
      category: "beverage",
      is_active: true,
    },
    {
      id: "REWARD-003",
      reward_id: "REWARD-003",
      name: "Free Large Specialty Drink",
      description: "Any large-sized specialty beverage.",
      points_cost: 280,
      category: "beverage",
      is_active: true,
    },
  ],
};

const READ_CACHE_TTL_MS = 5_000;

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
      members: value?.members ?? defaultState.members,
      purchases: value?.purchases ?? [],
      tasks: value?.tasks ?? defaultState.tasks,
      taskProgress: value?.taskProgress ?? [],
      referrals: value?.referrals ?? [],
      campaigns: value?.campaigns ?? {},
      segments: value?.segments ?? {},
      notifications: value?.notifications ?? [],
      communicationPreferences: value?.communicationPreferences ?? {},
      tierRules: value?.tierRules ?? defaultState.tierRules,
      earningRules: value?.earningRules ?? defaultState.earningRules,
      rewards: value?.rewards ?? defaultState.rewards,
    };
  }

  async read(): Promise<LocalState> {
    if (this.cache && Date.now() - this.cache.loadedAt < READ_CACHE_TTL_MS) {
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
    const operation = this.writeChain.catch(() => undefined).then(async () => {
      const state = await this.read();
      const result = await updater(state);
      for (const member of Object.values(state.pointMembers)) {
        member.history = (member.history || []).slice(0, 300);
      }
      await this.ensureDir();
      await fs.writeFile(this.storePath, JSON.stringify(state), "utf8");
      this.cache = { loadedAt: Date.now(), value: state };
      return result;
    });

    this.writeChain = operation.then(
      () => undefined,
      () => undefined,
    );

    return operation;
  }
}

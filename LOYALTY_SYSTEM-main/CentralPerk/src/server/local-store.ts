import { promises as fs } from "fs";
import path from "path";

export type StoredIdempotentResponse = {
  key: string;
  route: string;
  requestHash: string;
  statusCode: number;
  body: unknown;
  createdAt: string;
};

export type PartnerTransactionRecord = {
  id: string;
  partnerId: string;
  partnerCode: string;
  partnerName: string;
  memberId: string;
  memberEmail: string | null;
  orderId: string;
  points: number;
  grossAmount: number;
  note: string;
  occurredAt: string;
  settlementId: string | null;
  settledAt: string | null;
};

export type PartnerSettlementRecord = {
  id: string;
  partnerId: string;
  partnerCode: string;
  partnerName: string;
  month: string;
  totalTransactions: number;
  totalPoints: number;
  totalGrossAmount: number;
  commissionRate: number;
  commissionAmount: number;
  createdAt: string;
  status: "generated" | "paid";
  paidAt: string | null;
  transactionIds: string[];
};

export type LocalPointTransactionRecord = {
  id: string;
  type: string;
  points: number;
  reason: string;
  date: string;
  expiry_date: string | null;
  reference: string | null;
};

export type LocalPointMemberRecord = {
  memberId: string;
  email: string | null;
  pointsBalance: number;
  tier: string;
  history: LocalPointTransactionRecord[];
};

export type LocalCampaignRecord = Record<string, any> & {
  id: string;
  campaignCode: string;
  campaignName: string;
  status: string;
  budgetSpent?: number;
  createdAt: string;
  publishedAt?: string | null;
};

export type LocalSegmentRecord = {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
  logicMode?: "AND" | "OR";
  conditions?: Array<{
    id: string;
    field: "Tier" | "Last Activity" | "Points Balance";
    operator: string;
    value: string;
  }>;
  memberIds?: string[];
};

export type LocalNotificationRecord = {
  id: string;
  memberId: string | null;
  channel: "sms" | "email" | "push";
  subject: string;
  message: string;
  status: "pending" | "read";
  isPromotional: boolean;
  scheduledFor: string | null;
  createdAt: string;
};

export type LocalCommunicationPreferenceRecord = {
  sms: boolean;
  email: boolean;
  push: boolean;
  promotionalOptIn: boolean;
  frequency: "daily" | "weekly" | "never";
};

type ApiState = {
  idempotency: Record<string, StoredIdempotentResponse>;
  partnerTransactions: PartnerTransactionRecord[];
  partnerSettlements: PartnerSettlementRecord[];
  pointMembers: Record<string, LocalPointMemberRecord>;
  campaigns: Record<string, LocalCampaignRecord>;
  segments: Record<string, LocalSegmentRecord>;
  notifications: LocalNotificationRecord[];
  communicationPreferences: Record<string, LocalCommunicationPreferenceRecord>;
};

const STORE_DIR = path.join(process.cwd(), ".runtime");
const STORE_PATH = path.join(STORE_DIR, "api-store.json");

const DEFAULT_STATE: ApiState = {
  idempotency: {},
  partnerTransactions: [],
  partnerSettlements: [],
  pointMembers: {},
  campaigns: {},
  segments: {},
  notifications: [],
  communicationPreferences: {},
};

let stateCache: ApiState | null = null;

function pruneApiState(state: ApiState) {
  for (const member of Object.values(state.pointMembers)) {
    member.history = member.history
      .slice()
      .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
      .slice(0, 300);
  }

  const idempotencyEntries = Object.entries(state.idempotency);
  if (idempotencyEntries.length > 800) {
    state.idempotency = Object.fromEntries(
      idempotencyEntries
        .sort(([, left], [, right]) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        .slice(0, 800),
    );
  }
}

async function ensureStoreDir() {
  await fs.mkdir(STORE_DIR, { recursive: true });
}

export async function readApiState(): Promise<ApiState> {
  await ensureStoreDir();

  if (stateCache) return stateCache;

  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<ApiState>;
    stateCache = {
      idempotency: parsed.idempotency ?? {},
      partnerTransactions: parsed.partnerTransactions ?? [],
      partnerSettlements: (parsed.partnerSettlements ?? []).map((settlement) => ({
        ...settlement,
        month: settlement.month ?? String(settlement.createdAt ?? new Date().toISOString()).slice(0, 7),
        status: settlement.status ?? "generated",
        paidAt: settlement.paidAt ?? null,
      })),
      pointMembers: parsed.pointMembers ?? {},
      campaigns: parsed.campaigns ?? {},
      segments: parsed.segments ?? {},
      notifications: parsed.notifications ?? [],
      communicationPreferences: parsed.communicationPreferences ?? {},
    };
    return stateCache;
  } catch {
    stateCache = {
      idempotency: {},
      partnerTransactions: [],
      partnerSettlements: [],
      pointMembers: {},
      campaigns: {},
      segments: {},
      notifications: [],
      communicationPreferences: {},
    };
    return stateCache;
  }
}

async function writeApiState(state: ApiState) {
  await ensureStoreDir();
  pruneApiState(state);
  stateCache = state;
  await fs.writeFile(STORE_PATH, JSON.stringify(state), "utf8");
}

export async function updateApiState<T>(updater: (state: ApiState) => T | Promise<T>): Promise<T> {
  const state = await readApiState();
  const result = await updater(state);
  await writeApiState(state);
  return result;
}

export async function withApiState<T>(reader: (state: ApiState) => T | Promise<T>): Promise<T> {
  const state = await readApiState();
  return reader(state);
}

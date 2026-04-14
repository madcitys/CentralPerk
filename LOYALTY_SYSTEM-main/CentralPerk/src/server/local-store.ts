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
  totalTransactions: number;
  totalPoints: number;
  totalGrossAmount: number;
  commissionRate: number;
  commissionAmount: number;
  createdAt: string;
  transactionIds: string[];
};

type ApiState = {
  idempotency: Record<string, StoredIdempotentResponse>;
  partnerTransactions: PartnerTransactionRecord[];
  partnerSettlements: PartnerSettlementRecord[];
};

const STORE_DIR = path.join(process.cwd(), ".runtime");
const STORE_PATH = path.join(STORE_DIR, "api-store.json");

const DEFAULT_STATE: ApiState = {
  idempotency: {},
  partnerTransactions: [],
  partnerSettlements: [],
};

async function ensureStoreDir() {
  await fs.mkdir(STORE_DIR, { recursive: true });
}

export async function readApiState(): Promise<ApiState> {
  await ensureStoreDir();

  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<ApiState>;
    return {
      idempotency: parsed.idempotency ?? {},
      partnerTransactions: parsed.partnerTransactions ?? [],
      partnerSettlements: parsed.partnerSettlements ?? [],
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function writeApiState(state: ApiState) {
  await ensureStoreDir();
  await fs.writeFile(STORE_PATH, JSON.stringify(state, null, 2), "utf8");
}

export async function updateApiState<T>(updater: (state: ApiState) => T | Promise<T>): Promise<T> {
  const state = await readApiState();
  const result = await updater(state);
  await writeApiState(state);
  return result;
}

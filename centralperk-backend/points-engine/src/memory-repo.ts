import type { PointsRepository } from "./core/repo.js";
import type { AwardInput, ExpiryResult, LedgerEntry, Member, RedeemInput, SupportedTier, TierRule } from "./core/types.js";
import { resolveTier } from "./core/utils.js";

type SeedMemberInput = {
  memberIdentifier: string;
  fallbackEmail?: string;
  pointsBalance?: number;
  tier?: SupportedTier;
};

type SeedLedgerInput = {
  memberIdentifier: string;
  fallbackEmail?: string;
  changeType: LedgerEntry["change_type"];
  pointsDelta: number;
  reason?: string | null;
  expiryDate?: string | null;
  createdAt?: string;
};

type StoredLedgerEntry = LedgerEntry & {
  remaining_points?: number;
  expired?: boolean;
};

const defaultTierRules: TierRule[] = [
  { tier_label: "Gold", min_points: 750, is_active: true },
  { tier_label: "Silver", min_points: 250, is_active: true },
  { tier_label: "Bronze", min_points: 0, is_active: true },
];

const membersById = new Map<number, Member>();
const memberKeys = new Map<string, number>();
const ledgerEntries: StoredLedgerEntry[] = [];
let activeTierRules = defaultTierRules.map((rule) => ({ ...rule }));
let nextMemberId = 1;
let nextLedgerId = 1;

function normalizeKey(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function linkMemberKeys(member: Member) {
  const candidates = [member.member_number, member.email, String(member.id)];
  for (const candidate of candidates) {
    const key = normalizeKey(candidate);
    if (key) memberKeys.set(key, member.id);
  }
}

function createMember(identifier: string, fallbackEmail?: string, pointsBalance = 0, tier: SupportedTier = "Bronze") {
  const member: Member = {
    id: nextMemberId++,
    member_number: identifier.trim() || `LOCAL-${nextMemberId}`,
    email: fallbackEmail ?? null,
    points_balance: Math.max(0, Math.floor(pointsBalance)),
    tier,
  };
  membersById.set(member.id, member);
  linkMemberKeys(member);
  return member;
}

function getOrCreateMember(identifier: string, fallbackEmail?: string) {
  const keys = [normalizeKey(identifier), normalizeKey(fallbackEmail)];
  for (const key of keys) {
    if (!key) continue;
    const memberId = memberKeys.get(key);
    if (memberId) {
      const member = membersById.get(memberId);
      if (member) return member;
    }
  }
  return createMember(identifier, fallbackEmail);
}

function updateMember(member: Member, balance: number, tier: string) {
  member.points_balance = Math.max(0, Math.floor(balance));
  member.tier = tier as SupportedTier;
  membersById.set(member.id, member);
  linkMemberKeys(member);
}

function createLedgerEntry(
  member: Member,
  changeType: LedgerEntry["change_type"],
  pointsDelta: number,
  reason?: string | null,
  expiryDate?: string | null
) {
  const entry: StoredLedgerEntry = {
    id: nextLedgerId++,
    member_id: member.id,
    change_type: changeType,
    points_delta: pointsDelta,
    balance_after: member.points_balance,
    reason,
    expiry_date: expiryDate ?? null,
    created_at: new Date().toISOString(),
    remaining_points: pointsDelta > 0 ? pointsDelta : undefined,
    expired: false,
  };
  ledgerEntries.push(entry);
  return entry;
}

function cloneLedgerEntry(entry: StoredLedgerEntry): LedgerEntry {
  const { remaining_points: _remaining, expired: _expired, ...rest } = entry;
  return { ...rest };
}

export const memoryRepo: PointsRepository = {
  async findMember(identifier: string, fallbackEmail?: string) {
    return getOrCreateMember(identifier, fallbackEmail);
  },
  async fetchTierRules() {
    return activeTierRules.map((rule) => ({ ...rule }));
  },
  async saveTierRules(rules: TierRule[]) {
    activeTierRules = rules.map((rule) => ({ ...rule }));
  },
  async insertAward(member: Member, input: AwardInput, newBalance: number, newTier: string) {
    updateMember(member, newBalance, newTier);
    const entry = createLedgerEntry(
      member,
      input.transactionType,
      Math.max(0, Math.floor(input.points)),
      input.reason,
      input.transactionType === "PURCHASE"
        ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        : null
    );
    return cloneLedgerEntry(entry);
  },
  async insertRedemption(member: Member, input: RedeemInput, newBalance: number, newTier: string) {
    updateMember(member, newBalance, newTier);
    const entry = createLedgerEntry(
      member,
      input.transactionType ?? "REDEEM",
      -Math.abs(Math.floor(input.points)),
      input.reason,
      null
    );
    return cloneLedgerEntry(entry);
  },
  async runExpiryJob(): Promise<ExpiryResult> {
    const now = Date.now();
    let pointsExpired = 0;
    let membersProcessed = 0;
    const processed = new Set<number>();

    for (const entry of ledgerEntries) {
      const remaining = Number(entry.remaining_points ?? 0);
      if (remaining <= 0 || entry.expired || !entry.expiry_date) continue;
      if (new Date(entry.expiry_date).getTime() > now) continue;

      const member = membersById.get(entry.member_id);
      if (!member) continue;

      const expiringPoints = Math.min(remaining, member.points_balance);
      if (expiringPoints <= 0) {
        entry.expired = true;
        entry.remaining_points = 0;
        continue;
      }

      processed.add(member.id);
      pointsExpired += expiringPoints;
      entry.expired = true;
      entry.remaining_points = Math.max(0, remaining - expiringPoints);

      const newBalance = Math.max(0, member.points_balance - expiringPoints);
      const newTier = resolveTier(newBalance, activeTierRules);
      updateMember(member, newBalance, newTier);
      createLedgerEntry(member, "EXPIRY_DEDUCTION", -expiringPoints, "Nightly expiry run", null);
    }

    membersProcessed = processed.size;
    return { membersProcessed, pointsExpired };
  },
};

export function resetMemoryStore() {
  membersById.clear();
  memberKeys.clear();
  ledgerEntries.length = 0;
  activeTierRules = defaultTierRules.map((rule) => ({ ...rule }));
  nextMemberId = 1;
  nextLedgerId = 1;
}

export function seedMemoryMember(input: SeedMemberInput) {
  const member = createMember(
    input.memberIdentifier,
    input.fallbackEmail,
    input.pointsBalance ?? 0,
    input.tier ?? resolveTier(input.pointsBalance ?? 0, activeTierRules)
  );
  return { ...member };
}

export function seedMemoryLedgerEntry(input: SeedLedgerInput) {
  const member = getOrCreateMember(input.memberIdentifier, input.fallbackEmail);
  const nextBalance = Math.max(0, member.points_balance + input.pointsDelta);
  updateMember(member, nextBalance, resolveTier(nextBalance, activeTierRules));
  const entry = createLedgerEntry(
    member,
    input.changeType,
    Math.trunc(input.pointsDelta),
    input.reason,
    input.expiryDate ?? null
  );
  if (input.createdAt) entry.created_at = input.createdAt;
  if (input.pointsDelta > 0) {
    entry.remaining_points = Math.trunc(input.pointsDelta);
  }
  return cloneLedgerEntry(entry);
}

export function setMemoryTierRules(rules: TierRule[]) {
  activeTierRules = rules.map((rule) => ({ ...rule }));
}

export function getMemoryMember(identifier: string, fallbackEmail?: string) {
  const keys = [normalizeKey(identifier), normalizeKey(fallbackEmail)];
  for (const key of keys) {
    if (!key) continue;
    const memberId = memberKeys.get(key);
    if (!memberId) continue;
    const member = membersById.get(memberId);
    if (member) return { ...member };
  }
  return null;
}

export function listMemoryMembers() {
  return Array.from(membersById.values()).map((member) => ({ ...member }));
}

export function listMemoryLedger() {
  return ledgerEntries.map((entry) => cloneLedgerEntry(entry));
}

export function memoryTierFor(points: number) {
  return resolveTier(points, activeTierRules);
}

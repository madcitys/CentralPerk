import type { PointsRepository } from "./core/repo.js";
import type { AwardInput, LedgerEntry, Member, RedeemInput, SupportedTier, TierRule } from "./core/types.js";
import { resolveTier } from "./core/utils.js";

const tierRules: TierRule[] = [
  { tier_label: "Gold", min_points: 1000, is_active: true },
  { tier_label: "Silver", min_points: 500, is_active: true },
  { tier_label: "Bronze", min_points: 0, is_active: true },
];

const members = new Map<string, Member>();
let nextMemberId = 1;
let nextLedgerId = 1;

function memberKey(identifier: string, fallbackEmail?: string) {
  return identifier.trim() || fallbackEmail?.trim() || `LOCAL-${nextMemberId}`;
}

function getOrCreateMember(identifier: string, fallbackEmail?: string) {
  const key = memberKey(identifier, fallbackEmail);
  const existing = members.get(key);
  if (existing) return existing;

  const member: Member = {
    id: nextMemberId++,
    member_number: identifier.trim(),
    email: fallbackEmail ?? null,
    points_balance: 0,
    tier: "Bronze",
  };
  members.set(key, member);
  return member;
}

function updateMember(member: Member, balance: number, tier: string) {
  member.points_balance = balance;
  member.tier = tier as SupportedTier;
  const key = member.member_number || member.email || String(member.id);
  members.set(key, member);
}

function ledger(member: Member, changeType: LedgerEntry["change_type"], pointsDelta: number, reason?: string | null): LedgerEntry {
  return {
    id: nextLedgerId++,
    member_id: member.id,
    change_type: changeType,
    points_delta: pointsDelta,
    balance_after: member.points_balance,
    reason,
    created_at: new Date().toISOString(),
  };
}

export const memoryRepo: PointsRepository = {
  async findMember(identifier: string, fallbackEmail?: string) {
    return getOrCreateMember(identifier, fallbackEmail);
  },
  async fetchTierRules() {
    return tierRules;
  },
  async insertAward(member: Member, input: AwardInput, newBalance: number, newTier: string) {
    updateMember(member, newBalance, newTier);
    return ledger(member, input.transactionType, Math.max(0, Math.floor(input.points)), input.reason);
  },
  async insertRedemption(member: Member, input: RedeemInput, newBalance: number, newTier: string) {
    updateMember(member, newBalance, newTier);
    return ledger(member, input.transactionType ?? "REDEEM", -Math.abs(Math.floor(input.points)), input.reason);
  },
  async runExpiryJob() {
    return { membersProcessed: members.size, pointsExpired: 0 };
  },
};

export function memoryTierFor(points: number) {
  return resolveTier(points, tierRules);
}

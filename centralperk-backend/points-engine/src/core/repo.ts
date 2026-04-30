import type { AwardInput, LedgerEntry, Member, RedeemInput, TierRule, ExpiryResult } from "./types.js";

export type PointsRepository = {
  findMember(identifier: string, fallbackEmail?: string): Promise<Member | null>;
  fetchTierRules(): Promise<TierRule[]>;
  saveTierRules?(rules: TierRule[]): Promise<void>;
  insertAward(member: Member, input: AwardInput, newBalance: number, newTier: string): Promise<LedgerEntry>;
  insertRedemption(member: Member, input: RedeemInput, newBalance: number, newTier: string): Promise<LedgerEntry>;
  runExpiryJob(): Promise<ExpiryResult>;
};

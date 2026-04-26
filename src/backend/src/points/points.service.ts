import { BadRequestException, Injectable } from "@nestjs/common";
import { LocalRuntimeService, type LocalState, type MemberRecord, PointMemberRecord } from "../local-runtime/local-runtime.service";
import { TiersService } from "../tiers/tiers.service";
import { nowIso, numberValue } from "../common/utils";

type AwardInput = {
  memberIdentifier?: string;
  fallbackEmail?: string;
  points?: number;
  transactionType?: string;
  transactionRef?: string;
  reason?: string;
  amountSpent?: number;
  receiptId?: string;
  productCategory?: string;
  productCode?: string;
  notes?: string;
  date?: string;
};

type RedeemInput = {
  memberIdentifier?: string;
  fallbackEmail?: string;
  points?: number;
  reason?: string;
  transactionType?: string;
  rewardCatalogId?: string;
};

@Injectable()
export class PointsService {
  constructor(
    private readonly runtime: LocalRuntimeService,
    private readonly tiers: TiersService,
  ) {}

  private resolveMemberKey(state: LocalState, memberIdentifier: string, fallbackEmail?: string) {
    const direct = state.pointMembers[memberIdentifier] ? memberIdentifier : null;
    if (direct) return direct;
    const email = String(fallbackEmail || "").trim().toLowerCase();
    if (!email) return memberIdentifier;
    const memberByEmail = Object.values(state.members).find((member) => member.email.toLowerCase() === email);
    if (memberByEmail) return memberByEmail.memberId;
    const pointMemberByEmail = Object.values(state.pointMembers).find((member) => String(member.email || "").toLowerCase() === email);
    return pointMemberByEmail?.memberId || memberIdentifier;
  }

  private ensureProfile(state: LocalState, memberId: string, fallbackEmail?: string): MemberRecord {
    const existing = state.members[memberId];
    if (existing) return existing;
    const email = fallbackEmail || state.pointMembers[memberId]?.email || "";
    const profile = {
      id: memberId,
      memberId,
      memberNumber: memberId,
      name: state.members[memberId]?.name || memberId,
      email,
      mobile: "",
      memberSince: nowIso(),
      tier: state.pointMembers[memberId]?.tier || "Bronze",
      points: state.pointMembers[memberId]?.pointsBalance || 0,
      lifetimePoints: (state.pointMembers[memberId]?.history || [])
        .filter((item) => Number(item.points || 0) > 0)
        .reduce((sum, item) => sum + Number(item.points || 0), 0),
      segment: state.pointMembers[memberId]?.pointsBalance >= 500 ? "High Value" : "Active",
      status: "Active" as const,
      surveysCompleted: 0,
      profileImage: null,
      birthdate: null,
      address: null,
    };
    state.members[memberId] = profile;
    return profile;
  }

  private async ensureMember(memberId: string, email?: string): Promise<PointMemberRecord> {
    const state = await this.runtime.read();
    const resolvedId = this.resolveMemberKey(state, memberId, email);
    return state.pointMembers[resolvedId] ?? {
      memberId: resolvedId,
      email: email || null,
      pointsBalance: 0,
      tier: "Bronze",
      history: [],
    };
  }

  private awardAmount(state: LocalState, memberId: string, input: AwardInput) {
    const explicit = numberValue(input.points, 0);
    if (explicit > 0) return Math.floor(explicit);
    const amountSpent = numberValue(input.amountSpent, 0);
    if (!(amountSpent > 0)) return 0;

    const memberTier = String(
      state.members[memberId]?.tier ||
        state.pointMembers[memberId]?.tier ||
        "Bronze",
    );
    const rule = (state.earningRules || []).find(
      (item) => String(item.tier_label || "").toLowerCase() === memberTier.toLowerCase() && item.is_active !== false,
    );
    const pesoPerPoint = Math.max(0.01, Number(rule?.peso_per_point || 10));
    const multiplier = Math.max(0.01, Number(rule?.multiplier || 1));
    return Math.max(1, Math.floor((amountSpent / pesoPerPoint) * multiplier));
  }

  async applyAwardToState(state: LocalState, input: AwardInput, idempotencyKey?: string) {
    if (!input.memberIdentifier) throw new BadRequestException("memberIdentifier is required.");
    const memberId = this.resolveMemberKey(state, input.memberIdentifier, input.fallbackEmail);
    const points = this.awardAmount(state, memberId, input);
    const reference = input.transactionRef || idempotencyKey || `award-${Date.now()}`;
    const existing = state.pointMembers[memberId] ?? {
      memberId,
      email: input.fallbackEmail ?? null,
      pointsBalance: 0,
      tier: "Bronze",
      history: [],
    };
    const newBalance = existing.pointsBalance + points;
    const tier = await this.tiers.resolveTier(newBalance);
    const transaction = {
      id: reference,
      type: input.transactionType || "PURCHASE",
      points,
      reason: input.reason || "Points awarded",
      date: input.date || nowIso(),
      expiry_date: null,
      reference,
      receipt_id: input.receiptId || null,
      amount_spent: input.amountSpent ?? null,
      product_category: input.productCategory || null,
      product_code: input.productCode || null,
      notes: input.notes || null,
    };
    state.pointMembers[memberId] = {
      ...existing,
      memberId,
      email: input.fallbackEmail || existing.email,
      pointsBalance: newBalance,
      tier,
      history: [transaction, ...(existing.history || [])],
    };
    const profile = this.ensureProfile(state, memberId, input.fallbackEmail);
    profile.email = input.fallbackEmail || profile.email;
    profile.points = newBalance;
    profile.tier = tier;
    profile.lifetimePoints = (existing.history || [])
      .concat(transaction)
      .filter((item) => Number(item.points || 0) > 0)
      .reduce((sum, item) => sum + Number(item.points || 0), 0);
    profile.segment = profile.segment || (newBalance >= 500 ? "High Value" : "Active");
    return {
      memberId,
      pointsAwarded: points,
      newBalance,
      tier,
      transaction,
      source: "local_runtime",
    };
  }

  async applyRedeemToState(state: LocalState, input: RedeemInput) {
    if (!input.memberIdentifier) throw new BadRequestException("memberIdentifier is required.");
    const memberId = this.resolveMemberKey(state, input.memberIdentifier, input.fallbackEmail);
    const points = Math.floor(numberValue(input.points, 100));
    if (points <= 0) throw new BadRequestException("points must be greater than zero.");
    const existing = state.pointMembers[memberId] ?? {
      memberId,
      email: input.fallbackEmail ?? null,
      pointsBalance: 0,
      tier: "Bronze",
      history: [],
    };
    if (existing.pointsBalance < points) {
      throw new BadRequestException("Insufficient points balance.");
    }
    const newBalance = existing.pointsBalance - points;
    const tier = await this.tiers.resolveTier(newBalance);
    const transaction = {
      id: `redeem-${Date.now()}`,
      type: input.transactionType || "REDEEM",
      points: -Math.abs(points),
      reason: input.reason || "Reward redemption",
      date: nowIso(),
      expiry_date: null,
      reference: input.rewardCatalogId || null,
    };
    state.pointMembers[memberId] = {
      ...existing,
      memberId,
      email: input.fallbackEmail || existing.email,
      pointsBalance: newBalance,
      tier,
      history: [transaction, ...(existing.history || [])],
    };
    const profile = this.ensureProfile(state, memberId, input.fallbackEmail);
    profile.points = newBalance;
    profile.tier = tier;
    return {
      memberId,
      pointsRedeemed: points,
      newBalance,
      tier,
      transaction,
      source: "local_runtime",
    };
  }

  async award(input: AwardInput, idempotencyKey?: string) {
    return this.runtime.update((state) => this.applyAwardToState(state, input, idempotencyKey));
  }

  async redeem(input: RedeemInput) {
    return this.runtime.update((state) => this.applyRedeemToState(state, input));
  }

  async activity(memberId: string, fallbackEmail?: string) {
    const state = await this.runtime.read();
    const resolvedId = this.resolveMemberKey(state, memberId, fallbackEmail);
    const member = state.pointMembers[resolvedId] ?? (await this.ensureMember(resolvedId, fallbackEmail));
    const profile = this.ensureProfile(state, resolvedId, fallbackEmail);
    const fullName = String(profile.name || resolvedId).trim();
    const [firstName, ...restName] = fullName.split(/\s+/);
    const lifetimePoints = (member.history || [])
      .filter((item) => Number(item.points || 0) > 0)
      .reduce((sum, item) => sum + Number(item.points || 0), 0);
    return {
      balance: {
        member_id: resolvedId,
        points_balance: member.pointsBalance,
        tier: member.tier,
      },
      history: member.history || [],
      profile: {
        id: resolvedId,
        member_id: resolvedId,
        member_number: profile.memberNumber || resolvedId,
        first_name: firstName || resolvedId,
        last_name: restName.join(" ") || "",
        email: fallbackEmail || profile.email || member.email || "",
        phone: profile.mobile || null,
        birthdate: profile.birthdate || null,
        points_balance: member.pointsBalance,
        tier: member.tier,
        enrollment_date: profile.memberSince || nowIso(),
        member_since: profile.memberSince || nowIso(),
        mobile: profile.mobile || "",
        segment: profile.segment || (member.pointsBalance >= 500 ? "High Value" : "Active"),
        lifetime_points: lifetimePoints,
        surveys_completed: profile.surveysCompleted || 0,
        status: profile.status || "Active",
      },
    };
  }

  async snapshot() {
    const state = await this.runtime.read();
    return Object.values(state.pointMembers).filter(
      (member) => !member.memberId.includes("{{") && !member.memberId.includes("}}"),
    );
  }
}

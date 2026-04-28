import { BadRequestException, Injectable } from "@nestjs/common";
import { LocalRuntimeService, PointMemberRecord } from "../local-runtime/local-runtime.service";
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

  private async ensureMember(memberId: string, email?: string): Promise<PointMemberRecord> {
    const state = await this.runtime.read();
    return (
      state.pointMembers[memberId] ?? {
        memberId,
        email: email || null,
        pointsBalance: 0,
        tier: "Bronze",
        history: [],
      }
    );
  }

  private awardAmount(input: AwardInput) {
    const explicit = numberValue(input.points, 0);
    if (explicit > 0) return Math.floor(explicit);
    const amountSpent = numberValue(input.amountSpent, 0);
    return amountSpent > 0 ? Math.floor(amountSpent / 10) : 0;
  }

  async award(input: AwardInput, idempotencyKey?: string) {
    if (!input.memberIdentifier) throw new BadRequestException("memberIdentifier is required.");
    const memberId = input.memberIdentifier;
    const points = this.awardAmount(input);
    const reference = input.transactionRef || idempotencyKey || `award-${Date.now()}`;

    return this.runtime.update(async (state) => {
      const existing = state.pointMembers[memberId] ?? (await this.ensureMember(memberId, input.fallbackEmail));
      const newBalance = existing.pointsBalance + points;
      const tier = await this.tiers.resolveTier(newBalance);
      const transaction = {
        id: reference,
        type: input.transactionType || "PURCHASE",
        points,
        reason: input.reason || "Points awarded",
        date: nowIso(),
        expiry_date: null,
        reference,
      };
      state.pointMembers[memberId] = {
        ...existing,
        email: input.fallbackEmail || existing.email,
        pointsBalance: newBalance,
        tier,
        history: [transaction, ...(existing.history || [])],
      };
      return {
        memberId,
        pointsAwarded: points,
        newBalance,
        tier,
        transaction,
        source: "local_runtime",
      };
    });
  }

  async redeem(input: RedeemInput) {
    if (!input.memberIdentifier) throw new BadRequestException("memberIdentifier is required.");
    const memberId = input.memberIdentifier;
    const points = Math.floor(numberValue(input.points, 100));
    if (points <= 0) throw new BadRequestException("points must be greater than zero.");

    return this.runtime.update(async (state) => {
      const existing = state.pointMembers[memberId] ?? (await this.ensureMember(memberId, input.fallbackEmail));
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
        email: input.fallbackEmail || existing.email,
        pointsBalance: newBalance,
        tier,
        history: [transaction, ...(existing.history || [])],
      };
      return {
        memberId,
        pointsRedeemed: points,
        newBalance,
        tier,
        transaction,
        source: "local_runtime",
      };
    });
  }

  async activity(memberId: string, fallbackEmail?: string) {
    const member = await this.ensureMember(memberId, fallbackEmail);
    return {
      balance: {
        member_id: memberId,
        points_balance: member.pointsBalance,
        tier: member.tier,
      },
      history: member.history || [],
      profile: {
        id: memberId,
        member_id: memberId,
        member_number: memberId,
        first_name: memberId === "MEM-000011" ? "Sound" : "Demo",
        last_name: memberId === "MEM-000011" ? "Wave" : "Member",
        email: fallbackEmail || member.email || "demo@example.com",
        phone: null,
        birthdate: null,
        points_balance: member.pointsBalance,
        tier: member.tier,
        enrollment_date: nowIso(),
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

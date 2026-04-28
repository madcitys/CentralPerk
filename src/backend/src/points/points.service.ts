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

  private normalizeIdentifier(value?: string) {
    return String(value || "").trim();
  }

  private matchMember(member: PointMemberRecord, identifier?: string, fallbackEmail?: string) {
    const needle = this.normalizeIdentifier(identifier).toLowerCase();
    const email = this.normalizeIdentifier(fallbackEmail).toLowerCase();
    if (!needle && !email) return false;
    const memberId = this.normalizeIdentifier(member.memberId).toLowerCase();
    const memberNumber = this.normalizeIdentifier(member.memberNumber || member.memberId).toLowerCase();
    const memberEmail = this.normalizeIdentifier(member.email || "").toLowerCase();
    return Boolean(
      (needle && (needle === memberId || needle === memberNumber || needle === memberEmail)) ||
        (email && email === memberEmail),
    );
  }

  private findExistingMember(state: Awaited<ReturnType<LocalRuntimeService["read"]>>, identifier?: string, fallbackEmail?: string) {
    const direct = this.normalizeIdentifier(identifier);
    if (direct && state.pointMembers[direct]) return state.pointMembers[direct];
    return Object.values(state.pointMembers).find((member) => this.matchMember(member, identifier, fallbackEmail)) ?? null;
  }

  private createMember(memberIdentifier: string, email?: string | null): PointMemberRecord {
    return {
      memberId: memberIdentifier,
      memberNumber: memberIdentifier,
      email: email || null,
      firstName: "Demo",
      lastName: "Member",
      phone: null,
      birthdate: null,
      enrollmentDate: nowIso(),
      profileImage: null,
      status: "Active",
      pointsBalance: 0,
      tier: "Bronze",
      history: [],
    };
  }

  private async getMemberRecord(identifier?: string, fallbackEmail?: string) {
    const state = await this.runtime.read();
    const existing = this.findExistingMember(state, identifier, fallbackEmail);
    if (existing) {
      return { memberId: existing.memberId, member: existing };
    }

    const resolvedIdentifier = this.normalizeIdentifier(identifier || fallbackEmail);
    if (!resolvedIdentifier) {
      throw new BadRequestException("memberIdentifier or email is required.");
    }

    const member = this.createMember(resolvedIdentifier, fallbackEmail || identifier || null);
    return { memberId: member.memberId, member };
  }

  private awardAmount(input: AwardInput) {
    const explicit = numberValue(input.points, 0);
    if (explicit > 0) return Math.floor(explicit);
    const amountSpent = numberValue(input.amountSpent, 0);
    return amountSpent > 0 ? Math.floor(amountSpent / 10) : 0;
  }

  async award(input: AwardInput, idempotencyKey?: string) {
    const memberIdentifier = this.normalizeIdentifier(input.memberIdentifier || input.fallbackEmail);
    if (!memberIdentifier) throw new BadRequestException("memberIdentifier is required.");

    const points = this.awardAmount(input);
    const reference = input.transactionRef || idempotencyKey || `award-${Date.now()}`;

    return this.runtime.update(async (state) => {
      const existing = this.findExistingMember(state, memberIdentifier, input.fallbackEmail) ?? this.createMember(memberIdentifier, input.fallbackEmail);
      const memberId = existing.memberId;
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
    const memberIdentifier = this.normalizeIdentifier(input.memberIdentifier || input.fallbackEmail);
    if (!memberIdentifier) throw new BadRequestException("memberIdentifier is required.");

    const points = Math.floor(numberValue(input.points, 100));
    if (points <= 0) throw new BadRequestException("points must be greater than zero.");

    return this.runtime.update(async (state) => {
      const existing = this.findExistingMember(state, memberIdentifier, input.fallbackEmail) ?? this.createMember(memberIdentifier, input.fallbackEmail);
      if (existing.pointsBalance < points) {
        throw new BadRequestException("Insufficient points balance.");
      }
      const memberId = existing.memberId;
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

  async activity(memberIdentifier: string, fallbackEmail?: string) {
    const { memberId, member } = await this.getMemberRecord(memberIdentifier, fallbackEmail);
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
        member_number: member.memberNumber || memberId,
        first_name: member.firstName || "Demo",
        last_name: member.lastName || "Member",
        email: fallbackEmail || member.email || "demo@example.com",
        phone: member.phone || null,
        birthdate: member.birthdate || null,
        points_balance: member.pointsBalance,
        tier: member.tier,
        enrollment_date: member.enrollmentDate || nowIso(),
        profile_photo_url: member.profileImage || null,
        status: member.status || "Active",
      },
    };
  }

  async lookupByEmail(email?: string) {
    const normalizedEmail = this.normalizeIdentifier(email).toLowerCase();
    if (!normalizedEmail) throw new BadRequestException("email is required.");
    const state = await this.runtime.read();
    const member = Object.values(state.pointMembers).find(
      (entry) => this.normalizeIdentifier(entry.email || "").toLowerCase() === normalizedEmail,
    );
    if (!member) {
      return this.activity(normalizedEmail, normalizedEmail);
    }
    return this.activity(member.memberId, member.email || normalizedEmail);
  }

  async snapshot() {
    return this.runtime.snapshotPoints();
  }
}

import { updateApiState, withApiState } from "./local-store";

type AwardInput = {
  memberIdentifier: string;
  fallbackEmail?: string;
  points: number;
  transactionType: "PURCHASE" | "MANUAL_AWARD" | "EARN";
  reason: string;
  amountSpent?: number;
  productCode?: string;
  productCategory?: string;
};

type RedeemInput = {
  memberIdentifier: string;
  fallbackEmail?: string;
  points: number;
  reason: string;
  transactionType?: "REDEEM" | "GIFT";
  rewardCatalogId?: string | number;
  promotionCampaignId?: string | null;
};

function resolveTier(points: number) {
  if (points >= 750) return "Gold";
  if (points >= 250) return "Silver";
  return "Bronze";
}

function awardPoints(input: AwardInput) {
  if (input.points > 0) return input.points;
  if (input.amountSpent && input.amountSpent > 0) return Math.floor(input.amountSpent / 10);
  return 0;
}

function buildLocalMemberActivityResponse(
  memberId: string,
  existing: {
    memberId: string;
    email: string | null;
    pointsBalance: number;
    tier: string;
    history: Array<{
      id: string;
      type: string;
      points: number;
      reason: string;
      date: string;
      expiry_date: string | null;
      reference: string | null;
    }>;
  },
  fallbackEmail?: string,
) {
  return {
    balance: {
      member_id: memberId,
      points_balance: existing.pointsBalance,
      tier: existing.tier,
    },
    history: existing.history,
    profile: {
      id: memberId,
      member_id: memberId,
      member_number: memberId,
      first_name: "Demo",
      last_name: "Member",
      email: fallbackEmail ?? existing.email ?? "demo@example.com",
      phone: null,
      birthdate: null,
      points_balance: existing.pointsBalance,
      tier: existing.tier,
      enrollment_date: new Date().toISOString(),
    },
  };
}

export async function awardLocalPoints(input: AwardInput, reference?: string) {
  return updateApiState((state) => {
    const memberId = input.memberIdentifier;
    const existing = state.pointMembers[memberId] ?? {
      memberId,
      email: input.fallbackEmail ?? null,
      pointsBalance: 0,
      tier: "Bronze",
      history: [],
    };
    const points = awardPoints(input);
    const nextBalance = existing.pointsBalance + points;
    const tx = {
      id: reference || `award-${Date.now()}`,
      type: input.transactionType,
      points,
      reason: input.reason,
      date: new Date().toISOString(),
      expiry_date: null,
      reference: reference ?? null,
    };

    state.pointMembers[memberId] = {
      ...existing,
      email: input.fallbackEmail ?? existing.email,
      pointsBalance: nextBalance,
      tier: resolveTier(nextBalance),
      history: [tx, ...existing.history],
    };

    return {
      memberId,
      pointsAwarded: points,
      newBalance: nextBalance,
      tier: resolveTier(nextBalance),
      transaction: tx,
      source: "local_runtime",
    };
  });
}

export async function redeemLocalPoints(input: RedeemInput) {
  return updateApiState((state) => {
    const memberId = input.memberIdentifier;
    const existing = state.pointMembers[memberId] ?? {
      memberId,
      email: input.fallbackEmail ?? null,
      pointsBalance: 0,
      tier: "Bronze",
      history: [],
    };

    if (existing.pointsBalance < input.points) {
      throw new Error("Insufficient points balance.");
    }

    const nextBalance = existing.pointsBalance - input.points;
    const tx = {
      id: `redeem-${Date.now()}`,
      type: input.transactionType ?? "REDEEM",
      points: -Math.abs(input.points),
      reason: input.reason,
      date: new Date().toISOString(),
      expiry_date: null,
      reference: input.rewardCatalogId === undefined ? null : String(input.rewardCatalogId),
    };

    state.pointMembers[memberId] = {
      ...existing,
      email: input.fallbackEmail ?? existing.email,
      pointsBalance: nextBalance,
      tier: resolveTier(nextBalance),
      history: [tx, ...existing.history],
    };

    return {
      memberId,
      pointsRedeemed: input.points,
      newBalance: nextBalance,
      tier: resolveTier(nextBalance),
      transaction: tx,
      source: "local_runtime",
    };
  });
}

export async function loadLocalMemberActivity(memberId: string, fallbackEmail?: string) {
  const existingMember = await withApiState((state) => state.pointMembers[memberId] ?? null);
  if (existingMember && (!fallbackEmail || existingMember.email === fallbackEmail)) {
    return buildLocalMemberActivityResponse(memberId, existingMember, fallbackEmail);
  }

  return updateApiState((state) => {
    const existing = state.pointMembers[memberId] ?? {
      memberId,
      email: fallbackEmail ?? null,
      pointsBalance: 0,
      tier: "Bronze",
      history: [],
    };

    state.pointMembers[memberId] = {
      ...existing,
      email: fallbackEmail ?? existing.email,
    };

    return buildLocalMemberActivityResponse(memberId, existing, fallbackEmail);
  });
}

export async function loadLocalPointsSnapshot() {
  return withApiState((state) => ({
    members: Object.values(state.pointMembers)
      .filter((member) => !member.memberId.includes("{{") && !member.memberId.includes("}}"))
      .map((member) => ({
        memberId: member.memberId,
        email: member.email?.includes("{{") || member.email?.includes("}}") ? null : member.email,
        pointsBalance: member.pointsBalance,
        tier: member.tier,
        history: member.history,
      })),
  }));
}

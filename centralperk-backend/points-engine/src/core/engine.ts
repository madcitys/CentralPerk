import type { AwardInput, RedeemInput, ExpiryResult } from "./types.js";
import type { PointsRepository } from "./repo.js";
import { calculatePurchasePoints, normalizeTierRules, resolveTier } from "./utils.js";
import { fetchActiveMultiplier } from "../campaign-client.js";

export async function awardPoints(repo: PointsRepository, input: AwardInput) {
  const [member, rules] = await Promise.all([
    repo.findMember(input.memberIdentifier, input.fallbackEmail),
    repo.fetchTierRules(),
  ]);
  if (!member) throw new Error("Member not found.");

  let pointsToAdd =
    input.transactionType === "PURCHASE" && input.amountSpent !== undefined
      ? calculatePurchasePoints(input.amountSpent)
      : Math.max(0, Math.floor(input.points));

  if (input.transactionType === "PURCHASE" && input.amountSpent !== undefined) {
    const multiplierResult = await fetchActiveMultiplier({
      memberIdentifier: input.memberIdentifier,
      fallbackEmail: input.fallbackEmail,
      amountSpent: input.amountSpent,
      tier: member.tier ?? undefined,
    });
    const multiplier = Math.max(1, Number(multiplierResult?.multiplier ?? 1));
    pointsToAdd = Math.floor(pointsToAdd * multiplier);
  }

  const newBalance = Math.max(0, Math.floor(member.points_balance + pointsToAdd));
  const newTier = resolveTier(newBalance, rules);

  const patchedInput = { ...input, points: pointsToAdd };
  const ledgerEntry = await repo.insertAward(member, patchedInput, newBalance, newTier);
  return { newBalance, newTier, pointsAdded: pointsToAdd, ledgerEntry };
}

export async function redeemPoints(repo: PointsRepository, input: RedeemInput) {
  const [member, rules] = await Promise.all([
    repo.findMember(input.memberIdentifier, input.fallbackEmail),
    repo.fetchTierRules(),
  ]);
  if (!member) throw new Error("Member not found.");

  const pointsToDeduct = Math.max(0, Math.floor(input.points));
  if (pointsToDeduct > member.points_balance) throw new Error("Not enough points.");

  const newBalance = Math.max(0, Math.floor(member.points_balance - pointsToDeduct));
  const newTier = resolveTier(newBalance, rules);

  const patchedInput = { ...input, points: pointsToDeduct };
  const ledgerEntry = await repo.insertRedemption(member, patchedInput, newBalance, newTier);
  return { newBalance, newTier, pointsDeducted: pointsToDeduct, ledgerEntry };
}

export async function runExpiry(repo: PointsRepository): Promise<ExpiryResult> {
  return repo.runExpiryJob();
}

export { normalizeTierRules, resolveTier, calculatePurchasePoints };

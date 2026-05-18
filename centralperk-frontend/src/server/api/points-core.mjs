function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function toTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toWholePoints(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

export function createPointsApi(deps) {
  return {
    async award(payload) {
      const memberIdentifier = toTrimmedString(payload?.memberIdentifier);
      const reason = toTrimmedString(payload?.reason);
      const transactionType = toTrimmedString(payload?.transactionType || "EARN");
      const idempotencyKey = toTrimmedString(payload?.idempotencyKey);

      if (!memberIdentifier) throw badRequest("memberIdentifier is required.");
      if (!reason) throw badRequest("reason is required.");
      if (!["PURCHASE", "MANUAL_AWARD", "EARN"].includes(transactionType)) {
        throw badRequest("transactionType must be PURCHASE, MANUAL_AWARD, or EARN.");
      }

      if (idempotencyKey) {
        const existing = await deps.findAwardByIdempotencyKey(idempotencyKey, {
          memberIdentifier,
          fallbackEmail: payload?.fallbackEmail,
        });
        if (existing) {
          return {
            ...existing,
            duplicate: true,
            idempotencyKey,
          };
        }
      }

      const result = await deps.awardMemberPoints({
        memberIdentifier,
        fallbackEmail: toTrimmedString(payload?.fallbackEmail) || undefined,
        points: toWholePoints(payload?.points),
        transactionType,
        reason,
        amountSpent: payload?.amountSpent === undefined ? undefined : Number(payload.amountSpent || 0),
        productCode: toTrimmedString(payload?.productCode) || undefined,
        productCategory: toTrimmedString(payload?.productCategory) || undefined,
        idempotencyKey: idempotencyKey || undefined,
      });

      return {
        ...result,
        duplicate: false,
        idempotencyKey: idempotencyKey || null,
      };
    },

    async redeem(payload) {
      const memberIdentifier = toTrimmedString(payload?.memberIdentifier);
      const reason = toTrimmedString(payload?.reason);
      const idempotencyKey = toTrimmedString(payload?.idempotencyKey);
      const transactionType = toTrimmedString(payload?.transactionType || "REDEEM");

      if (!memberIdentifier) throw badRequest("memberIdentifier is required.");
      if (!reason) throw badRequest("reason is required.");
      if (!["REDEEM", "GIFT"].includes(transactionType)) {
        throw badRequest("transactionType must be REDEEM or GIFT.");
      }

      const points = toWholePoints(payload?.points);
      if (points <= 0) throw badRequest("points must be greater than zero.");

      if (idempotencyKey) {
        const existing = await deps.findRedeemByIdempotencyKey(idempotencyKey, {
          memberIdentifier,
          fallbackEmail: payload?.fallbackEmail,
        });
        if (existing) {
          return {
            ...existing,
            duplicate: true,
            idempotencyKey,
          };
        }
      }

      const result = await deps.redeemMemberPoints({
        memberIdentifier,
        fallbackEmail: toTrimmedString(payload?.fallbackEmail) || undefined,
        points,
        reason,
        transactionType,
        rewardCatalogId: payload?.rewardCatalogId ?? undefined,
        promotionCampaignId: toTrimmedString(payload?.promotionCampaignId) || undefined,
        idempotencyKey: idempotencyKey || undefined,
      });

      return {
        ...result,
        duplicate: false,
        idempotencyKey: idempotencyKey || null,
      };
    },
  };
}

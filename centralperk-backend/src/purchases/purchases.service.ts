import { BadRequestException, Injectable } from "@nestjs/common";
import { LocalRuntimeService } from "../local-runtime/local-runtime.service";
import { PointsService } from "../points/points.service";
import { cleanString, nowIso, numberValue } from "../common/utils";

@Injectable()
export class PurchasesService {
  constructor(
    private readonly runtime: LocalRuntimeService,
    private readonly points: PointsService,
  ) {}

  async create(input: Record<string, unknown>) {
    const memberId = cleanString(input.memberId) || cleanString(input.memberIdentifier);
    const fallbackEmail = cleanString(input.email) || cleanString(input.fallbackEmail) || undefined;
    const receiptReference = cleanString(input.receiptReference) || cleanString(input.referenceNumber);
    const amount = numberValue(input.amount, 0);
    const category = cleanString(input.category) || "general";
    const notes = cleanString(input.notes) || null;
    const purchaseDate = cleanString(input.date) || nowIso();

    if (!memberId) throw new BadRequestException("memberId is required.");
    if (!receiptReference) throw new BadRequestException("receiptReference is required.");
    if (!(amount > 0)) throw new BadRequestException("amount must be greater than zero.");

    return this.runtime.update(async (state) => {
      const existing = state.purchases.find(
        (purchase) =>
          purchase.memberId === memberId &&
          purchase.receiptReference.toLowerCase() === receiptReference.toLowerCase(),
      );
      if (existing) throw new BadRequestException("Purchase reference already recorded.");

      const award = await this.points.applyAwardToState(state, {
        memberIdentifier: memberId,
        fallbackEmail,
        amountSpent: amount,
        transactionType: "PURCHASE",
        reason: `Recorded purchase ${receiptReference}`,
        receiptId: receiptReference,
        productCategory: category,
        notes: notes || undefined,
        date: purchaseDate,
      }, receiptReference);

      const purchase = {
        id: `purchase-${Date.now()}`,
        memberId,
        receiptReference,
        amount,
        date: purchaseDate,
        category,
        notes,
        pointsAwarded: award.pointsAwarded,
        createdAt: nowIso(),
      };
      state.purchases.unshift(purchase);
      return { purchase, award, mode: "local_runtime" as const };
    });
  }

  async list(memberId?: string) {
    const state = await this.runtime.read();
    return (state.purchases || [])
      .filter((purchase) => !memberId || purchase.memberId === memberId)
      .sort((left, right) => String(right.date).localeCompare(String(left.date)));
  }
}

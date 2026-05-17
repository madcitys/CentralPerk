import { HttpError } from "./http-error";
import { type VoucherRecord, readApiState, updateApiState } from "./local-store";

export async function listVoucherRecords(input: {
  memberId?: string;
  memberEmail?: string;
}) {
  const state = await readApiState();
  const memberId = input.memberId?.trim().toLowerCase() || "";
  const memberEmail = input.memberEmail?.trim().toLowerCase() || "";

  return state.vouchers.filter((voucher) => {
    if (memberId && voucher.memberId.trim().toLowerCase() === memberId) return true;
    if (memberEmail && String(voucher.memberEmail || "").trim().toLowerCase() === memberEmail) return true;
    return !memberId && !memberEmail;
  });
}

export async function createVoucherRecord(input: VoucherRecord) {
  return updateApiState((state) => {
    const duplicate = state.vouchers.find(
      (voucher) =>
        voucher.id.trim().toLowerCase() === input.id.trim().toLowerCase() ||
        voucher.orderId.trim().toLowerCase() === input.orderId.trim().toLowerCase() ||
        voucher.voucherCode.trim().toLowerCase() === input.voucherCode.trim().toLowerCase(),
    );

    if (duplicate) {
      throw new HttpError(409, "This voucher already exists.");
    }

    const record: VoucherRecord = {
      ...input,
      id: input.id.trim(),
      memberId: input.memberId.trim(),
      memberEmail: input.memberEmail?.trim() || null,
      rewardId: input.rewardId.trim(),
      rewardCatalogId: input.rewardCatalogId?.trim() || null,
      rewardName: input.rewardName.trim(),
      pointsCost: Math.max(0, Math.floor(input.pointsCost)),
      voucherCode: input.voucherCode.trim().toUpperCase(),
      orderId: input.orderId.trim().toUpperCase(),
      qrValue: input.qrValue.trim(),
      qrTargetUrl: input.qrTargetUrl.trim(),
      partnerLabel: input.partnerLabel?.trim() || null,
      deliveryPartner: input.deliveryPartner?.trim() || null,
      deliveryAddress: input.deliveryAddress?.trim() || null,
      deliveryNotes: input.deliveryNotes?.trim() || null,
      contactNumber: input.contactNumber?.trim() || null,
      createdAt: input.createdAt,
      validatedAt: input.validatedAt ?? null,
      status: input.status,
    };

    state.vouchers.unshift(record);
    return record;
  });
}

export async function getVoucherRecord(voucherId: string) {
  const state = await readApiState();
  return state.vouchers.find((voucher) => voucher.id === voucherId) ?? null;
}

export async function validateVoucherRecord(input: {
  voucherId: string;
  voucherCode: string;
}) {
  return updateApiState((state) => {
    const voucher = state.vouchers.find((item) => item.id === input.voucherId);
    if (!voucher) {
      throw new HttpError(404, "Voucher not found.");
    }

    if (voucher.voucherCode.trim().toUpperCase() !== input.voucherCode.trim().toUpperCase()) {
      throw new HttpError(400, "Voucher code does not match this QR.");
    }

    if (voucher.status !== "validated") {
      voucher.status = "validated";
      voucher.validatedAt = new Date().toISOString();
    }

    return voucher;
  });
}

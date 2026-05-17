export type VoucherMethod = "in-store" | "online";
export type VoucherStatus = "ready" | "processing" | "validated";

export interface RedemptionVoucher {
  id: string;
  memberId: string;
  memberEmail: string | null;
  rewardId: string;
  rewardCatalogId: string | null;
  rewardName: string;
  pointsCost: number;
  method: VoucherMethod;
  voucherCode: string;
  orderId: string;
  qrValue: string;
  qrTargetUrl: string;
  qrImageUrl?: string | null;
  createdAt: string;
  partnerLabel: string | null;
  deliveryPartner: string | null;
  deliveryAddress: string | null;
  deliveryNotes: string | null;
  contactNumber: string | null;
  status: VoucherStatus;
  validatedAt: string | null;
}

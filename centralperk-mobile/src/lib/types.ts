export type Role = "customer" | "admin";

export type Member = {
  id?: string | number;
  memberId?: string | number;
  memberNumber?: string;
  member_id?: string | number;
  member_number?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string | null;
  enrollment_date?: string;
  points_balance?: number;
  tier?: string | null;
  status?: string | null;
  birthdate?: string | null;
  address?: string | null;
  profile_photo_url?: string | null;
  sms_enabled?: boolean | null;
  email_enabled?: boolean | null;
  push_enabled?: boolean | null;
  promotional_opt_in?: boolean | null;
};

export type LoyaltyTransaction = {
  id?: string | number;
  transaction_id?: string | number;
  member_id?: string | number;
  points?: number;
  transaction_type?: string;
  transaction_date?: string;
  created_at?: string;
  amount_spent?: number | null;
  reason?: string | null;
  description?: string | null;
  receipt_id?: string | null;
  reward_catalog_id?: string | number | null;
};

export type Reward = {
  id?: string | number;
  reward_id?: string;
  name?: string;
  description?: string | null;
  points_cost?: number;
  category?: string | null;
  image_url?: string | null;
  is_active?: boolean | null;
  expiry_date?: string | null;
};

export type RedemptionVoucher = {
  id: string;
  memberId: string;
  memberEmail: string | null;
  rewardId: string;
  rewardCatalogId: string | null;
  rewardName: string;
  pointsCost: number;
  method: "in-store" | "online";
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
  status: "ready" | "processing" | "validated";
  validatedAt: string | null;
};

export type AppNotification = {
  id: string;
  subject: string;
  message: string;
  status?: string;
  createdAt?: string;
};

export type LoginActivity = {
  id?: string | number;
  member_id?: string | number;
  login_at?: string;
  channel?: string | null;
  source?: string | null;
};

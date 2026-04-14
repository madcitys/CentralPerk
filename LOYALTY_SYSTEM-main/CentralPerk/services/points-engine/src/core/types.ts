export type SupportedTier = "Bronze" | "Silver" | "Gold";

export type TierRule = {
  tier_label: SupportedTier;
  min_points: number;
  is_active?: boolean;
};

export type Member = {
  id: number;
  member_number?: string | null;
  email?: string | null;
  points_balance: number;
  tier?: SupportedTier | null;
};

export type AwardInput = {
  memberIdentifier: string;
  fallbackEmail?: string;
  points: number;
  transactionType: "PURCHASE" | "MANUAL_AWARD" | "EARN";
  reason: string;
  amountSpent?: number;
  productCode?: string;
  productCategory?: string;
};

export type RedeemInput = {
  memberIdentifier: string;
  fallbackEmail?: string;
  points: number;
  reason: string;
  transactionType?: "REDEEM" | "GIFT";
  rewardCatalogId?: string | number;
  promotionCampaignId?: string | null;
};

export type LedgerEntry = {
  id?: number;
  member_id: number;
  change_type: AwardInput["transactionType"] | "REDEEM" | "GIFT" | "EXPIRY_DEDUCTION";
  points_delta: number;
  balance_after?: number;
  reason?: string | null;
  reward_catalog_id?: number | null;
  promotion_campaign_id?: string | null;
  expiry_date?: string | null;
  created_at?: string;
};

export type ExpiryResult = {
  membersProcessed: number;
  pointsExpired: number;
};

export type MemberTier = "Bronze" | "Silver" | "Gold";

export type TransactionItem = {
  id: string;
  date: string;
  description: string;
  type: "earned" | "redeemed" | "expired" | "pending" | "gifted";
  points: number;
  balance: number;
  category?: string;
};

export type RewardItem = {
  id: string;
  rewardCatalogId?: string | number;
  name: string;
  description: string;
  pointsCost: number;
  category: "food" | "beverage" | "merchandise" | "voucher";
  imageUrl?: string;
  available: boolean;
  partnerId?: string | number | null;
  partnerName?: string | null;
  partnerCode?: string | null;
  partnerConversionRate?: number | null;
  cashValue?: number | null;
  activeFlashSaleId?: string | null;
  flashSaleEndsAt?: string | null;
  flashSaleStartsAt?: string | null;
  flashSaleQuantityLimit?: number | null;
  flashSaleClaimedCount?: number;
  flashSaleBanner?: string | null;
  flashSaleCountdownLabel?: string | null;
};

export type CampaignItem = {
  id: string;
  campaignName: string;
  description: string;
  campaignType: "bonus_points" | "flash_sale" | "multiplier_event";
  bannerTitle?: string | null;
  bannerMessage?: string | null;
  bonusPoints: number;
  multiplier: number;
  endsAt: string;
  eligibleTiers: string[];
  flashSaleClaimedCount?: number;
  flashSaleQuantityLimit?: number | null;
};

export type MemberSnapshot = {
  memberId: string;
  fullName: string;
  email: string;
  tier: MemberTier;
  points: number;
  pendingPoints: number;
  lifetimePoints: number;
  earnedThisMonth: number;
  redeemedThisMonth: number;
  transactions: TransactionItem[];
};

export type PortalData = {
  member: MemberSnapshot;
  campaigns: CampaignItem[];
  rewards: RewardItem[];
  source: "api" | "mock";
};

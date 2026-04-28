export type CampaignType = "bonus_points" | "flash_sale" | "multiplier_event";
export type CampaignStatus = "draft" | "scheduled" | "active" | "paused" | "completed" | "archived";

export type Campaign = {
  id: string;
  campaignCode: string;
  campaignName: string;
  description: string | null;
  campaignType: CampaignType;
  status: CampaignStatus;
  multiplier: number;
  minimumPurchaseAmount: number;
  bonusPoints: number;
  productScope: string[];
  eligibleTiers: string[];
  rewardId: number | null;
  flashSaleQuantityLimit: number | null;
  flashSaleClaimedCount: number;
  startsAt: string;
  endsAt: string;
  budgetLimit: number | null;
  budgetSpent: number;
  autoPause: boolean;
};

export type CampaignInput = {
  id?: string;
  campaignCode: string;
  campaignName: string;
  description?: string | null;
  campaignType: CampaignType;
  status?: CampaignStatus;
  multiplier?: number;
  minimumPurchaseAmount?: number;
  bonusPoints?: number;
  productScope?: string[];
  eligibleTiers?: string[];
  rewardId?: number | string | null;
  flashSaleQuantityLimit?: number | null;
  startsAt: string;
  endsAt: string;
  budgetLimit?: number | null;
  autoPause?: boolean;
};

export type MultiplierLookupInput = {
  memberIdentifier: string;
  fallbackEmail?: string;
  tier?: string;
  amountSpent: number;
};

export type MultiplierLookupResult = {
  active: boolean;
  campaignId: string | null;
  multiplier: number;
  variant: "A" | "B";
  bonusPoints: number;
};

export type VariantAssignment = {
  campaignId: string;
  memberId: number;
  variant: "A" | "B";
};

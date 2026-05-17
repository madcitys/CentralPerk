export interface Transaction {
  id: string;
  date: string;
  description: string;
  type: "earned" | "redeemed" | "expired" | "pending" | "gifted";
  points: number;
  balance: number;
  category?: string;
  receiptId?: string;
}

export interface Reward {
  id: string;
  name: string;
  description: string;
  pointsCost: number;
  category: "food" | "beverage" | "merchandise" | "voucher";
  imageUrl?: string;
  available: boolean;
  expiryDate?: string;
  reserved?: boolean;
  rewardCatalogId?: string | number;
  partnerId?: string | number | null;
  partnerName?: string | null;
  partnerCode?: string | null;
  partnerLogoUrl?: string | null;
  partnerConversionRate?: number | null;
  cashValue?: number | null;
  activeFlashSaleId?: string | null;
  flashSaleEndsAt?: string | null;
  flashSaleStartsAt?: string | null;
  flashSaleQuantityLimit?: number | null;
  flashSaleClaimedCount?: number;
  flashSaleBanner?: string | null;
  flashSaleCountdownLabel?: string | null;
}

export interface EarnOpportunity {
  id: string;
  title: string;
  description: string;
  points: number;
  completed?: boolean;
  icon: string;
  active?: boolean;
}

export interface MemberData {
  memberId: string;
  fullName: string;
  email: string;
  phone: string;
  birthdate?: string;
  address?: string;
  profileImage: string;
  tier: "Bronze" | "Silver" | "Gold";
  memberSince: string;
  status: "Active" | "Inactive";
  points: number;
  pendingPoints: number;
  lifetimePoints: number;
  expiringPoints: number;
  daysUntilExpiry: number;
  earnedThisMonth: number;
  redeemedThisMonth: number;
  transactions: Transaction[];
  profileComplete: boolean;
  hasDownloadedApp: boolean;
  surveysCompleted: number;
  badges?: Array<{
    badgeId: string;
    badgeCode: string;
    badgeName: string;
    iconName: string;
    isEarned: boolean;
    progressValue: number;
    milestoneTarget: number;
    earnedAt?: string | null;
  }>;
}

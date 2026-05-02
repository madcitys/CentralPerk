import type { CampaignItem, MemberSnapshot, PortalData, RewardItem } from "./types";

const now = Date.now();

export const mockMember: MemberSnapshot = {
  memberId: "CP-1001",
  fullName: "Kiefer Member",
  email: "kiefer@example.com",
  tier: "Silver",
  points: 620,
  pendingPoints: 45,
  lifetimePoints: 2140,
  earnedThisMonth: 380,
  redeemedThisMonth: 120,
  transactions: [
    {
      id: "tx-001",
      date: new Date(now - 1000 * 60 * 60 * 3).toISOString(),
      description: "Cold brew purchase bonus",
      type: "earned",
      points: 90,
      balance: 620,
      category: "Purchase",
    },
    {
      id: "tx-002",
      date: new Date(now - 1000 * 60 * 60 * 26).toISOString(),
      description: "Free pastry redemption",
      type: "redeemed",
      points: 120,
      balance: 530,
      category: "Reward",
    },
    {
      id: "tx-003",
      date: new Date(now - 1000 * 60 * 60 * 52).toISOString(),
      description: "Weekend multiplier event",
      type: "earned",
      points: 150,
      balance: 650,
      category: "Campaign",
    },
    {
      id: "tx-004",
      date: new Date(now - 1000 * 60 * 60 * 78).toISOString(),
      description: "Survey completion reward",
      type: "earned",
      points: 40,
      balance: 500,
      category: "Engagement",
    },
  ],
};

export const mockCampaigns: CampaignItem[] = [
  {
    id: "camp-1",
    campaignName: "Summer Sips",
    description: "Earn a bonus on every iced drink this week.",
    campaignType: "bonus_points",
    bannerTitle: "2x on iced drinks",
    bannerMessage: "Perfect for the afternoon rush.",
    bonusPoints: 60,
    multiplier: 2,
    endsAt: new Date(now + 1000 * 60 * 60 * 32).toISOString(),
    eligibleTiers: ["Bronze", "Silver", "Gold"],
  },
  {
    id: "camp-2",
    campaignName: "Pastry Flash",
    description: "Limited redemptions for a pastry bundle.",
    campaignType: "flash_sale",
    bannerTitle: "Flash sale reward",
    bannerMessage: "Redeem before stock runs out.",
    bonusPoints: 0,
    multiplier: 1,
    endsAt: new Date(now + 1000 * 60 * 60 * 8).toISOString(),
    eligibleTiers: ["Silver", "Gold"],
    flashSaleClaimedCount: 18,
    flashSaleQuantityLimit: 25,
  },
];

export const mockRewards: RewardItem[] = [
  {
    id: "reward-1",
    rewardCatalogId: "REWARD-001",
    name: "Free Pastry",
    description: "Choose from croissant, muffin, or danish.",
    pointsCost: 150,
    category: "food",
    available: true,
    imageUrl: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "reward-2",
    rewardCatalogId: "REWARD-002",
    name: "Signature Latte",
    description: "Any hot or iced signature latte.",
    pointsCost: 220,
    category: "beverage",
    available: true,
    imageUrl: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "reward-3",
    rewardCatalogId: "REWARD-003",
    name: "Central Perk Tote Bag",
    description: "Member-exclusive canvas tote bag.",
    pointsCost: 760,
    category: "merchandise",
    available: true,
    imageUrl: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "reward-4",
    rewardCatalogId: "REWARD-004",
    name: "Partner Gift Voucher",
    description: "Voucher redeemable at partner stores.",
    pointsCost: 300,
    category: "voucher",
    available: true,
    partnerName: "Perk Partner",
    cashValue: 150,
    imageUrl: "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=900&q=80",
  },
];

export const mockPortalData: PortalData = {
  member: mockMember,
  campaigns: mockCampaigns,
  rewards: mockRewards,
  source: "mock",
};

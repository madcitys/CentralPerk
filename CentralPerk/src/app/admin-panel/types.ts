export interface Member {
  member_id: string;
  id?: string | number;
  member_number: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  enrollment_date: string;
  points_balance?: number;
  tier?: string;
}

export interface LoyaltyTransaction {
  transaction_id?: string;
  member_id: string;
  points: number;
  transaction_type: string;
  transaction_date: string;
  reason?: string;
  loyalty_members?: {
    first_name: string;
    last_name: string;
    member_number: string;
  };
}

export interface TierDistribution {
  gold: number;
  silver: number;
  bronze: number;
}

export interface MemberGrowthPoint {
  key: string;
  label: string;
  count: number;
}

export interface SeriesPoint {
  key: string;
  label: string;
  value: number;
}

export interface TierMovementPoint {
  key: string;
  label: string;
  upgrades: number;
  downgrades: number;
}

export interface MemberActivityRow {
  memberNumber: string;
  fullName: string;
  lastActivityDate: string | null;
  activityLevel: "active" | "warm" | "inactive";
  earnedPoints: number;
}

export interface RewardPopularityRow {
  label: string;
  count: number;
}

export interface AdminMetrics {
  totalMembers: number;
  activeMembers: number;
  pointsLiability: number;
  totalPointsRedeemed: number;
  tierDistribution: TierDistribution;
  newMembersToday: number;
  newMembersThisWeek: number;
  newMembersThisMonth: number;
  newMembersLastMonth: number;
  growthRate: number;
  growthSeries: MemberGrowthPoint[];
  earnedPointsSeries: SeriesPoint[];
  redemptionSeries: SeriesPoint[];
  memberSegments: { label: string; count: number }[];
  memberActivityRows: MemberActivityRow[];
  rewardPopularity: RewardPopularityRow[];
  redemptionRate: number;
  tierMovementTrend: TierMovementPoint[];
  redemptionValuePerPoint: number;
  monetaryLiability: number;
  liabilityTrend: { month: string; points: number; monetary: number }[];
}

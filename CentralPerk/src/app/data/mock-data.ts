// Mock user data for the application
export interface Transaction {
  id: string;
  date: string;
  description: string;
  type: 'earned' | 'redeemed' | 'expired' | 'pending' | 'gifted';
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
  category: 'food' | 'beverage' | 'merchandise' | 'voucher';
  imageUrl: string;
  available: boolean;
  expiryDate?: string;
  reserved?: boolean;
}

export interface MemberData {
  memberId: string;
  fullName: string;
  email: string;
  phone: string;
  profileImage: string;
  tier: 'Bronze' | 'Silver' | 'Gold';
  memberSince: string;
  status: 'Active' | 'Inactive';
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
}

export const currentUser: MemberData = {
  memberId: 'ZUS2024001',
  fullName: 'Sarah Anderson',
  email: 'sarah.anderson@email.com',
  phone: '+1 (555) 123-4567',
  profileImage: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80',
  tier: 'Silver',
  memberSince: 'January 15, 2020',
  status: 'Active',
  points: 640,
  pendingPoints: 65,
  lifetimePoints: 690,
  expiringPoints: 40,
  daysUntilExpiry: 7,
  earnedThisMonth: 220,
  redeemedThisMonth: 75,
  profileComplete: true,
  hasDownloadedApp: true,
  surveysCompleted: 5,
  transactions: [
    {
      id: '1',
      date: '2026-02-21',
      description: 'Morning Coffee Purchase',
      type: 'earned',
      points: 45,
      balance: 2475,
      category: 'Purchase',
      receiptId: 'RCP-20240221-001',
    },
    {
      id: '2',
      date: '2026-02-20',
      description: 'Points Gift to Friend',
      type: 'gifted',
      points: 100,
      balance: 2430,
      category: 'Transfer',
    },
    {
      id: '3',
      date: '2026-02-20',
      description: 'Pending: Online Order #12345',
      type: 'pending',
      points: 120,
      balance: 2530,
      category: 'Purchase',
      receiptId: 'RCP-20240220-002',
    },
    {
      id: '4',
      date: '2026-02-19',
      description: 'Free Pastry Redemption',
      type: 'redeemed',
      points: 150,
      balance: 2530,
      category: 'Reward',
    },
    {
      id: '5',
      date: '2026-02-18',
      description: 'Lunch Purchase - Sandwich & Coffee',
      type: 'earned',
      points: 85,
      balance: 2680,
      category: 'Purchase',
      receiptId: 'RCP-20240218-003',
    },
    {
      id: '6',
      date: '2026-02-17',
      description: 'Survey Completion Bonus',
      type: 'earned',
      points: 50,
      balance: 2595,
      category: 'Bonus',
    },
    {
      id: '7',
      date: '2026-02-15',
      description: 'Birthday Month Special',
      type: 'earned',
      points: 200,
      balance: 2545,
      category: 'Bonus',
    },
    {
      id: '8',
      date: '2026-02-14',
      description: 'Valentine\'s Day Purchase',
      type: 'earned',
      points: 65,
      balance: 2345,
      category: 'Purchase',
      receiptId: 'RCP-20240214-004',
    },
    {
      id: '9',
      date: '2026-02-12',
      description: 'Pending: Pre-order Coffee Beans',
      type: 'pending',
      points: 230,
      balance: 2280,
      category: 'Purchase',
    },
    {
      id: '10',
      date: '2026-02-10',
      description: 'Free Coffee Redemption',
      type: 'redeemed',
      points: 120,
      balance: 2280,
      category: 'Reward',
    },
    {
      id: '11',
      date: '2026-02-08',
      description: 'Profile Completion Bonus',
      type: 'earned',
      points: 100,
      balance: 2400,
      category: 'Bonus',
    },
    {
      id: '12',
      date: '2026-02-05',
      description: 'Weekly Coffee Purchase',
      type: 'earned',
      points: 150,
      balance: 2300,
      category: 'Purchase',
      receiptId: 'RCP-20240205-005',
    },
    {
      id: '13',
      date: '2026-01-31',
      description: 'Points Expired - Jan 2025 Batch',
      type: 'expired',
      points: 80,
      balance: 2150,
      category: 'System',
    },
    {
      id: '14',
      date: '2026-01-28',
      description: 'Referral Bonus - Friend Signup',
      type: 'earned',
      points: 250,
      balance: 2230,
      category: 'Bonus',
    },
    {
      id: '15',
      date: '2026-01-25',
      description: 'Gift from @michael_chen',
      type: 'earned',
      points: 50,
      balance: 1980,
      category: 'Transfer',
    },
  ],
};

export const availableRewards: Reward[] = [
  {
    id: 'RW001',
    name: 'Free Regular Coffee',
    description: 'Any regular-sized hot or iced coffee',
    pointsCost: 120,
    category: 'beverage',
    imageUrl: 'coffee beverage cup',
    available: true,
  },
  {
    id: 'RW002',
    name: 'Free Pastry',
    description: 'Choose from croissant, muffin, or danish',
    pointsCost: 150,
    category: 'food',
    imageUrl: 'pastry croissant bakery',
    available: true,
  },
  {
    id: 'RW003',
    name: 'Free Large Specialty Drink',
    description: 'Any large-sized specialty beverage',
    pointsCost: 280,
    category: 'beverage',
    imageUrl: 'latte specialty coffee',
    available: true,
  },
  {
    id: 'RW004',
    name: 'Breakfast Combo',
    description: 'Coffee + breakfast sandwich or wrap',
    pointsCost: 350,
    category: 'food',
    imageUrl: 'breakfast sandwich meal',
    available: true,
  },
  {
    id: 'RW005',
    name: 'Coffee Beans 250g',
    description: 'Premium roasted coffee beans',
    pointsCost: 500,
    category: 'merchandise',
    imageUrl: 'coffee beans bag',
    available: true,
  },
  {
    id: 'RW006',
    name: 'ZUS Branded Tumbler',
    description: 'Reusable insulated tumbler - 16oz',
    pointsCost: 800,
    category: 'merchandise',
    imageUrl: 'tumbler coffee mug',
    available: true,
  },
  {
    id: 'RW007',
    name: '$10 Gift Voucher',
    description: 'Redeemable for any purchase',
    pointsCost: 1000,
    category: 'voucher',
    imageUrl: 'gift card voucher',
    available: true,
  },
  {
    id: 'RW008',
    name: 'Monthly Coffee Pass',
    description: '30 days of free regular coffee',
    pointsCost: 2500,
    category: 'voucher',
    imageUrl: 'coffee subscription pass',
    available: true,
    expiryDate: '2026-03-31',
  },
];

export const earnOpportunities = [
  {
    id: 'E001',
    title: 'Complete Your Profile',
    description: 'Add your birthday, phone number, and preferences',
    points: 100,
    completed: true,
    icon: 'user',
  },
  {
    id: 'E002',
    title: 'Download Mobile App',
    description: 'Get the ZUS Coffee app on your phone',
    points: 50,
    completed: true,
    icon: 'smartphone',
  },
  {
    id: 'E003',
    title: 'Monthly Survey',
    description: 'Share your feedback about our service',
    points: 50,
    completed: false,
    icon: 'clipboard',
  },
  {
    id: 'E004',
    title: 'Refer a Friend',
    description: 'Both get 250 points when they make first purchase',
    points: 250,
    completed: false,
    icon: 'users',
  },
  {
    id: 'E005',
    title: 'Follow on Social Media',
    description: 'Follow us on Instagram and Facebook',
    points: 30,
    completed: false,
    icon: 'share-2',
  },
  {
    id: 'E006',
    title: 'Leave a Review',
    description: 'Rate your experience on Google or App Store',
    points: 75,
    completed: false,
    icon: 'star',
  },
];


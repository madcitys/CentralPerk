function memberId(sequence) {
  return `MEM-${String(sequence).padStart(6, "0")}`;
}

function isoDate(date) {
  return new Date(date).toISOString();
}

function makeMember(sequence, input) {
  const id = memberId(sequence);
  return {
    memberId: id,
    memberNumber: id,
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    birthdate: input.birthdate,
    enrollmentDate: isoDate(input.enrollmentDate),
    profileImage: null,
    status: input.status || "Active",
    pointsBalance: input.pointsBalance,
    tier: input.tier,
  };
}

const MEMBER_SEEDS = [
  makeMember(1, {
    firstName: "Ava",
    lastName: "Santos",
    email: "ava.santos@example.com",
    phone: "+639171110001",
    birthdate: "1993-02-11",
    enrollmentDate: "2025-10-18T08:30:00.000Z",
    pointsBalance: 110,
    tier: "Bronze",
  }),
  makeMember(2, {
    firstName: "Luca",
    lastName: "Ramirez",
    email: "luca.ramirez@example.com",
    phone: "+639171110002",
    birthdate: "1991-07-22",
    enrollmentDate: "2025-11-01T10:15:00.000Z",
    pointsBalance: 265,
    tier: "Silver",
  }),
  makeMember(3, {
    firstName: "Mia",
    lastName: "Delgado",
    email: "mia.delgado@example.com",
    phone: "+639171110003",
    birthdate: "1995-01-30",
    enrollmentDate: "2025-11-19T07:50:00.000Z",
    pointsBalance: 430,
    tier: "Silver",
  }),
  makeMember(4, {
    firstName: "Noah",
    lastName: "Flores",
    email: "noah.flores@example.com",
    phone: "+639171110004",
    birthdate: "1990-03-14",
    enrollmentDate: "2025-12-04T13:10:00.000Z",
    pointsBalance: 675,
    tier: "Silver",
  }),
  makeMember(5, {
    firstName: "Ella",
    lastName: "Navarro",
    email: "ella.navarro@example.com",
    phone: "+639171110005",
    birthdate: "1997-12-09",
    enrollmentDate: "2025-12-21T11:40:00.000Z",
    pointsBalance: 880,
    tier: "Gold",
  }),
  makeMember(6, {
    firstName: "Theo",
    lastName: "Garcia",
    email: "theo.garcia@example.com",
    phone: "+639171110006",
    birthdate: "1992-10-02",
    enrollmentDate: "2026-01-06T09:20:00.000Z",
    pointsBalance: 150,
    tier: "Bronze",
  }),
  makeMember(7, {
    firstName: "Zoe",
    lastName: "Castro",
    email: "zoe.castro@example.com",
    phone: "+639171110007",
    birthdate: "1994-06-25",
    enrollmentDate: "2026-01-18T12:10:00.000Z",
    pointsBalance: 520,
    tier: "Silver",
  }),
  makeMember(8, {
    firstName: "Test",
    lastName: "Three",
    email: "test3@gmail.com",
    phone: "+639123412312",
    birthdate: "2000-04-12",
    enrollmentDate: "2026-04-03T09:30:00.000Z",
    pointsBalance: 190,
    tier: "Bronze",
  }),
  makeMember(9, {
    firstName: "Kai",
    lastName: "Mercado",
    email: "kai.mercado@example.com",
    phone: "+639171110009",
    birthdate: "1996-05-17",
    enrollmentDate: "2026-02-04T08:45:00.000Z",
    pointsBalance: 305,
    tier: "Silver",
  }),
  makeMember(10, {
    firstName: "Sofia",
    lastName: "Reyes",
    email: "sofia.reyes@example.com",
    phone: "+639171110010",
    birthdate: "1989-08-08",
    enrollmentDate: "2026-02-14T16:20:00.000Z",
    pointsBalance: 970,
    tier: "Gold",
  }),
  makeMember(11, {
    firstName: "Sound",
    lastName: "Wave",
    email: "soundwave@example.com",
    phone: "+639181112233",
    birthdate: "1994-03-22",
    enrollmentDate: "2025-10-04T10:00:00.000Z",
    pointsBalance: 625,
    tier: "Silver",
  }),
  makeMember(12, {
    firstName: "Goldie",
    lastName: "Bean",
    email: "goldie@example.com",
    phone: "+639191112233",
    birthdate: "1991-12-02",
    enrollmentDate: "2025-08-19T11:25:00.000Z",
    pointsBalance: 1120,
    tier: "Gold",
  }),
  makeMember(13, {
    firstName: "Jules",
    lastName: "Mendoza",
    email: "jules.mendoza@example.com",
    phone: "+639171110013",
    birthdate: "1998-11-26",
    enrollmentDate: "2026-03-02T09:05:00.000Z",
    pointsBalance: 240,
    tier: "Bronze",
  }),
  makeMember(14, {
    firstName: "Nina",
    lastName: "Torres",
    email: "nina.torres@example.com",
    phone: "+639171110014",
    birthdate: "1992-09-13",
    enrollmentDate: "2026-03-15T14:30:00.000Z",
    pointsBalance: 780,
    tier: "Gold",
  }),
  makeMember(15, {
    firstName: "Owen",
    lastName: "Lim",
    email: "owen.lim@example.com",
    phone: "+639171110015",
    birthdate: "1990-04-03",
    enrollmentDate: "2026-03-22T10:10:00.000Z",
    pointsBalance: 95,
    tier: "Bronze",
  }),
  makeMember(16, {
    firstName: "Priya",
    lastName: "Velasco",
    email: "priya.velasco@example.com",
    phone: "+639171110016",
    birthdate: "1993-01-18",
    enrollmentDate: "2026-04-07T07:15:00.000Z",
    pointsBalance: 560,
    tier: "Silver",
  }),
  makeMember(17, {
    firstName: "Rafi",
    lastName: "Soriano",
    email: "rafi.soriano@example.com",
    phone: "+639171110017",
    birthdate: "1988-07-29",
    enrollmentDate: "2026-04-18T09:35:00.000Z",
    pointsBalance: 130,
    tier: "Bronze",
  }),
  makeMember(18, {
    firstName: "Tala",
    lastName: "Cruz",
    email: "tala.cruz@example.com",
    phone: "+639171110018",
    birthdate: "1999-02-20",
    enrollmentDate: "2026-04-24T11:00:00.000Z",
    pointsBalance: 210,
    tier: "Bronze",
  }),
  makeMember(19, {
    firstName: "Victor",
    lastName: "Sy",
    email: "victor.sy@example.com",
    phone: "+639171110019",
    birthdate: "1987-05-09",
    enrollmentDate: "2026-04-26T15:10:00.000Z",
    pointsBalance: 710,
    tier: "Silver",
  }),
  makeMember(20, {
    firstName: "Yana",
    lastName: "Pineda",
    email: "yana.pineda@example.com",
    phone: "+639171110020",
    birthdate: "1996-10-28",
    enrollmentDate: "2026-04-27T08:20:00.000Z",
    pointsBalance: 355,
    tier: "Silver",
  }),
];

const PARTNERS = [
  {
    id: "PARTNER-001",
    partnerCode: "GRAB",
    partnerName: "Grab Food",
    description: "Delivery rewards and checkout voucher partner.",
    logoUrl: null,
    conversionRate: 10,
    isActive: true,
  },
  {
    id: "PARTNER-002",
    partnerCode: "FPANDA",
    partnerName: "Foodpanda",
    description: "Food delivery reward and flash campaign partner.",
    logoUrl: null,
    conversionRate: 10,
    isActive: true,
  },
  {
    id: "PARTNER-003",
    partnerCode: "GCASH",
    partnerName: "GCash Deals",
    description: "Cash wallet vouchers and cashback perks.",
    logoUrl: null,
    conversionRate: 12,
    isActive: true,
  },
  {
    id: "PARTNER-004",
    partnerCode: "MOVENOW",
    partnerName: "MoveNow",
    description: "Ride and commute rewards for commuter members.",
    logoUrl: null,
    conversionRate: 14,
    isActive: true,
  },
  {
    id: "PARTNER-005",
    partnerCode: "CINEMA",
    partnerName: "CinemaPass",
    description: "Movie ticket and snack bundle redemptions.",
    logoUrl: null,
    conversionRate: 15,
    isActive: true,
  },
];

const REWARDS = [
  {
    id: "REWARD-001",
    rewardCatalogId: "REWARD-001",
    name: "Free Butter Croissant",
    description: "Choose a fresh butter croissant or seasonal pastry.",
    pointsCost: 150,
    category: "food",
    imageUrl: null,
    available: true,
    active: true,
    activeFlashSaleId: "CAMP-FLASH-CROISSANT",
    flashSaleStartsAt: "2026-04-24T08:00:00.000Z",
    flashSaleEndsAt: "2026-05-02T20:00:00.000Z",
    flashSaleQuantityLimit: 40,
    flashSaleClaimedCount: 14,
    flashSaleBanner: "Flash sale pastry reward",
    flashSaleCountdownLabel: "Limited stock",
    expiryDate: "2026-12-31T23:59:59.000Z",
    partnerId: null,
    cashValue: null,
  },
  {
    id: "REWARD-002",
    rewardCatalogId: "REWARD-002",
    name: "Free Regular Coffee",
    description: "Any regular-sized hot or iced coffee.",
    pointsCost: 120,
    category: "beverage",
    imageUrl: null,
    available: true,
    active: true,
    expiryDate: "2026-12-31T23:59:59.000Z",
    partnerId: null,
    cashValue: null,
  },
  {
    id: "REWARD-003",
    rewardCatalogId: "REWARD-003",
    name: "Large Specialty Drink",
    description: "Upgrade to a large latte, mocha, or matcha.",
    pointsCost: 280,
    category: "beverage",
    imageUrl: null,
    available: true,
    active: true,
    expiryDate: "2026-12-31T23:59:59.000Z",
    partnerId: null,
    cashValue: null,
  },
  {
    id: "REWARD-004",
    rewardCatalogId: "REWARD-004",
    name: "GrabFood Voucher",
    description: "Redeem points for a Grab Food delivery voucher.",
    pointsCost: 300,
    category: "voucher",
    imageUrl: null,
    available: true,
    active: true,
    expiryDate: "2026-12-31T23:59:59.000Z",
    partnerId: "PARTNER-001",
    cashValue: 30,
  },
  {
    id: "REWARD-005",
    rewardCatalogId: "REWARD-005",
    name: "Foodpanda Free Delivery",
    description: "Partner voucher for waived delivery fee.",
    pointsCost: 240,
    category: "voucher",
    imageUrl: null,
    available: true,
    active: true,
    expiryDate: "2026-12-31T23:59:59.000Z",
    partnerId: "PARTNER-002",
    cashValue: 25,
  },
  {
    id: "REWARD-006",
    rewardCatalogId: "REWARD-006",
    name: "GCash Cashback Pack",
    description: "Pocket cashback for wallet checkout.",
    pointsCost: 340,
    category: "cashback",
    imageUrl: null,
    available: true,
    active: true,
    expiryDate: "2026-12-31T23:59:59.000Z",
    partnerId: "PARTNER-003",
    cashValue: 35,
  },
  {
    id: "REWARD-007",
    rewardCatalogId: "REWARD-007",
    name: "MoveNow Commute Pass",
    description: "Discounted ride credits for daily commuters.",
    pointsCost: 410,
    category: "transport",
    imageUrl: null,
    available: true,
    active: true,
    expiryDate: "2026-12-31T23:59:59.000Z",
    partnerId: "PARTNER-004",
    cashValue: 40,
  },
  {
    id: "REWARD-008",
    rewardCatalogId: "REWARD-008",
    name: "CinemaPass Ticket",
    description: "One movie ticket for weekend screenings.",
    pointsCost: 520,
    category: "entertainment",
    imageUrl: null,
    available: true,
    active: true,
    expiryDate: "2026-12-31T23:59:59.000Z",
    partnerId: "PARTNER-005",
    cashValue: 50,
  },
  {
    id: "REWARD-009",
    rewardCatalogId: "REWARD-009",
    name: "Breakfast Bundle",
    description: "Coffee plus pastry combo for morning visits.",
    pointsCost: 260,
    category: "bundle",
    imageUrl: null,
    available: true,
    active: true,
    expiryDate: "2026-12-31T23:59:59.000Z",
    partnerId: null,
    cashValue: null,
  },
  {
    id: "REWARD-010",
    rewardCatalogId: "REWARD-010",
    name: "Merch Tumbler",
    description: "Branded tumbler with reusable straw set.",
    pointsCost: 650,
    category: "merch",
    imageUrl: null,
    available: true,
    active: true,
    expiryDate: "2026-12-31T23:59:59.000Z",
    partnerId: null,
    cashValue: null,
  },
];

const CAMPAIGNS = [
  {
    id: "CAMP-APRIL-BOOST",
    campaignCode: "APRIL-BOOST",
    campaignName: "April Booster Weekend",
    description: "Double points for qualifying cafe spend on weekends.",
    campaignType: "multiplier_event",
    status: "active",
    multiplier: 2,
    minimumPurchaseAmount: 200,
    bonusPoints: 0,
    productScope: ["coffee", "pastry"],
    eligibleTiers: ["Bronze", "Silver", "Gold"],
    flashSaleQuantityLimit: null,
    flashSaleClaimedCount: 0,
    startsAt: "2026-04-20T00:00:00.000Z",
    endsAt: "2026-05-05T23:59:59.000Z",
    bannerTitle: "Weekend x2 Points",
    bannerMessage: "Spend PHP 200 or more and earn double points.",
    countdownLabel: "Ends soon",
    pushNotificationEnabled: true,
    budgetLimit: 2500,
    budgetSpent: 740,
    autoPause: true,
    createdAt: "2026-04-18T09:00:00.000Z",
    publishedAt: "2026-04-18T10:00:00.000Z",
  },
  {
    id: "CAMP-FLASH-CROISSANT",
    campaignCode: "FLASH-CROISSANT",
    campaignName: "Croissant Flash Sale",
    description: "Limited redemptions for the featured pastry reward.",
    campaignType: "flash_sale",
    status: "active",
    multiplier: 1,
    minimumPurchaseAmount: 0,
    bonusPoints: 25,
    productScope: ["pastry"],
    eligibleTiers: ["Bronze", "Silver", "Gold"],
    rewardId: "REWARD-001",
    flashSaleQuantityLimit: 40,
    flashSaleClaimedCount: 14,
    startsAt: "2026-04-24T08:00:00.000Z",
    endsAt: "2026-05-02T20:00:00.000Z",
    bannerTitle: "Flash Sale Reward",
    bannerMessage: "Redeem a pastry at a limited points price.",
    countdownLabel: "Limited stock",
    pushNotificationEnabled: true,
    budgetLimit: 1000,
    budgetSpent: 350,
    autoPause: true,
    createdAt: "2026-04-24T07:00:00.000Z",
    publishedAt: "2026-04-24T07:05:00.000Z",
  },
  {
    id: "CAMP-GOLD-NIGHTS",
    campaignCode: "GOLD-NIGHTS",
    campaignName: "Gold Tier Night Cups",
    description: "Late-night premium drink multipliers for gold members.",
    campaignType: "bonus_points",
    status: "active",
    multiplier: 1,
    minimumPurchaseAmount: 300,
    bonusPoints: 80,
    productScope: ["premium_drinks"],
    eligibleTiers: ["Gold"],
    rewardId: null,
    flashSaleQuantityLimit: null,
    flashSaleClaimedCount: 0,
    startsAt: "2026-04-23T17:00:00.000Z",
    endsAt: "2026-05-08T23:59:59.000Z",
    bannerTitle: "Gold Evenings",
    bannerMessage: "Premium drinks earn extra points after 5 PM.",
    countdownLabel: "Gold only",
    pushNotificationEnabled: true,
    budgetLimit: 1800,
    budgetSpent: 620,
    autoPause: true,
    createdAt: "2026-04-20T11:10:00.000Z",
    publishedAt: "2026-04-20T11:40:00.000Z",
  },
  {
    id: "CAMP-BREAKFAST-BUNDLE",
    campaignCode: "BREAKFAST-BUNDLE",
    campaignName: "Breakfast Bundle Push",
    description: "Morning combo upsell with a fixed bonus points top-up.",
    campaignType: "bonus_points",
    status: "scheduled",
    multiplier: 1,
    minimumPurchaseAmount: 180,
    bonusPoints: 35,
    productScope: ["bundle"],
    eligibleTiers: ["Bronze", "Silver"],
    rewardId: "REWARD-009",
    flashSaleQuantityLimit: null,
    flashSaleClaimedCount: 0,
    startsAt: "2026-05-02T06:00:00.000Z",
    endsAt: "2026-05-16T10:30:00.000Z",
    bannerTitle: "Breakfast is Better",
    bannerMessage: "Buy any breakfast combo and pick up bonus points.",
    countdownLabel: "Starts next week",
    pushNotificationEnabled: true,
    budgetLimit: 1200,
    budgetSpent: 0,
    autoPause: true,
    createdAt: "2026-04-26T08:15:00.000Z",
    publishedAt: null,
  },
  {
    id: "CAMP-SILVER-SPRINT",
    campaignCode: "SILVER-SPRINT",
    campaignName: "Silver Sprint Challenge",
    description: "Move bronze members toward silver with a weekly sprint.",
    campaignType: "multiplier_event",
    status: "scheduled",
    multiplier: 1.5,
    minimumPurchaseAmount: 150,
    bonusPoints: 0,
    productScope: ["all_day"],
    eligibleTiers: ["Bronze"],
    rewardId: null,
    flashSaleQuantityLimit: null,
    flashSaleClaimedCount: 0,
    startsAt: "2026-05-04T00:00:00.000Z",
    endsAt: "2026-05-18T23:59:59.000Z",
    bannerTitle: "Sprint to Silver",
    bannerMessage: "Two weeks of boosted earning for rising bronze members.",
    countdownLabel: "Upcoming",
    pushNotificationEnabled: false,
    budgetLimit: 2100,
    budgetSpent: 0,
    autoPause: true,
    createdAt: "2026-04-21T10:00:00.000Z",
    publishedAt: null,
  },
  {
    id: "CAMP-PARTNER-WALLET",
    campaignCode: "PARTNER-WALLET",
    campaignName: "Wallet Cashback Week",
    description: "Drive partner voucher usage with wallet checkout rewards.",
    campaignType: "bonus_points",
    status: "paused",
    multiplier: 1,
    minimumPurchaseAmount: 250,
    bonusPoints: 60,
    productScope: ["wallet_checkout"],
    eligibleTiers: ["Silver", "Gold"],
    rewardId: "REWARD-006",
    flashSaleQuantityLimit: null,
    flashSaleClaimedCount: 0,
    startsAt: "2026-04-10T00:00:00.000Z",
    endsAt: "2026-05-10T23:59:59.000Z",
    bannerTitle: "Wallet Week",
    bannerMessage: "Paused while the partner creative refresh is in review.",
    countdownLabel: "Paused",
    pushNotificationEnabled: true,
    budgetLimit: 1600,
    budgetSpent: 540,
    autoPause: true,
    createdAt: "2026-04-08T07:00:00.000Z",
    publishedAt: "2026-04-08T08:10:00.000Z",
  },
  {
    id: "CAMP-CINEMA-MAYHEM",
    campaignCode: "CINEMA-MAYHEM",
    campaignName: "Cinema Weekend Trade-In",
    description: "Movie ticket redemptions supported a weekend brand push.",
    campaignType: "flash_sale",
    status: "completed",
    multiplier: 1,
    minimumPurchaseAmount: 0,
    bonusPoints: 0,
    productScope: ["entertainment"],
    eligibleTiers: ["Silver", "Gold"],
    rewardId: "REWARD-008",
    flashSaleQuantityLimit: 50,
    flashSaleClaimedCount: 50,
    startsAt: "2026-04-04T10:00:00.000Z",
    endsAt: "2026-04-06T22:00:00.000Z",
    bannerTitle: "Sold Out",
    bannerMessage: "Cinema tickets were fully claimed over the launch weekend.",
    countdownLabel: "Completed",
    pushNotificationEnabled: true,
    budgetLimit: 2400,
    budgetSpent: 2400,
    autoPause: false,
    createdAt: "2026-03-30T09:40:00.000Z",
    publishedAt: "2026-03-30T11:00:00.000Z",
  },
  {
    id: "CAMP-ARCHIVE-LAUNCH",
    campaignCode: "ARCHIVE-LAUNCH",
    campaignName: "Launch Month Archive",
    description: "Archived launch campaign retained for reporting.",
    campaignType: "bonus_points",
    status: "archived",
    multiplier: 1,
    minimumPurchaseAmount: 100,
    bonusPoints: 20,
    productScope: ["launch"],
    eligibleTiers: ["Bronze", "Silver", "Gold"],
    rewardId: null,
    flashSaleQuantityLimit: null,
    flashSaleClaimedCount: 0,
    startsAt: "2026-03-01T00:00:00.000Z",
    endsAt: "2026-03-31T23:59:59.000Z",
    bannerTitle: "Archive",
    bannerMessage: "Launch campaign kept for historical comparisons.",
    countdownLabel: null,
    pushNotificationEnabled: false,
    budgetLimit: 900,
    budgetSpent: 890,
    autoPause: false,
    createdAt: "2026-02-26T08:00:00.000Z",
    publishedAt: "2026-03-01T08:20:00.000Z",
  },
];

function buildHistory(member, index) {
  if (member.memberId === "MEM-000008") {
    return [
      {
        id: "PTS-000008-004",
        type: "PENDING",
        points: 20,
        reason: "Pending delivery bonus",
        date: "2026-04-25T12:00:00.000Z",
        expiry_date: null,
        reference: "ORD-19002",
      },
      {
        id: "PTS-000008-003",
        type: "REDEEM",
        points: -30,
        reason: "Free Pastry Redemption",
        date: "2026-04-20T14:20:00.000Z",
        expiry_date: null,
        reference: "REWARD-001",
      },
      {
        id: "PTS-000008-002",
        type: "PURCHASE",
        points: 100,
        reason: "Cafe purchase points",
        date: "2026-04-16T09:40:00.000Z",
        expiry_date: "2027-04-16T09:40:00.000Z",
        reference: "ORD-19001",
      },
      {
        id: "PTS-000008-001",
        type: "MANUAL_AWARD",
        points: 120,
        reason: "Welcome package bonus",
        date: "2026-04-10T08:15:00.000Z",
        expiry_date: "2027-04-10T08:15:00.000Z",
        reference: "WELCOME-0008",
      },
    ];
  }

  const hasRedeem = index < 10;
  const purchasePoints = hasRedeem
    ? Math.max(member.pointsBalance + 55, 120)
    : Math.max(member.pointsBalance - 30, 70);
  const bonusPoints = hasRedeem ? (index % 2 === 0 ? 35 : 20) : 30;
  const redeemPoints = hasRedeem ? -(purchasePoints + bonusPoints - member.pointsBalance) : null;
  const referenceBase = member.memberId.slice(-4);
  const recentDay = 27 - (index % 6);
  const olderMonth = index >= 15 ? 2 : index >= 10 ? 3 : 4;
  const olderDay = 4 + (index % 10);
  const history = [];

  history.push({
    id: `PTS-${referenceBase}-002`,
    type: hasRedeem ? "REDEEM" : "MANUAL_AWARD",
    points: hasRedeem ? redeemPoints : bonusPoints,
    reason: hasRedeem ? "Reward redemption" : "Engagement bonus",
    date: `2026-04-${String(recentDay).padStart(2, "0")}T14:30:00.000Z`,
    expiry_date: hasRedeem ? null : "2027-04-01T00:00:00.000Z",
    reference: hasRedeem ? REWARDS[index % REWARDS.length].id : `ENGAGE-${referenceBase}`,
  });

  history.push({
    id: `PTS-${referenceBase}-001`,
    type: "PURCHASE",
    points: purchasePoints,
    reason: "Cafe purchase points",
    date: `2026-${String(olderMonth).padStart(2, "0")}-${String(olderDay).padStart(2, "0")}T09:10:00.000Z`,
    expiry_date: `2027-${String(olderMonth).padStart(2, "0")}-${String(olderDay).padStart(2, "0")}T09:10:00.000Z`,
    reference: `ORD-${referenceBase}-${String(index + 1).padStart(2, "0")}`,
  });

  return history.sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
}

function buildPointMembers() {
  return Object.fromEntries(
    MEMBER_SEEDS.map((member, index) => [
      member.memberId,
      {
        ...member,
        history: buildHistory(member, index),
      },
    ]),
  );
}

function buildCommunicationPreferences() {
  return Object.fromEntries(
    MEMBER_SEEDS.map((member, index) => [
      member.memberId,
      {
        sms: index % 3 !== 0,
        email: true,
        push: index % 5 !== 0,
        promotionalOptIn: index % 4 !== 0,
        frequency: index % 2 === 0 ? "weekly" : "daily",
      },
    ]),
  );
}

function buildNotifications() {
  const statuses = ["queued", "sent", "read", "queued", "sent"];
  const channels = ["email", "sms", "push"];
  return MEMBER_SEEDS.map((member, index) => {
    const status = statuses[index % statuses.length];
    const channel = channels[index % channels.length];
    return {
      id: `notif-${String(index + 1).padStart(3, "0")}`,
      type: channel,
      channel,
      status,
      memberId: member.memberId,
      email: channel === "email" ? member.email : null,
      phone: channel === "sms" ? member.phone : null,
      subject:
        member.memberId === "MEM-000008"
          ? "Your 190 points are ready"
          : `${member.firstName}, your loyalty update is ready`,
      message:
        member.memberId === "MEM-000008"
          ? "You now have 190 points. Redeem a pastry or keep earning toward Silver."
          : `${member.pointsBalance} points are available for your next visit.`,
      read: status === "read",
      createdAt: `2026-04-${String(27 - (index % 10)).padStart(2, "0")}T0${index % 9}:20:00.000Z`,
    };
  }).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

function buildPartnerTransactions() {
  const rows = [
    ["PARTNER-001", "MEM-000008", 450, 45, "pending", "2026-04-23T09:15:00.000Z"],
    ["PARTNER-001", "MEM-000011", 920, 92, "settled", "2026-04-18T07:45:00.000Z"],
    ["PARTNER-002", "MEM-000012", 1200, 120, "settled", "2026-04-16T11:05:00.000Z"],
    ["PARTNER-002", "MEM-000010", 680, 68, "pending", "2026-04-25T13:10:00.000Z"],
    ["PARTNER-003", "MEM-000014", 870, 72, "settled", "2026-04-21T10:30:00.000Z"],
    ["PARTNER-003", "MEM-000019", 430, 35, "pending", "2026-04-26T16:40:00.000Z"],
    ["PARTNER-004", "MEM-000016", 760, 54, "settled", "2026-04-19T08:30:00.000Z"],
    ["PARTNER-004", "MEM-000004", 510, 36, "pending", "2026-04-24T18:10:00.000Z"],
    ["PARTNER-005", "MEM-000005", 990, 66, "settled", "2026-04-14T20:20:00.000Z"],
    ["PARTNER-005", "MEM-000020", 610, 41, "pending", "2026-04-27T09:10:00.000Z"],
  ];

  return rows
    .map(([partnerId, memberIdValue, amount, points, status, createdAt], index) => {
      const partner = PARTNERS.find((item) => item.id === partnerId);
      return {
        id: `ptxn-${String(index + 1).padStart(3, "0")}`,
        partnerId,
        partnerCode: partner.partnerCode,
        partnerName: partner.partnerName,
        memberId: memberIdValue,
        amount,
        grossAmount: amount,
        points,
        status,
        createdAt,
      };
    })
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

function buildPartnerSettlements(transactions) {
  const grouped = new Map();
  for (const transaction of transactions) {
    if (transaction.status !== "settled") continue;
    const key = `${transaction.partnerId}-2026-04`;
    const current =
      grouped.get(key) ||
      {
        id: `set-${transaction.partnerId}-2026-04`,
        partnerId: transaction.partnerId,
        partnerCode: transaction.partnerCode,
        partnerName: transaction.partnerName,
        month: "2026-04",
        amount: 0,
        grossAmount: 0,
        commissionAmount: 0,
        transactionIds: [],
        status: transaction.partnerId === "PARTNER-005" ? "paid" : "pending",
        createdAt: "2026-04-25T10:00:00.000Z",
        updatedAt: "2026-04-25T10:00:00.000Z",
      };
    current.amount += transaction.grossAmount;
    current.grossAmount += transaction.grossAmount;
    current.commissionAmount = Number((current.grossAmount * 0.12).toFixed(2));
    current.transactionIds.push(transaction.id);
    if (current.status === "paid") current.paidAt = "2026-04-26T12:00:00.000Z";
    grouped.set(key, current);
  }
  return Array.from(grouped.values()).sort((left, right) => left.partnerName.localeCompare(right.partnerName));
}

function buildSegments() {
  const highValueMembers = MEMBER_SEEDS.filter((member) => member.pointsBalance >= 600).map((member) => member.memberId);
  const bronzeBuilders = MEMBER_SEEDS.filter((member) => member.pointsBalance >= 150 && member.pointsBalance < 250).map((member) => member.memberId);
  const newThisMonth = MEMBER_SEEDS.filter((member) => member.enrollmentDate >= "2026-04-01T00:00:00.000Z").map((member) => member.memberId);
  const partnerExplorers = ["MEM-000005", "MEM-000008", "MEM-000010", "MEM-000014", "MEM-000016", "MEM-000020"];
  const dormant = ["MEM-000001", "MEM-000002", "MEM-000003", "MEM-000015"];

  return {
    "SEG-HIGH-VALUE": {
      id: "SEG-HIGH-VALUE",
      name: "High Value Members",
      description: "Members with strong balances and repeat activity.",
      is_system: true,
      logicMode: "AND",
      conditions: [{ id: "points-above-600", field: "Points Balance", operator: "greater than", value: "600" }],
      memberIds: highValueMembers,
      created_at: "2026-04-01T09:00:00.000Z",
      updated_at: "2026-04-21T09:00:00.000Z",
    },
    "SEG-ACTIVE-30": {
      id: "SEG-ACTIVE-30",
      name: "Recently Active",
      description: "Members active in the last 30 days.",
      is_system: true,
      logicMode: "AND",
      conditions: [{ id: "last-activity-30", field: "Last Activity", operator: "within", value: "30" }],
      memberIds: MEMBER_SEEDS.filter((member) => !["MEM-000001", "MEM-000002", "MEM-000015"].includes(member.memberId)).map((member) => member.memberId),
      created_at: "2026-04-01T09:00:00.000Z",
      updated_at: "2026-04-21T09:00:00.000Z",
    },
    "SEG-BRONZE-BUILDERS": {
      id: "SEG-BRONZE-BUILDERS",
      name: "Bronze Builders",
      description: "Bronze members approaching the next tier.",
      is_system: false,
      logicMode: "AND",
      conditions: [
        { id: "tier-bronze", field: "Tier", operator: "is", value: "Bronze" },
        { id: "points-above-150", field: "Points Balance", operator: "greater than", value: "150" },
      ],
      memberIds: bronzeBuilders,
      created_at: "2026-04-11T09:00:00.000Z",
      updated_at: "2026-04-21T09:00:00.000Z",
    },
    "SEG-NEW-MONTH": {
      id: "SEG-NEW-MONTH",
      name: "New Members This Month",
      description: "Freshly enrolled members for onboarding follow-ups.",
      is_system: false,
      logicMode: "AND",
      conditions: [{ id: "joined-april", field: "Last Activity", operator: "within", value: "30" }],
      memberIds: newThisMonth,
      created_at: "2026-04-20T10:00:00.000Z",
      updated_at: "2026-04-26T08:40:00.000Z",
    },
    "SEG-PARTNER-EXPLORERS": {
      id: "SEG-PARTNER-EXPLORERS",
      name: "Partner Explorers",
      description: "Members frequently redeeming partner-linked benefits.",
      is_system: false,
      logicMode: "OR",
      conditions: [
        { id: "tier-silver-up", field: "Tier", operator: "is", value: "Silver" },
        { id: "points-above-300", field: "Points Balance", operator: "greater than", value: "300" },
      ],
      memberIds: partnerExplorers,
      created_at: "2026-04-22T13:00:00.000Z",
      updated_at: "2026-04-26T13:00:00.000Z",
    },
    "SEG-DORMANT-60": {
      id: "SEG-DORMANT-60",
      name: "Dormant 60+ Days",
      description: "Members ready for win-back communication.",
      is_system: true,
      logicMode: "AND",
      conditions: [{ id: "last-activity-60", field: "Last Activity", operator: "more than", value: "60" }],
      memberIds: dormant,
      created_at: "2026-04-12T09:30:00.000Z",
      updated_at: "2026-04-24T17:30:00.000Z",
    },
  };
}

export function createSeedState() {
  const partnerTransactions = buildPartnerTransactions();
  return {
    idempotency: {},
    partners: Object.fromEntries(PARTNERS.map((partner) => [partner.id, partner])),
    rewards: Object.fromEntries(REWARDS.map((reward) => [reward.id, reward])),
    partnerTransactions,
    partnerSettlements: buildPartnerSettlements(partnerTransactions),
    pointMembers: buildPointMembers(),
    campaigns: Object.fromEntries(CAMPAIGNS.map((campaign) => [campaign.id, campaign])),
    segments: buildSegments(),
    notifications: buildNotifications(),
    communicationPreferences: buildCommunicationPreferences(),
  };
}

export function summarizeSeedState(state) {
  const members = Object.keys(state.pointMembers || {}).length;
  const pointsLedgerRows = Object.values(state.pointMembers || {}).reduce(
    (sum, member) => sum + (Array.isArray(member.history) ? member.history.length : 0),
    0,
  );
  const redemptions = Object.values(state.pointMembers || {}).reduce(
    (sum, member) =>
      sum +
      (Array.isArray(member.history)
        ? member.history.filter((entry) => String(entry.type || "").toUpperCase().includes("REDEEM")).length
        : 0),
    0,
  );

  return {
    members,
    pointsLedgerRows,
    rewards: Object.keys(state.rewards || {}).length,
    campaigns: Object.keys(state.campaigns || {}).length,
    segments: Object.keys(state.segments || {}).length,
    partners: Object.keys(state.partners || {}).length,
    notifications: Array.isArray(state.notifications) ? state.notifications.length : 0,
    redemptions,
    partnerTransactions: Array.isArray(state.partnerTransactions) ? state.partnerTransactions.length : 0,
    partnerSettlements: Array.isArray(state.partnerSettlements) ? state.partnerSettlements.length : 0,
  };
}

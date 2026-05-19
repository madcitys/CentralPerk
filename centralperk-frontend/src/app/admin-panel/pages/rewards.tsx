import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Megaphone, PlusCircle, Sparkles, Zap, type LucideIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { CalendarDateTimePicker } from "../../../components/calendar-date-time-picker";
import { Card } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { Textarea } from "../../../components/ui/textarea";
import { useAdminData } from "../hooks/use-admin-data";
import {
  adminDarkButtonClass,
  adminEyebrowClass,
  adminInputClass,
  adminMetricPanelClass,
  adminMetricVariantClass,
  adminPageDescriptionClass,
  adminPageHeroClass,
  adminPageHeroInnerClass,
  adminPageShellClass,
  adminPageTitleClass,
  adminPanelClass,
  adminPanelSoftClass,
  adminSelectClass,
} from "../lib/page-theme";
import {
  loadCampaignPerformance,
  loadPromotionCampaigns,
  loadPartnerPerformance,
  loadRewardPartners,
  saveRewardPartner,
  toggleRewardPartner,
  type CampaignPerformance,
  type PromotionCampaign,
  type RewardPartner,
  type RewardPartnerPerformance,
} from "../../lib/promotions";
import {
  loadActiveCampaignsViaApi,
  loadPartnerDashboardViaApi,
  loadRewardsViaApi,
  publishCampaignViaApi,
  saveCampaignViaApi,
  triggerPartnerSettlementViaApi,
} from "../../lib/api";
import type { Reward } from "../../types/loyalty";

function toInputDate(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type RewardsTab = "overview" | "campaigns" | "flash" | "partners";
type CampaignWizardStep = 1 | 2 | 3;
type CampaignPerformanceTab = "overview" | "audience" | "engagement" | "financials";

const rewardsTabs: { value: RewardsTab; label: string; hash: string }[] = [
  { value: "overview", label: "Overview", hash: "#rewards-overview" },
  { value: "campaigns", label: "Campaigns", hash: "#rewards-campaigns" },
  { value: "flash", label: "Flash Sales", hash: "#rewards-flash" },
  { value: "partners", label: "Partners", hash: "#rewards-partners" },
];

type CampaignFormState = {
  campaignCode: string;
  campaignName: string;
  description: string;
  campaignType: "bonus_points" | "flash_sale" | "multiplier_event";
  multiplier: string;
  minimumPurchaseAmount: string;
  bonusPoints: string;
  productScope: string;
  eligibleTiers: string;
  rewardId: string;
  flashSaleQuantityLimit: string;
  startsAt: string;
  endsAt: string;
  bannerTitle: string;
  bannerMessage: string;
  countdownLabel: string;
  pushNotificationEnabled: boolean;
};

type CampaignTemplate = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  build: (context: { firstRewardId: string }) => Partial<CampaignFormState>;
};

function toInputDateTime(value: Date) {
  const hours = `${value.getHours()}`.padStart(2, "0");
  const minutes = `${value.getMinutes()}`.padStart(2, "0");
  return `${toInputDate(value)}T${hours}:${minutes}`;
}

function nextSeasonWindow(startMonth: number, startDay: number, endMonth: number, endDay: number) {
  const now = new Date();
  let startYear = now.getFullYear();
  let start = new Date(startYear, startMonth - 1, startDay, 8, 0, 0, 0);
  if (start.getTime() < now.getTime()) {
    startYear += 1;
    start = new Date(startYear, startMonth - 1, startDay, 8, 0, 0, 0);
  }
  const endYear = endMonth < startMonth ? startYear + 1 : startYear;
  const end = new Date(endYear, endMonth - 1, endDay, 23, 59, 0, 0);
  return { startsAt: toInputDateTime(start), endsAt: toInputDateTime(end), year: startYear };
}

function nextPaydayWindow() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const candidates = [15, lastDay].map((day) => new Date(year, month, day, 8, 0, 0, 0));
  const start = candidates.find((candidate) => candidate.getTime() >= now.getTime()) ?? new Date(year, month + 1, 15, 8, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 2);
  end.setHours(23, 59, 0, 0);
  return { startsAt: toInputDateTime(start), endsAt: toInputDateTime(end), stamp: `${start.getFullYear()}${`${start.getMonth() + 1}`.padStart(2, "0")}${`${start.getDate()}`.padStart(2, "0")}` };
}

function nextWeekWindow() {
  const now = new Date();
  const start = new Date(now);
  const daysUntilMonday = (8 - start.getDay()) % 7 || 7;
  start.setDate(now.getDate() + daysUntilMonday);
  start.setHours(8, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 0, 0);
  return { startsAt: toInputDateTime(start), endsAt: toInputDateTime(end), stamp: `${start.getFullYear()}${`${start.getMonth() + 1}`.padStart(2, "0")}${`${start.getDate()}`.padStart(2, "0")}` };
}

function buildDefaultCampaignForm(): CampaignFormState {
  return {
    campaignCode: "",
    campaignName: "",
    description: "",
    campaignType: "bonus_points",
    multiplier: "2",
    minimumPurchaseAmount: "50",
    bonusPoints: "25",
    productScope: "",
    eligibleTiers: "Bronze,Silver,Gold",
    rewardId: "",
    flashSaleQuantityLimit: "100",
    startsAt: `${toInputDate(new Date())}T08:00`,
    endsAt: `${toInputDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))}T23:59`,
    bannerTitle: "",
    bannerMessage: "",
    countdownLabel: "",
    pushNotificationEnabled: false,
  };
}

const campaignTemplates: CampaignTemplate[] = [
  {
    id: "new-year",
    eyebrow: "Occasion",
    title: "New Year Rewards Boost",
    description: "Seasonal multiplier campaign for the year-end and New Year earning window.",
    icon: Sparkles,
    build: () => {
      const window = nextSeasonWindow(12, 26, 1, 7);
      return {
        campaignCode: `NEWYEAR-${window.year + 1}`,
        campaignName: "New Year Rewards Boost",
        description: "Members earn extra points during the New Year rewards window.",
        campaignType: "multiplier_event",
        multiplier: "2",
        minimumPurchaseAmount: "50",
        bonusPoints: "0",
        productScope: "pharmacy, wellness, voucher",
        eligibleTiers: "Bronze,Silver,Gold,Platinum",
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        bannerTitle: "New Year Rewards Boost",
        bannerMessage: "Earn extra points on eligible purchases during the New Year celebration.",
        countdownLabel: "New Year offer",
        pushNotificationEnabled: true,
      };
    },
  },
  {
    id: "payday-flash",
    eyebrow: "Flash Sale",
    title: "Payday Flash Sale",
    description: "Quick flash sale template linked to a catalog reward so it appears in Customer Rewards.",
    icon: Zap,
    build: ({ firstRewardId }) => {
      const window = nextPaydayWindow();
      return {
        campaignCode: `PAYDAY-FLASH-${window.stamp}`,
        campaignName: "Payday Flash Sale",
        description: "Limited payday reward allocation for fast voucher redemption.",
        campaignType: "flash_sale",
        multiplier: "1",
        minimumPurchaseAmount: "0",
        bonusPoints: "0",
        rewardId: firstRewardId,
        flashSaleQuantityLimit: "100",
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        bannerTitle: "Payday Flash Sale",
        bannerMessage: "Redeem selected rewards before the payday flash sale allocation runs out.",
        countdownLabel: "Payday flash sale",
        pushNotificationEnabled: true,
      };
    },
  },
  {
    id: "wellness-week",
    eyebrow: "Bonus Points",
    title: "Wellness Week Bonus",
    description: "Guided bonus campaign for pharmacy and wellness categories.",
    icon: CalendarClock,
    build: () => {
      const window = nextWeekWindow();
      return {
        campaignCode: `WELLNESS-WEEK-${window.stamp}`,
        campaignName: "Wellness Week Bonus",
        description: "Members earn bonus points on eligible wellness and pharmacy purchases.",
        campaignType: "bonus_points",
        multiplier: "1",
        minimumPurchaseAmount: "100",
        bonusPoints: "100",
        productScope: "pharmacy, wellness",
        eligibleTiers: "Bronze,Silver,Gold,Platinum",
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        bannerTitle: "Wellness Week Bonus",
        bannerMessage: "Earn bonus points while shopping eligible wellness essentials.",
        countdownLabel: "Wellness week",
        pushNotificationEnabled: false,
      };
    },
  },
  {
    id: "member-appreciation",
    eyebrow: "Engagement",
    title: "Member Appreciation",
    description: "Simple bonus campaign for broad member engagement and retention.",
    icon: Megaphone,
    build: () => {
      const window = nextWeekWindow();
      return {
        campaignCode: `MEMBER-THANKS-${window.stamp}`,
        campaignName: "Member Appreciation Bonus",
        description: "Members earn a bonus reward for participating in the appreciation campaign.",
        campaignType: "bonus_points",
        multiplier: "1",
        minimumPurchaseAmount: "0",
        bonusPoints: "50",
        productScope: "",
        eligibleTiers: "Bronze,Silver,Gold,Platinum",
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        bannerTitle: "Member Appreciation Bonus",
        bannerMessage: "A limited member appreciation campaign is available now.",
        countdownLabel: "Member appreciation",
        pushNotificationEnabled: true,
      };
    },
  },
];

export default function AdminRewardsPage() {
  const { loading, error, metrics, rewardsCatalog, refetch } = useAdminData();
  const [activeTab, setActiveTab] = useState<RewardsTab>("overview");
  const [campaigns, setCampaigns] = useState<PromotionCampaign[]>([]);
  const [campaignPerformance, setCampaignPerformance] = useState<CampaignPerformance[]>([]);
  const [campaignRewardOptions, setCampaignRewardOptions] = useState<Reward[]>([]);
  const [partners, setPartners] = useState<RewardPartner[]>([]);
  const [partnerPerformance, setPartnerPerformance] = useState<RewardPartnerPerformance[]>([]);
  const [partnerDashboardRows, setPartnerDashboardRows] = useState<
    Array<{
      partner: {
        id: string;
        partnerCode: string;
        partnerName: string;
        description: string | null;
        logoUrl: string | null;
        conversionRate: number;
        isActive: boolean;
      };
      totals: {
        transactions: number;
        pendingTransactions: number;
        settledTransactions: number;
        points: number;
        grossAmount: number;
        totalCommission: number;
      };
    }>
  >([]);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [savingPartner, setSavingPartner] = useState(false);
  const [publishingCampaignId, setPublishingCampaignId] = useState<string | null>(null);
  const [settlingPartnerId, setSettlingPartnerId] = useState<string | null>(null);
  const [campaignWizardStep, setCampaignWizardStep] = useState<CampaignWizardStep>(1);
  const [campaignPerformanceTab, setCampaignPerformanceTab] = useState<CampaignPerformanceTab>("overview");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [performanceWindow, setPerformanceWindow] = useState<"7d" | "30d" | "90d">("30d");
  const [campaignStatusFilter, setCampaignStatusFilter] = useState<"all" | "active" | "draft" | "paused" | "completed">("all");
  const [abTestEnabled, setAbTestEnabled] = useState(true);
  const [abAudienceSplit, setAbAudienceSplit] = useState("50 / 50");
  const [abSuccessMetric, setAbSuccessMetric] = useState("redemption_rate");
  const [variantAName, setVariantAName] = useState("Default banner");
  const [variantBName, setVariantBName] = useState("Urgency banner");
  const [campaignForm, setCampaignForm] = useState<CampaignFormState>(() => buildDefaultCampaignForm());
  const [partnerForm, setPartnerForm] = useState({
    partnerCode: "",
    partnerName: "",
    description: "",
    logoUrl: "",
    conversionRate: "12",
    isActive: true,
  });

  const reload = async () => {
    const [campaignRows, performanceRows, rewardCatalogResponse, partnerRows, partnerPerfRows, partnerDashboardResponse] = await Promise.all([
      loadPromotionCampaigns(),
      loadCampaignPerformance(),
      loadRewardsViaApi().catch(() => ({ ok: true as const, rewards: [] })),
      loadRewardPartners(),
      loadPartnerPerformance(),
      loadPartnerDashboardViaApi().catch(() => ({ ok: true as const, partners: [] })),
    ]);
    setCampaigns(campaignRows);
    setCampaignPerformance(performanceRows);
    setCampaignRewardOptions(rewardCatalogResponse.rewards);
    setPartners(partnerRows);
    setPartnerPerformance(partnerPerfRows);
    setPartnerDashboardRows(partnerDashboardResponse.partners);
  };

  useEffect(() => {
    reload().catch(() => {
      setCampaigns([]);
      setCampaignPerformance([]);
      setCampaignRewardOptions([]);
      setPartners([]);
      setPartnerPerformance([]);
      setPartnerDashboardRows([]);
    });
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadActiveCampaignsViaApi()
        .then((response) => {
          setCampaigns((prev) =>
            prev.map((campaign) => {
              const active = response.campaigns.find((item) => item.id === campaign.id);
              return active ? { ...campaign, ...active } : campaign;
            })
          );
        })
        .catch(() => undefined);
    }, 30_000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    const matchedTab = rewardsTabs.find((tab) => tab.hash === hash);
    if (matchedTab) {
      setActiveTab(matchedTab.value);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const current = rewardsTabs.find((tab) => tab.value === activeTab);
    if (!current) return;
    const nextUrl = `${window.location.pathname}${window.location.search}${current.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, [activeTab]);

  const campaignPerformanceById = useMemo(
    () => new Map(campaignPerformance.map((row) => [row.campaignId, row])),
    [campaignPerformance]
  );
  const flashSales = useMemo(
    () => campaigns.filter((campaign) => campaign.campaignType === "flash_sale"),
    [campaigns]
  );
  const rewardsByPartner = useMemo(() => {
    const next = new Map<string, typeof rewardsCatalog>();
    for (const reward of rewardsCatalog) {
      const key = reward.partner_id ? String(reward.partner_id) : "";
      if (!key) continue;
      next.set(key, [...(next.get(key) || []), reward]);
    }
    return next;
  }, [rewardsCatalog]);
  const campaignComparisonChart = useMemo(
    () =>
      campaigns.slice(0, 6).map((campaign) => {
        const performance = campaignPerformanceById.get(campaign.id);
        return {
          label: campaign.campaignCode || campaign.campaignName.slice(0, 10),
          pointsAwarded: performance?.pointsAwarded ?? 0,
          redemptions: performance?.redemptionCount ?? 0,
        };
      }),
    [campaignPerformanceById, campaigns]
  );
  const flashPerformanceChart = useMemo(
    () =>
      flashSales.slice(0, 6).map((campaign) => {
        const performance = campaignPerformanceById.get(campaign.id);
        return {
          label: campaign.campaignCode || campaign.campaignName.slice(0, 10),
          sellThrough: performance?.sellThrough ?? 0,
          claimed: performance?.quantityClaimed ?? campaign.flashSaleClaimedCount ?? 0,
        };
      }),
    [campaignPerformanceById, flashSales]
  );
  const partnerRedemptionChart = useMemo(
    () =>
      partners
        .map((partner) => {
          const performance = partnerPerformance.find((row) => row.id === partner.id);
          return {
            name: partner.partnerName,
            value: performance?.redemptionCount ?? 0,
          };
        })
        .filter((entry) => entry.value > 0)
        .slice(0, 6),
    [partnerPerformance, partners]
  );

  const partnerDashboardSummary = useMemo(() => {
    const totals = partnerDashboardRows.reduce(
      (acc, row) => {
        acc.activePartners += row.partner.isActive ? 1 : 0;
        acc.totalRedemptions += row.totals.transactions;
        acc.totalSettlementValue += row.totals.grossAmount;
        acc.totalCommission += row.totals.totalCommission;
        return acc;
      },
      { activePartners: 0, totalRedemptions: 0, totalSettlementValue: 0, totalCommission: 0 }
    );

    const topPartner = [...partnerDashboardRows]
      .map((row) => ({
        name: row.partner.partnerName,
        pointsRedeemed: row.totals.points,
        redemptions: row.totals.transactions,
      }))
      .sort((left, right) => right.pointsRedeemed - left.pointsRedeemed)[0] ?? null;

    return { ...totals, topPartner };
  }, [partnerDashboardRows]);
  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => String(campaign.id) === selectedCampaignId) ?? campaigns[0] ?? null,
    [campaigns, selectedCampaignId]
  );
  const selectedCampaignPerformance = useMemo(() => {
    if (!selectedCampaign) return null;
    return campaignPerformanceById.get(selectedCampaign.id) ?? null;
  }, [campaignPerformanceById, selectedCampaign]);
  const campaignListRows = useMemo(
    () =>
      campaigns.map((campaign) => {
        const performance = campaignPerformanceById.get(campaign.id);
        const pointsAwarded = performance?.pointsAwarded ?? 0;
        const redemptions = performance?.redemptionCount ?? 0;
        const roi = pointsAwarded > 0 ? ((redemptions * 125) / pointsAwarded) * 100 : 0;
        const redemptionRate = performance?.trackedTransactions
          ? (redemptions / performance.trackedTransactions) * 100
          : redemptions > 0
          ? 100
          : 0;

        return {
          campaign,
          performance,
          roi,
          redemptionRate,
        };
      }),
    [campaignPerformanceById, campaigns]
  );
  const visibleCampaignListRows = useMemo(
    () =>
      campaignListRows.filter(({ campaign }) =>
        campaignStatusFilter === "all" ? true : campaign.status === campaignStatusFilter
      ),
    [campaignListRows, campaignStatusFilter]
  );
  const firstRewardId = useMemo(() => {
    const firstReward = campaignRewardOptions.find((reward) => reward.available && reward.rewardCatalogId);
    return firstReward?.rewardCatalogId !== undefined && firstReward?.rewardCatalogId !== null ? String(firstReward.rewardCatalogId) : "";
  }, [campaignRewardOptions]);

  const buildCampaignPayload = () => ({
    campaignCode: campaignForm.campaignCode,
    campaignName: campaignForm.campaignName,
    description: campaignForm.description,
    campaignType: campaignForm.campaignType,
    status: "scheduled",
    multiplier: Number(campaignForm.multiplier || 1),
    minimumPurchaseAmount: Number(campaignForm.minimumPurchaseAmount || 0),
    bonusPoints: Number(campaignForm.bonusPoints || 0),
    productScope: campaignForm.productScope.split(",").map((v) => v.trim()).filter(Boolean),
    eligibleTiers: campaignForm.eligibleTiers.split(",").map((v) => v.trim()).filter(Boolean),
    rewardId: campaignForm.rewardId ? Number(campaignForm.rewardId) : null,
    flashSaleQuantityLimit: campaignForm.campaignType === "flash_sale" ? Number(campaignForm.flashSaleQuantityLimit || 0) : null,
    startsAt: new Date(campaignForm.startsAt).toISOString(),
    endsAt: new Date(campaignForm.endsAt).toISOString(),
    bannerTitle: campaignForm.bannerTitle || null,
    bannerMessage: campaignForm.bannerMessage || null,
    countdownLabel: campaignForm.countdownLabel || null,
    pushNotificationEnabled: campaignForm.pushNotificationEnabled,
  });

  const validateCampaignForm = () => {
    if (!campaignForm.campaignCode.trim() || !campaignForm.campaignName.trim()) {
      toast.error("Campaign code and name are required.");
      return false;
    }
    if (campaignForm.campaignType === "flash_sale" && !campaignForm.rewardId) {
      toast.error("Flash sales need a linked reward so they can appear in Customer Rewards.");
      return false;
    }
    return true;
  };

  const startBlankCampaign = (campaignType: CampaignFormState["campaignType"] = "bonus_points") => {
    const next = buildDefaultCampaignForm();
    setCampaignForm({
      ...next,
      campaignType,
      rewardId: campaignType === "flash_sale" ? firstRewardId : "",
      flashSaleQuantityLimit: campaignType === "flash_sale" ? next.flashSaleQuantityLimit : "0",
    });
    setSelectedCampaignId("");
    setCampaignWizardStep(1);
    setActiveTab("campaigns");
  };

  const applyCampaignTemplate = (template: CampaignTemplate) => {
    const patch = template.build({ firstRewardId });
    setCampaignForm((prev) => ({
      ...prev,
      ...patch,
      rewardId: patch.campaignType === "flash_sale" ? patch.rewardId || prev.rewardId || firstRewardId : patch.rewardId ?? prev.rewardId,
    }));
    setSelectedCampaignId("");
    setCampaignWizardStep(1);
    setActiveTab("campaigns");
    if (patch.campaignType === "flash_sale" && !patch.rewardId && !firstRewardId) {
      toast.warning("Template applied. Select a reward link before saving the flash sale.");
      return;
    }
    toast.success(`${template.title} template applied.`);
  };

  useEffect(() => {
    if (!selectedCampaignId && campaigns[0]?.id) {
      setSelectedCampaignId(String(campaigns[0].id));
    }
  }, [campaigns, selectedCampaignId]);

  const handleSaveCampaign = async () => {
    if (!validateCampaignForm()) return;
    try {
      setSavingCampaign(true);
      const response = await saveCampaignViaApi(buildCampaignPayload());
      setSelectedCampaignId(response.campaign.id);
      await Promise.all([reload(), refetch()]);
      toast.success("Campaign saved.");
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Unable to save campaign.");
    } finally {
      setSavingCampaign(false);
    }
  };

  const handleSaveAndPublishCampaign = async () => {
    if (!validateCampaignForm()) return;
    try {
      setSavingCampaign(true);
      const response = await saveCampaignViaApi(buildCampaignPayload());
      setSelectedCampaignId(response.campaign.id);
      setPublishingCampaignId(response.campaign.id);
      await publishCampaignViaApi(response.campaign.id, Boolean(campaignForm.pushNotificationEnabled));
      await Promise.all([reload(), refetch()]);
      toast.success("Campaign saved and published.");
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Unable to save and publish campaign.");
    } finally {
      setSavingCampaign(false);
      setPublishingCampaignId(null);
    }
  };

  const handlePublishCampaign = async (campaignId: string, queueNotifications = false) => {
    try {
      setPublishingCampaignId(campaignId);
      await publishCampaignViaApi(campaignId, queueNotifications);
      await Promise.all([reload(), refetch()]);
      toast.success("Campaign published.");
    } catch (publishError) {
      toast.error(publishError instanceof Error ? publishError.message : "Unable to publish campaign.");
    } finally {
      setPublishingCampaignId(null);
    }
  };

  const handleSavePartner = async () => {
    if (!partnerForm.partnerCode.trim() || !partnerForm.partnerName.trim()) {
      toast.error("Partner code and name are required.");
      return;
    }
    try {
      setSavingPartner(true);
      await saveRewardPartner({
        partnerCode: partnerForm.partnerCode,
        partnerName: partnerForm.partnerName,
        description: partnerForm.description,
        logoUrl: partnerForm.logoUrl,
        conversionRate: Number(partnerForm.conversionRate || 1),
        isActive: partnerForm.isActive,
      });
      await reload();
      await refetch();
      toast.success("Partner saved.");
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Unable to save partner.");
    } finally {
      setSavingPartner(false);
    }
  };

  const handleSettlePartner = async (partnerId: string) => {
    try {
      setSettlingPartnerId(partnerId);
      const response = await triggerPartnerSettlementViaApi(partnerId);
      await reload();
      window.open(`/api/partners/settlements/${response.settlement.id}/pdf`, "_blank", "noopener,noreferrer");
      toast.success("Settlement created.");
    } catch (settlementError) {
      toast.error(settlementError instanceof Error ? settlementError.message : "Unable to create settlement.");
    } finally {
      setSettlingPartnerId(null);
    }
  };

  if (loading) return <p className="text-base text-gray-700">Loading rewards data...</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div className={adminPageShellClass}>
      <div className={adminPageHeroClass}>
        <div className={adminPageHeroInnerClass}>
          <div className={adminEyebrowClass}>Rewards Engine</div>
          <h1 className={adminPageTitleClass}>Campaigns & Promotions</h1>
          <p className={adminPageDescriptionClass}>
            Published campaigns, flash sales, partners, and reward links feed the customer rewards catalog through the same service-backed APIs.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as RewardsTab)} className="space-y-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="overflow-x-auto pb-1">
            <TabsList className="h-auto min-w-max flex-nowrap justify-start gap-1 rounded-full border border-[#d6e0f7] bg-[linear-gradient(180deg,#f8fbff_0%,#eef4ff_100%)] p-1 shadow-[0_10px_24px_rgba(16,33,58,0.04)]">
              <TabsTrigger value="overview" className="rounded-full px-4 py-2 data-[state=active]:bg-white data-[state=active]:ring-2 data-[state=active]:ring-[#2b4468]">Overview</TabsTrigger>
              <TabsTrigger value="campaigns" className="rounded-full px-4 py-2 data-[state=active]:bg-white data-[state=active]:ring-2 data-[state=active]:ring-[#2b4468]">Campaigns</TabsTrigger>
              <TabsTrigger value="flash" className="rounded-full px-4 py-2 data-[state=active]:bg-white data-[state=active]:ring-2 data-[state=active]:ring-[#2b4468]">Flash Sales</TabsTrigger>
              <TabsTrigger value="partners" className="rounded-full px-4 py-2 data-[state=active]:bg-white data-[state=active]:ring-2 data-[state=active]:ring-[#2b4468]">Partners</TabsTrigger>
            </TabsList>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className={adminDarkButtonClass} onClick={() => startBlankCampaign()}>
              <PlusCircle className="mr-2 h-4 w-4" />
              New Campaign
            </Button>
            <Button type="button" variant="outline" onClick={() => applyCampaignTemplate(campaignTemplates.find((template) => template.id === "payday-flash") ?? campaignTemplates[0])}>
              <Zap className="mr-2 h-4 w-4" />
              Flash Sale Template
            </Button>
          </div>
        </div>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
            <Card className={`${adminMetricPanelClass} ${adminMetricVariantClass(0)}`}><p className="text-sm text-gray-500">Points Liability</p><p className="mt-2 text-3xl font-bold text-gray-900">{metrics.pointsLiability.toLocaleString()}</p></Card>
            <Card className={`${adminMetricPanelClass} ${adminMetricVariantClass(1)}`}><p className="text-sm text-gray-500">Redeemed (6m)</p><p className="mt-2 text-3xl font-bold text-gray-900">{metrics.redemptionSeries.reduce((sum, point) => sum + point.value, 0).toLocaleString()}</p></Card>
            <Card className={`${adminMetricPanelClass} ${adminMetricVariantClass(2)}`}><p className="text-sm text-gray-500">Active Campaigns</p><p className="mt-2 text-3xl font-bold text-gray-900">{campaigns.filter((campaign) => campaign.status === "active").length}</p></Card>
            <Card className={`${adminMetricPanelClass} ${adminMetricVariantClass(3)}`}><p className="text-sm text-gray-500">Active Partners</p><p className="mt-2 text-3xl font-bold text-gray-900">{partners.filter((partner) => partner.isActive).length}</p></Card>
          </div>

          <Card className={adminPanelClass}>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Liability Trend</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metrics.liabilityTrend}>
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="points" stroke="#1A2B47" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Card className={adminPanelClass}>
              <h2 className="text-lg font-semibold text-gray-900">Campaign Comparison</h2>
              <p className="mt-1 text-sm text-gray-500">Quick read on which campaigns drive points and redemptions.</p>
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={campaignComparisonChart} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid stroke="#dbe8f6" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "#5b6475", fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: "#5b6475", fontSize: 12 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 16, borderColor: "#dbe8f6" }} />
                    <Bar dataKey="pointsAwarded" name="Points Awarded" radius={[8, 8, 0, 0]} fill="#0fa7b4" />
                    <Bar dataKey="redemptions" name="Redemptions" radius={[8, 8, 0, 0]} fill="#1A2B47" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className={adminPanelClass}>
              <h2 className="text-lg font-semibold text-gray-900">Flash Sale Sell-through</h2>
              <p className="mt-1 text-sm text-gray-500">Which flash drops are converting fastest and clearing inventory.</p>
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={flashPerformanceChart} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid stroke="#dbe8f6" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "#5b6475", fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: "#5b6475", fontSize: 12 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 16, borderColor: "#dbe8f6" }} />
                    <Bar dataKey="sellThrough" name="Sell-through (%)" radius={[8, 8, 0, 0]} fill="#f59e0b" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className={adminPanelClass}>
              <h2 className="text-lg font-semibold text-gray-900">Partner Redemption Share</h2>
              <p className="mt-1 text-sm text-gray-500">Top partners by redeemed rewards volume.</p>
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={partnerRedemptionChart} dataKey="value" nameKey="name" innerRadius={50} outerRadius={88} paddingAngle={3}>
                      {partnerRedemptionChart.map((entry, index) => (
                        <Cell
                          key={`${entry.name}-${index}`}
                          fill={["#0fa7b4", "#1A2B47", "#6d4ce6", "#f59e0b", "#14b8a6", "#94a3b8"][index % 6]}
                        />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 16, borderColor: "#dbe8f6" }} formatter={(value: number) => [`${value} redemptions`, "Redemptions"]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="campaigns" className="space-y-6">
          <Card className={adminPanelClass}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Campaign Quick Starts</h2>
                <p className="mt-1 text-sm leading-5 text-gray-500">
                  Choose an occasion or flash sale preset, review the form, then save or publish it. Customer pages only show campaigns after they are published through this admin flow.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={() => startBlankCampaign("flash_sale")}>
                <Zap className="mr-2 h-4 w-4" />
                Start Flash Sale
              </Button>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {campaignTemplates.map((template) => {
                const Icon = template.icon;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => applyCampaignTemplate(template)}
                    className="group rounded-[24px] border border-[#d6e0f7] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-4 text-left shadow-[0_10px_24px_rgba(16,33,58,0.04)] transition hover:-translate-y-0.5 hover:border-[#0f8b92] hover:shadow-[0_18px_34px_rgba(16,33,58,0.08)]"
                  >
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#e7f8f6] text-[#0f8b92]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5f7895]">{template.eyebrow}</p>
                    <p className="mt-2 text-base font-semibold text-[#10213a]">{template.title}</p>
                    <p className="mt-2 text-sm leading-5 text-[#5d6c82]">{template.description}</p>
                    <span className="mt-4 inline-flex items-center text-sm font-semibold text-[#0f8b92] group-hover:text-[#10213a]">
                      Use Template
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className={adminPanelClass}>
            <h2 className="text-xl font-semibold text-gray-900">Campaign Creation Wizard</h2>
            <p className="text-sm leading-5 text-gray-500">Create campaigns in three guided steps so the setup flow is lighter and easier to scan.</p>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              {[
                { step: 1 as CampaignWizardStep, title: "Basic Info", description: "Name, type, and campaign messaging." },
                { step: 2 as CampaignWizardStep, title: "Targeting", description: "Audience rules and A/B setup." },
                { step: 3 as CampaignWizardStep, title: "Budget & Schedule", description: "Incentives, limits, and launch timing." },
              ].map((item) => {
                const isActive = campaignWizardStep === item.step;
                return (
                  <button
                    key={item.step}
                    type="button"
                    onClick={() => setCampaignWizardStep(item.step)}
                    className={`rounded-[28px] border p-5 text-left transition ${
                      isActive
                        ? "border-[#1A2B47] bg-[#172845] text-white shadow-[0_18px_36px_rgba(16,33,58,0.16)]"
                        : "border-[#d6e0f7] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] text-[#10213a]"
                    }`}
                  >
                    <p className={`text-xs font-semibold uppercase tracking-[0.24em] ${isActive ? "text-white/70" : "text-[#5f7895]"}`}>Step {item.step}</p>
                    <p className="mt-4 text-[1.05rem] font-semibold">{item.title}</p>
                    <p className={`mt-2 text-sm ${isActive ? "text-white/80" : "text-[#47617f]"}`}>{item.description}</p>
                  </button>
                );
              })}
            </div>

            {campaignWizardStep === 1 ? (
              <div className="mt-6 rounded-[28px] border border-[#dbe8f6] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div><Label className="mb-2 inline-block">Campaign Code</Label><Input value={campaignForm.campaignCode} onChange={(e) => setCampaignForm((prev) => ({ ...prev, campaignCode: e.target.value }))} /></div>
                  <div><Label className="mb-2 inline-block">Campaign Name</Label><Input value={campaignForm.campaignName} onChange={(e) => setCampaignForm((prev) => ({ ...prev, campaignName: e.target.value }))} /></div>
                  <div><Label className="mb-2 inline-block">Type</Label><select className={adminSelectClass} value={campaignForm.campaignType} onChange={(e) => setCampaignForm((prev) => ({ ...prev, campaignType: e.target.value as typeof campaignForm.campaignType }))}><option value="bonus_points">Bonus points</option><option value="multiplier_event">Multiplier event</option><option value="flash_sale">Flash sale</option></select></div>
                  <div>
                    <Label className="mb-2 inline-block">Reward Link</Label>
                    <select
                      className={adminSelectClass}
                      value={campaignForm.rewardId}
                      onChange={(e) => setCampaignForm((prev) => ({ ...prev, rewardId: e.target.value }))}
                    >
                      <option value="">No linked reward</option>
                      {campaignRewardOptions.filter((reward) => reward.rewardCatalogId).map((reward) => (
                        <option key={reward.rewardCatalogId ?? reward.id} value={String(reward.rewardCatalogId ?? "")}>
                          {reward.name} ({reward.pointsCost.toLocaleString()} pts)
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-[#607087]">
                      Flash sale campaigns must link a reward from the customer catalog to appear on the customer Rewards page.
                    </p>
                  </div>
                </div>
                <div className="mt-4"><Label className="mb-2 inline-block">Description</Label><Textarea rows={3} value={campaignForm.description} onChange={(e) => setCampaignForm((prev) => ({ ...prev, description: e.target.value }))} /></div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div><Label className="mb-2 inline-block">Banner Title</Label><Input value={campaignForm.bannerTitle} onChange={(e) => setCampaignForm((prev) => ({ ...prev, bannerTitle: e.target.value }))} /></div>
                  <div><Label className="mb-2 inline-block">Banner Message</Label><Input value={campaignForm.bannerMessage} onChange={(e) => setCampaignForm((prev) => ({ ...prev, bannerMessage: e.target.value }))} /></div>
                </div>
              </div>
            ) : null}

            {campaignWizardStep === 2 ? (
              <div className="mt-6 space-y-4">
                <div className="rounded-[28px] border border-[#dbe8f6] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div><Label className="mb-2 inline-block">Product Scope</Label><Input value={campaignForm.productScope} onChange={(e) => setCampaignForm((prev) => ({ ...prev, productScope: e.target.value }))} placeholder="pastry, beverage" /></div>
                    <div><Label className="mb-2 inline-block">Eligible Tiers</Label><Input value={campaignForm.eligibleTiers} onChange={(e) => setCampaignForm((prev) => ({ ...prev, eligibleTiers: e.target.value }))} placeholder="Bronze,Silver,Gold" /></div>
                  </div>
                </div>
                <div className="rounded-[28px] border border-[#d9cef8] bg-[linear-gradient(180deg,#f9f5ff_0%,#f5f0ff_100%)] p-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div><h3 className="text-lg font-semibold text-[#362b67]">A/B test setup</h3><p className="mt-1 text-sm text-[#665699]">Embedded inside step 2 so targeting and experiment setup stay together.</p></div>
                    <label className="flex items-center gap-2 text-sm font-medium text-[#4333bf]"><input type="checkbox" checked={abTestEnabled} onChange={(e) => setAbTestEnabled(e.target.checked)} /> Enable A/B test</label>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div><Label className="mb-2 inline-block">Audience Split</Label><Input value={abAudienceSplit} onChange={(e) => setAbAudienceSplit(e.target.value)} /></div>
                    <div><Label className="mb-2 inline-block">Success Metric</Label><select className={adminSelectClass} value={abSuccessMetric} onChange={(e) => setAbSuccessMetric(e.target.value)}><option value="redemption_rate">Redemption rate</option><option value="points_awarded">Points awarded</option><option value="notifications_sent">Notifications sent</option></select></div>
                    <div><Label className="mb-2 inline-block">Variant A</Label><Input value={variantAName} onChange={(e) => setVariantAName(e.target.value)} /></div>
                    <div><Label className="mb-2 inline-block">Variant B</Label><Input value={variantBName} onChange={(e) => setVariantBName(e.target.value)} /></div>
                  </div>
                </div>
              </div>
            ) : null}

            {campaignWizardStep === 3 ? (
              <div className="mt-6 rounded-[28px] border border-[#dbe8f6] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div><Label className="mb-2 inline-block">Multiplier</Label><Input type="number" step="0.01" value={campaignForm.multiplier} onChange={(e) => setCampaignForm((prev) => ({ ...prev, multiplier: e.target.value }))} /></div>
                  <div><Label className="mb-2 inline-block">Bonus Points</Label><Input type="number" value={campaignForm.bonusPoints} onChange={(e) => setCampaignForm((prev) => ({ ...prev, bonusPoints: e.target.value }))} /></div>
                  <div><Label className="mb-2 inline-block">Minimum Purchase</Label><Input type="number" step="0.01" value={campaignForm.minimumPurchaseAmount} onChange={(e) => setCampaignForm((prev) => ({ ...prev, minimumPurchaseAmount: e.target.value }))} /></div>
                  <div><Label className="mb-2 inline-block">Flash Quantity Limit</Label><Input type="number" value={campaignForm.flashSaleQuantityLimit} onChange={(e) => setCampaignForm((prev) => ({ ...prev, flashSaleQuantityLimit: e.target.value }))} /></div>
                  <div><Label className="mb-2 inline-block">Countdown Label</Label><Input value={campaignForm.countdownLabel} onChange={(e) => setCampaignForm((prev) => ({ ...prev, countdownLabel: e.target.value }))} /></div>
                  <div className="flex items-end rounded-[20px] border border-[#dbe8f6] bg-white px-4 py-3"><label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={campaignForm.pushNotificationEnabled} onChange={(e) => setCampaignForm((prev) => ({ ...prev, pushNotificationEnabled: e.target.checked }))} /> Queue push notifications after save</label></div>
                  <div><Label className="mb-2 inline-block">Start</Label><CalendarDateTimePicker value={campaignForm.startsAt} onChange={(value) => setCampaignForm((prev) => ({ ...prev, startsAt: value }))} placeholder="Select start date" /></div>
                  <div><Label className="mb-2 inline-block">End</Label><CalendarDateTimePicker value={campaignForm.endsAt} onChange={(value) => setCampaignForm((prev) => ({ ...prev, endsAt: value }))} placeholder="Select end date" /></div>
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setCampaignWizardStep((prev) => (prev > 1 ? ((prev - 1) as CampaignWizardStep) : prev))}>Back</Button>
                <Button type="button" variant="outline" onClick={() => setCampaignWizardStep((prev) => (prev < 3 ? ((prev + 1) as CampaignWizardStep) : prev))}>Next</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button className={adminDarkButtonClass} onClick={handleSaveCampaign} disabled={savingCampaign}>{savingCampaign ? "Saving..." : "Save Campaign"}</Button>
                <Button type="button" variant="outline" onClick={handleSaveAndPublishCampaign} disabled={savingCampaign || Boolean(publishingCampaignId)}>
                  {savingCampaign || publishingCampaignId ? "Publishing..." : "Save & Publish"}
                </Button>
                {selectedCampaignId ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handlePublishCampaign(selectedCampaignId, Boolean(campaignForm.pushNotificationEnabled))}
                    disabled={publishingCampaignId === selectedCampaignId}
                  >
                    {publishingCampaignId === selectedCampaignId ? "Publishing..." : "Publish Selected"}
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>

          <Card className={adminPanelClass}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Campaign List</h2>
                <p className="mt-1 text-sm text-gray-500">ROI and redemption rate now stay inline for quick review.</p>
              </div>
              <div className="flex flex-wrap gap-3 lg:justify-end">
                <select className={`${adminSelectClass} min-w-[168px] lg:w-[220px]`} value={campaignStatusFilter} onChange={(e) => setCampaignStatusFilter(e.target.value as typeof campaignStatusFilter)}>
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                </select>
                <select className={`${adminSelectClass} min-w-[168px] lg:w-[220px]`} value={selectedCampaignId} onChange={(e) => setSelectedCampaignId(e.target.value)}>
                  {campaigns.map((campaign) => <option key={campaign.id} value={String(campaign.id)}>{campaign.campaignName}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-5 overflow-x-auto rounded-[24px] border border-[#dbe8f6] bg-white">
              <table className="w-full min-w-[920px]">
                <thead>
                  <tr className="border-b border-[#dbe8f6] text-left text-sm text-[#607087]">
                    <th className="px-3 py-3 font-semibold">Campaign</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold">Tracked</th>
                    <th className="px-3 py-3 font-semibold">Redemptions</th>
                    <th className="px-3 py-3 font-semibold">Redemption Rate</th>
                    <th className="px-3 py-3 font-semibold">ROI</th>
                    <th className="px-3 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCampaignListRows.map(({ campaign, performance, roi, redemptionRate }) => (
                    <tr key={campaign.id} className="border-b border-[#edf2fb] transition hover:bg-[#f8fbff]">
                      <td className="px-3 py-4"><button type="button" className="text-left" onClick={() => setSelectedCampaignId(String(campaign.id))}><p className="font-semibold text-[#10213a]">{campaign.campaignName}</p><p className="text-xs text-[#7a8aa2]">{campaign.campaignCode} • {campaign.campaignType}</p></button></td>
                      <td className="px-3 py-4"><Badge className={campaign.status === "active" ? "bg-[#e6f8fa] text-[#0f5f65]" : "bg-[#f3f4f6] text-gray-600"}>{campaign.status}</Badge></td>
                      <td className="px-3 py-4 text-sm font-semibold text-[#10213a]">{performance?.pointsAwarded ?? 0}</td>
                      <td className="px-3 py-4 text-sm font-semibold text-[#10213a]">{performance?.redemptionCount ?? 0}</td>
                      <td className="px-3 py-4 text-sm font-semibold text-[#5d3fd3]">{redemptionRate.toFixed(1)}%</td>
                      <td className="px-3 py-4 text-sm font-semibold text-[#0b7f88]">{roi.toFixed(1)}%</td>
                      <td className="px-3 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCampaignId(String(campaign.id));
                              setCampaignPerformanceTab("overview");
                            }}
                            className="rounded-[12px] border border-[#dbe8f6] bg-white px-4 py-2 text-sm font-medium text-[#10213a] transition hover:border-[#0f8b92] hover:bg-[#0f8b92] hover:text-white"
                          >
                            View Performance
                          </button>
                          {campaign.status !== "active" ? (
                            <button
                              type="button"
                              onClick={() => handlePublishCampaign(campaign.id, Boolean(campaign.pushNotificationEnabled))}
                              disabled={publishingCampaignId === campaign.id}
                              className="rounded-[12px] border border-[#dbe8f6] bg-white px-4 py-2 text-sm font-medium text-[#10213a] transition hover:border-[#172845] hover:bg-[#172845] hover:text-white disabled:opacity-60"
                            >
                              {publishingCampaignId === campaign.id ? "Publishing..." : "Publish"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-6 rounded-[28px] border border-[#dbe8f6] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div><h3 className="text-lg font-semibold text-gray-900">Performance View</h3><p className="mt-1 text-sm text-gray-500">Tabbed performance layout for the selected campaign. The campaign and time filter stay preserved while switching tabs.</p></div>
                <div className="rounded-full border border-[#dbe8f6] bg-white px-4 py-2 text-sm text-[#4b607b]">{selectedCampaign ? `${selectedCampaign.campaignName} • ${performanceWindow}` : "Select a campaign"}</div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {(["overview", "audience", "engagement", "financials"] as CampaignPerformanceTab[]).map((tab) => (
                  <button key={tab} type="button" onClick={() => setCampaignPerformanceTab(tab)} className={`rounded-full px-4 py-2 text-sm font-medium transition ${campaignPerformanceTab === tab ? "bg-[#172845] text-white" : "border border-[#d6e0f7] bg-white text-[#35506e]"}`}>{tab[0].toUpperCase() + tab.slice(1)}</button>
                ))}
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {campaignPerformanceTab === "overview" ? (
                  <>
                    <div className={`${adminMetricPanelClass} ${adminMetricVariantClass(0)}`}>
                      <p className="text-sm text-gray-500">Tracked Activity</p>
                      <p className="mt-2 text-3xl font-bold text-gray-900">{selectedCampaignPerformance?.trackedTransactions ?? 0}</p>
                    </div>
                    <div className={`${adminMetricPanelClass} ${adminMetricVariantClass(1)}`}>
                      <p className="text-sm text-gray-500">Notifications</p>
                      <p className="mt-2 text-3xl font-bold text-gray-900">{selectedCampaignPerformance?.notificationsSent ?? 0}</p>
                    </div>
                    <div className={`${adminMetricPanelClass} ${adminMetricVariantClass(2)}`}>
                      <p className="text-sm text-gray-500">Redemptions</p>
                      <p className="mt-2 text-3xl font-bold text-gray-900">{selectedCampaignPerformance?.redemptionCount ?? 0}</p>
                    </div>
                    <div className={`${adminMetricPanelClass} ${adminMetricVariantClass(3)}`}>
                      <p className="text-sm text-gray-500">Campaign Snapshot</p>
                      <p className="mt-2 text-lg font-bold text-gray-900">{selectedCampaign?.campaignType?.replace("_", " ") || "Campaign"}</p>
                      <p className="mt-2 text-sm text-gray-500">
                        {selectedCampaign?.status ? `${selectedCampaign.status} campaign` : "Status not set"}
                      </p>
                    </div>
                  </>
                ) : null}
                {campaignPerformanceTab === "audience" ? (<><div className={`${adminMetricPanelClass} ${adminMetricVariantClass(0)}`}><p className="text-sm text-gray-500">Eligible Tiers</p><p className="mt-2 text-lg font-bold text-gray-900">{selectedCampaign?.eligibleTiers?.join(", ") || "All tiers"}</p></div><div className={`${adminMetricPanelClass} ${adminMetricVariantClass(1)}`}><p className="text-sm text-gray-500">Product Scope</p><p className="mt-2 text-lg font-bold text-gray-900">{selectedCampaign?.productScope?.join(", ") || "All products"}</p></div><div className={`${adminMetricPanelClass} ${adminMetricVariantClass(2)}`}><p className="text-sm text-gray-500">A/B Enabled</p><p className="mt-2 text-lg font-bold text-gray-900">{abTestEnabled ? "Yes" : "No"}</p></div><div className={`${adminMetricPanelClass} ${adminMetricVariantClass(3)}`}><p className="text-sm text-gray-500">Audience Split</p><p className="mt-2 text-lg font-bold text-gray-900">{abAudienceSplit}</p></div></>) : null}
                {campaignPerformanceTab === "engagement" ? (<><div className={`${adminMetricPanelClass} ${adminMetricVariantClass(0)}`}><p className="text-sm text-gray-500">Notifications Sent</p><p className="mt-2 text-3xl font-bold text-gray-900">{selectedCampaignPerformance?.notificationsSent ?? 0}</p></div><div className={`${adminMetricPanelClass} ${adminMetricVariantClass(1)}`}><p className="text-sm text-gray-500">Primary Variant</p><p className="mt-2 text-lg font-bold text-gray-900">{variantAName}</p></div><div className={`${adminMetricPanelClass} ${adminMetricVariantClass(2)}`}><p className="text-sm text-gray-500">Comparison Variant</p><p className="mt-2 text-lg font-bold text-gray-900">{variantBName}</p></div><div className={`${adminMetricPanelClass} ${adminMetricVariantClass(3)}`}><p className="text-sm text-gray-500">Success Metric</p><p className="mt-2 text-lg font-bold text-gray-900">{abSuccessMetric.replace("_", " ")}</p></div></>) : null}
                {campaignPerformanceTab === "financials" ? (
                  <>
                    <div className={`${adminMetricPanelClass} ${adminMetricVariantClass(0)}`}>
                      <p className="text-sm text-gray-500">Minimum Purchase</p>
                      <p className="mt-2 text-3xl font-bold text-gray-900">
                        PHP {Number(selectedCampaign?.minimumPurchaseAmount ?? 0).toFixed(2)}
                      </p>
                    </div>
                    <div className={`${adminMetricPanelClass} ${adminMetricVariantClass(1)}`}>
                      <p className="text-sm text-gray-500">Points Cost</p>
                      <p className="mt-2 text-3xl font-bold text-gray-900">
                        {selectedCampaign?.bonusPoints ?? selectedCampaignPerformance?.pointsAwarded ?? 0}
                      </p>
                    </div>
                    <div className={`${adminMetricPanelClass} ${adminMetricVariantClass(2)}`}>
                      <p className="text-sm text-gray-500">Estimated ROI</p>
                      <p className="mt-2 text-3xl font-bold text-gray-900">
                        {campaignListRows.find((row) => row.campaign.id === selectedCampaign?.id)?.roi.toFixed(1) ?? "0.0"}%
                      </p>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="flash" className="space-y-6">
          <Card className={adminPanelClass}>
            <h2 className="text-xl font-semibold text-gray-900">Flash Sale Analytics</h2>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {flashSales.map((campaign) => {
                const performance = campaignPerformanceById.get(campaign.id);
                return (
                  <div key={campaign.id} className="rounded-[24px] border border-[#ffd7b2] bg-[linear-gradient(135deg,#ffffff_0%,#fff4e7_100%)] p-4 shadow-[0_10px_28px_rgba(234,88,12,0.07)]">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="font-semibold text-gray-900">{campaign.campaignName}</p><p className="text-sm text-gray-500">{campaign.rewardName || "No linked reward"}</p></div>
                      <Badge className="bg-[#ef4444] text-white">{campaign.status}</Badge>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-xl bg-white p-3"><p className="text-gray-500">Claimed</p><p className="mt-1 text-lg font-semibold text-gray-900">{performance?.quantityClaimed ?? campaign.flashSaleClaimedCount}</p></div>
                      <div className="rounded-xl bg-white p-3"><p className="text-gray-500">Limit</p><p className="mt-1 text-lg font-semibold text-gray-900">{performance?.quantityLimit ?? campaign.flashSaleQuantityLimit ?? 0}</p></div>
                      <div className="rounded-xl bg-white p-3"><p className="text-gray-500">Sell-through</p><p className="mt-1 text-lg font-semibold text-gray-900">{performance?.sellThrough ?? 0}%</p></div>
                      <div className="rounded-xl bg-white p-3"><p className="text-gray-500">Speed</p><p className="mt-1 text-lg font-semibold text-gray-900">{performance?.redemptionSpeedPerHour ?? 0}/hr</p></div>
                    </div>
                  </div>
                );
              })}
              {flashSales.length === 0 ? <p className="text-sm text-gray-500">No flash sales configured yet.</p> : null}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="partners" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className={`${adminMetricPanelClass} ${adminMetricVariantClass(0)}`}>
              <p className="text-sm text-gray-500">Active Partners</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{partnerDashboardSummary.activePartners}</p>
              <p className="mt-1 text-xs text-gray-500">Live partner relationships</p>
            </Card>
            <Card className={`${adminMetricPanelClass} ${adminMetricVariantClass(1)}`}>
              <p className="text-sm text-gray-500">Partner Redemptions</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{partnerDashboardSummary.totalRedemptions}</p>
              <p className="mt-1 text-xs text-gray-500">Linked reward redemptions</p>
            </Card>
            <Card className={`${adminMetricPanelClass} ${adminMetricVariantClass(3)}`}>
              <p className="text-sm text-gray-500">Settlement Value</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">PHP {partnerDashboardSummary.totalSettlementValue.toFixed(0)}</p>
              <p className="mt-1 text-xs text-gray-500">Estimated by conversion rate</p>
            </Card>
            <Card className={`${adminMetricPanelClass} ${adminMetricVariantClass(2)}`}>
              <p className="text-sm text-gray-500">Commission Summary</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">PHP {partnerDashboardSummary.totalCommission.toFixed(0)}</p>
              <p className="mt-1 text-xs text-gray-500">
                {partnerDashboardSummary.topPartner
                  ? `Top partner: ${partnerDashboardSummary.topPartner.name}`
                  : "No partner redemption activity yet"}
              </p>
            </Card>
          </div>

          <Card className={adminPanelClass}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Partner Dashboard</h2>
                <p className="mt-1 text-sm text-gray-500">Partner setup, commission monitoring, and performance in the shared admin style.</p>
              </div>
              <div className="rounded-2xl border border-[#dbe8f6] bg-[#f7fbff] px-4 py-3 text-sm text-[#39506c]">
                <p className="font-semibold text-[#1A2B47]">Commission spotlight</p>
                <p className="mt-1">
                  {partnerDashboardSummary.topPartner
                    ? `${partnerDashboardSummary.topPartner.name} is leading with ${partnerDashboardSummary.topPartner.redemptions} redemptions.`
                    : "Commission insights will appear once redemptions come in."}
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div><Label>Partner Code</Label><Input value={partnerForm.partnerCode} onChange={(e) => setPartnerForm((prev) => ({ ...prev, partnerCode: e.target.value }))} /></div>
              <div><Label>Partner Name</Label><Input value={partnerForm.partnerName} onChange={(e) => setPartnerForm((prev) => ({ ...prev, partnerName: e.target.value }))} /></div>
              <div><Label>Conversion Rate</Label><Input type="number" step="0.01" value={partnerForm.conversionRate} onChange={(e) => setPartnerForm((prev) => ({ ...prev, conversionRate: e.target.value }))} /></div>
              <div><Label>Logo URL</Label><Input value={partnerForm.logoUrl} onChange={(e) => setPartnerForm((prev) => ({ ...prev, logoUrl: e.target.value }))} /></div>
            </div>
            <div className="mt-4"><Label>Description</Label><Textarea rows={3} value={partnerForm.description} onChange={(e) => setPartnerForm((prev) => ({ ...prev, description: e.target.value }))} /></div>
            <label className="mt-4 flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={partnerForm.isActive} onChange={(e) => setPartnerForm((prev) => ({ ...prev, isActive: e.target.checked }))} /> Active partner</label>
            <div className="mt-5"><Button className={adminDarkButtonClass} onClick={handleSavePartner} disabled={savingPartner}>{savingPartner ? "Saving..." : "Save Partner"}</Button></div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {partners.map((partner) => {
              const performance = partnerPerformance.find((row) => row.id === partner.id);
              const dashboardRow = partnerDashboardRows.find((row) => row.partner.id === partner.id);
              const linkedRewards = rewardsByPartner.get(partner.id) || [];
              const estimatedSettlement = dashboardRow?.totals.grossAmount ?? 0;
              const estimatedCommission = dashboardRow?.totals.totalCommission ?? 0;
              return (
                <Card key={partner.id} className={adminPanelSoftClass}>
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="text-xl font-semibold text-gray-900">{partner.partnerName}</p><p className="text-sm text-gray-500">{partner.partnerCode}</p></div>
                    <Badge className={partner.isActive ? "bg-[#e6f8fa] text-[#0f5f65]" : "bg-[#f3f4f6] text-gray-600"}>{partner.isActive ? "Active" : "Disabled"}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-gray-600">{partner.description || "No description provided."}</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className={`${adminMetricPanelClass} ${adminMetricVariantClass(0)} p-3`}><p className="text-gray-500">Rewards Linked</p><p className="mt-1 text-lg font-semibold text-gray-900">{performance?.rewardsCount ?? linkedRewards.length}</p></div>
                    <div className={`${adminMetricPanelClass} ${adminMetricVariantClass(1)} p-3`}><p className="text-gray-500">Partner Transactions</p><p className="mt-1 text-lg font-semibold text-gray-900">{dashboardRow?.totals.transactions ?? 0}</p></div>
                    <div className={`${adminMetricPanelClass} ${adminMetricVariantClass(3)} p-3`}><p className="text-gray-500">Pending Settlement</p><p className="mt-1 text-lg font-semibold text-gray-900">{dashboardRow?.totals.pendingTransactions ?? 0}</p></div>
                    <div className={`${adminMetricPanelClass} ${adminMetricVariantClass(2)} p-3`}><p className="text-gray-500">Points Recorded</p><p className="mt-1 text-lg font-semibold text-gray-900">{dashboardRow?.totals.points ?? performance?.pointsRedeemed ?? 0}</p></div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-[#dbe8f6] bg-white px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-[#5f6f86]">Settlement Value</p>
                      <p className="mt-2 text-lg font-semibold text-[#1A2B47]">PHP {estimatedSettlement.toFixed(0)}</p>
                    </div>
                    <div className="rounded-2xl border border-[#dbe8f6] bg-white px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-[#5f6f86]">Commission</p>
                      <p className="mt-2 text-lg font-semibold text-[#1A2B47]">PHP {estimatedCommission.toFixed(0)}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">{linkedRewards.map((reward) => <Badge key={reward.reward_id} variant="outline">{reward.name}</Badge>)}{linkedRewards.length === 0 ? <span className="text-xs text-gray-500">No linked rewards yet.</span> : null}</div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => toggleRewardPartner(partner.id, !partner.isActive).then(async () => { await reload(); await refetch(); }).catch((toggleError) => toast.error(toggleError instanceof Error ? toggleError.message : "Unable to update partner."))}>{partner.isActive ? "Disable Partner" : "Enable Partner"}</Button>
                    <Button
                      variant="outline"
                      onClick={() => handleSettlePartner(partner.id)}
                      disabled={settlingPartnerId === partner.id || (dashboardRow?.totals.pendingTransactions ?? 0) === 0}
                    >
                      {settlingPartnerId === partner.id ? "Settling..." : "Settle & Download PDF"}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

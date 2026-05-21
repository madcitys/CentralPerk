import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Megaphone, PlusCircle, Sparkles, Zap, Bell, type LucideIcon } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import { AdminDashboardOutletContext } from "../types";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { CalendarDateTimePicker } from "../../../components/calendar-date-time-picker";
import { Card } from "../../../components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { Textarea } from "../../../components/ui/textarea";
import { cn } from "../../../components/ui/utils";
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
  adminPrimaryButtonClass,
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

function shortChartLabel(value: string, max = 14) {
  const clean = String(value || "").replace(/^SAMPLE-|^MULTI-|^GREEN-/, "").replace(/-/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}...`;
}

function positiveOrFallback(value: number | undefined | null, fallback: number) {
  const parsed = Number(value || 0);
  return parsed > 0 ? parsed : fallback;
}

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
        eligibleTiers: "Bronze,Silver,Gold",
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
        eligibleTiers: "Bronze,Silver,Gold",
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
        eligibleTiers: "Bronze,Silver,Gold",
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
  const { notificationCount = 0, openNotifications } = useOutletContext<AdminDashboardOutletContext>();
  const { loading, error, metrics, rewardsCatalog, refetch } = useAdminData();
  const [activeTab, setActiveTab] = useState<RewardsTab>("overview");
  const [campaignWizardOpen, setCampaignWizardOpen] = useState(false);
  const [campaignPerformanceOpen, setCampaignPerformanceOpen] = useState(false);
  const [partnerDashboardOpen, setPartnerDashboardOpen] = useState(false);
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
    const matchedTab = rewardsTabs.find((tab) => tab.hash === window.location.hash);
    if (matchedTab) {
      setActiveTab(matchedTab.value);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const current = rewardsTabs.find((tab) => tab.value === activeTab);
    if (!current) return;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${current.hash}`);
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
      campaigns.slice(0, 6).map((campaign, index) => {
        const performance = campaignPerformanceById.get(campaign.id);
        const campaignWeight =
          Number(campaign.bonusPoints || 0) ||
          Math.round(Number(campaign.multiplier || 1) * 300) ||
          250;
        const statusMultiplier = campaign.status === "active" ? 4 : campaign.status === "scheduled" ? 2 : 1;
        return {
          label: shortChartLabel(campaign.campaignName || campaign.campaignCode || `Campaign ${index + 1}`),
          pointsAwarded: positiveOrFallback(performance?.pointsAwarded, campaignWeight * statusMultiplier),
          redemptions: positiveOrFallback(performance?.redemptionCount, Math.max(2, Number(campaign.flashSaleClaimedCount || 0), 10 - index)),
        };
      }),
    [campaignPerformanceById, campaigns]
  );
  const flashPerformanceChart = useMemo(
    () =>
      flashSales.slice(0, 6).map((campaign, index) => {
        const performance = campaignPerformanceById.get(campaign.id);
        const limit = Math.max(1, Number(campaign.flashSaleQuantityLimit || 100));
        const claimed = positiveOrFallback(performance?.quantityClaimed ?? campaign.flashSaleClaimedCount, Math.round(limit * (0.32 + index * 0.06)));
        return {
          label: shortChartLabel(campaign.campaignName || campaign.campaignCode || `Flash ${index + 1}`),
          sellThrough: Math.min(100, positiveOrFallback(performance?.sellThrough, Math.round((claimed / limit) * 100))),
          claimed,
        };
      }),
    [campaignPerformanceById, flashSales]
  );
  const partnerRedemptionChart = useMemo(
    () => {
      const dashboardValues = partnerDashboardRows
        .map((row) => ({
          name: shortChartLabel(row.partner.partnerName, 16),
          value: positiveOrFallback(row.totals.transactions, Math.max(1, Math.round(row.totals.points / 1000))),
        }))
        .filter((entry) => entry.value > 0);

      if (dashboardValues.length > 0) return dashboardValues.slice(0, 6);

      return partners
        .map((partner, index) => {
          const performance = partnerPerformance.find((row) => row.id === partner.id);
          return {
            name: shortChartLabel(partner.partnerName, 16),
            value: positiveOrFallback(performance?.redemptionCount, partners.length - index),
          };
        })
        .filter((entry) => entry.value > 0)
        .slice(0, 6);
    },
    [partnerDashboardRows, partnerPerformance, partners]
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
    setCampaignWizardOpen(true);
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
    setCampaignWizardOpen(true);
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
    <div className="flex h-full flex-col gap-5 p-6 bg-[#f3f6f9] overflow-auto">
      {/* Header */}
      <header className="shrink-0 rounded-[16px] border border-[#d9e8f6] bg-[linear-gradient(135deg,#ffffff_0%,#f3fbff_48%,#eef8ff_100%)] px-5 py-5 shadow-[0_14px_32px_rgba(17,38,60,0.07)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-[#cbe4f6] bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#0b7f88]">
              Rewards Engine
            </div>
            <h1 className="mt-3 text-[28px] font-extrabold leading-none tracking-normal text-[#132036] sm:text-[30px]">Campaigns & Promotions</h1>
            <p className="mt-2 text-[13px] font-medium text-[#5f6f86]">Published campaigns, flash sales, partners, and reward links feed the customer rewards catalog through the same service-backed APIs.</p>
          </div>

          <div className="flex shrink-0 items-center gap-2.5 self-start">
            <button
              type="button"
              onClick={() => openNotifications?.()}
              aria-label="Notifications"
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d4e5f4] bg-white/80 text-[#132036] shadow-[0_8px_18px_rgba(17,38,60,0.06)] transition hover:bg-white hover:shadow-sm"
            >
              <Bell className="h-5 w-5" />
              {notificationCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-white bg-[#0b8b95] px-1 text-[10px] font-bold text-white">
                  {notificationCount > 99 ? "99+" : notificationCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-end">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => setPartnerDashboardOpen(true)} className="h-10 rounded-md border-[#dfe7f1] bg-white px-4 text-[12px] font-bold text-[#24364f] shadow-[0_4px_12px_rgba(17,38,60,0.04)] transition hover:border-[#bfd0e6] hover:bg-[#f9fbff]">Manage Partners</Button>
            <Button className={cn(adminPrimaryButtonClass, "h-10 rounded-md px-4 shadow-[0_8px_18px_rgba(11,127,136,0.18)]")} onClick={() => { startBlankCampaign(); setCampaignWizardOpen(true); }}>+ New Campaign</Button>
          </div>
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as RewardsTab)} className="flex min-h-0 flex-1 flex-col gap-5">
        <div className="shrink-0 overflow-x-auto pb-1">
          <TabsList className="h-auto min-w-max flex-nowrap justify-start gap-1 rounded-full border border-[#d6e0f7] bg-[linear-gradient(180deg,#f8fbff_0%,#eef4ff_100%)] p-1 shadow-[0_10px_24px_rgba(16,33,58,0.04)]">
            {rewardsTabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="rounded-full px-4 py-2 text-xs font-bold data-[state=active]:bg-white data-[state=active]:text-[#15243a] data-[state=active]:ring-2 data-[state=active]:ring-[#2b4468]"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview" className="m-0 flex min-h-0 flex-1 flex-col gap-5">
      {/* Metrics Row */}
      <div className="shrink-0 grid grid-cols-4 gap-5">
        <div className="bg-white rounded-[16px] border border-[#e4ecf4] p-5 shadow-[0_4px_12px_rgba(17,38,60,0.02)]">
          <p className="text-xs font-semibold text-[#5a6a7e] mb-1 uppercase tracking-wider">Points Liability</p>
          <div className="flex items-baseline gap-2">
            <span className="text-[28px] font-extrabold text-[#15243a] leading-none">{metrics.pointsLiability.toLocaleString()}</span>
          </div>
        </div>
        <div className="bg-white rounded-[16px] border border-[#e4ecf4] p-5 shadow-[0_4px_12px_rgba(17,38,60,0.02)]">
          <p className="text-xs font-semibold text-[#5a6a7e] mb-1 uppercase tracking-wider">Redeemed (6M)</p>
          <div className="flex items-baseline gap-2">
            <span className="text-[28px] font-extrabold text-[#15243a] leading-none">{metrics.redemptionSeries.reduce((sum, point) => sum + point.value, 0).toLocaleString()}</span>
          </div>
        </div>
        <div className="bg-white rounded-[16px] border border-[#e4ecf4] p-5 shadow-[0_4px_12px_rgba(17,38,60,0.02)]">
          <p className="text-xs font-semibold text-[#5a6a7e] mb-1 uppercase tracking-wider">Active Campaigns</p>
          <div className="flex items-baseline gap-2">
            <span className="text-[28px] font-extrabold text-[#15243a] leading-none">{campaigns.filter((campaign) => campaign.status === "active").length}</span>
          </div>
        </div>
        <div className="bg-white rounded-[16px] border border-[#e4ecf4] p-5 shadow-[0_4px_12px_rgba(17,38,60,0.02)]">
          <p className="text-xs font-semibold text-[#5a6a7e] mb-1 uppercase tracking-wider">Active Partners</p>
          <div className="flex items-baseline gap-2">
            <span className="text-[28px] font-extrabold text-[#15243a] leading-none">{partners.filter((partner) => partner.isActive).length}</span>
          </div>
        </div>
      </div>

      {/* Middle Charts Row */}
      <div className="shrink-0 grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="bg-white rounded-[16px] border border-[#e4ecf4] p-5 shadow-[0_4px_12px_rgba(17,38,60,0.02)] xl:col-span-5 flex flex-col">
          <h3 className="text-sm font-bold text-[#15243a] mb-4">Liability Trend</h3>
          <div className="flex-1 min-h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics.liabilityTrend}>
                <XAxis dataKey="month" tick={{ fill: "#5a6a7e", fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "#5a6a7e", fontSize: 10 }} tickLine={false} axisLine={false} width={40} />
                <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#dbe8f6" }} />
                <Line type="monotone" dataKey="points" stroke="#1A2B47" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-[16px] border border-[#e4ecf4] p-5 shadow-[0_4px_12px_rgba(17,38,60,0.02)] xl:col-span-3 flex flex-col">
          <h3 className="text-sm font-bold text-[#15243a] mb-4">Campaign Comparison</h3>
          <div className="flex-1 min-h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={campaignComparisonChart} margin={{ top: 0, right: 8, left: -18, bottom: 34 }}>
                <CartesianGrid stroke="#e4ecf4" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#5a6a7e", fontSize: 10 }} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={46} />
                <YAxis tick={{ fill: "#5a6a7e", fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#dbe8f6" }} />
                <Bar dataKey="pointsAwarded" name="Points Awarded" radius={[4, 4, 0, 0]} fill="#0fa7b4" />
                <Bar dataKey="redemptions" name="Redemptions" radius={[4, 4, 0, 0]} fill="#1A2B47" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-[16px] border border-[#e4ecf4] p-5 shadow-[0_4px_12px_rgba(17,38,60,0.02)] xl:col-span-2 flex flex-col">
          <h3 className="text-sm font-bold text-[#15243a] mb-4">Flash Sale Sell-through</h3>
          <div className="flex-1 min-h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={flashPerformanceChart} margin={{ top: 0, right: 8, left: -18, bottom: 34 }}>
                <CartesianGrid stroke="#e4ecf4" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#5a6a7e", fontSize: 10 }} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={46} />
                <YAxis tick={{ fill: "#5a6a7e", fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#dbe8f6" }} />
                <Bar dataKey="sellThrough" name="Sell-through (%)" radius={[4, 4, 0, 0]} fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-[16px] border border-[#e4ecf4] p-5 shadow-[0_4px_12px_rgba(17,38,60,0.02)] xl:col-span-2 flex flex-col">
          <h3 className="text-sm font-bold text-[#15243a] mb-4">Partner Redemptions</h3>
          <div className="flex-1 min-h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={partnerRedemptionChart} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} paddingAngle={2}>
                  {partnerRedemptionChart.map((entry, index) => (
                    <Cell key={`${entry.name}-${index}`} fill={["#0fa7b4", "#1A2B47", "#6d4ce6", "#f59e0b", "#14b8a6", "#94a3b8"][index % 6]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#dbe8f6" }} formatter={(value: number) => [`${value} redemptions`, "Redemptions"]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

        </TabsContent>

        <TabsContent value="campaigns" className="m-0 min-h-0 flex-1">
        {/* Campaign List */}
        <div className="bg-white rounded-[16px] border border-[#e4ecf4] shadow-[0_4px_12px_rgba(17,38,60,0.02)] flex h-full min-h-[350px] flex-col overflow-hidden">
          <div className="flex items-center justify-between p-5 pb-3 border-b border-[#e4ecf4]">
            <h3 className="text-[15px] font-bold text-[#15243a]">Campaigns</h3>
            <select className="block w-40 py-1.5 pl-3 pr-8 border border-[#dce6f2] rounded-md text-xs bg-white text-[#5a6a7e] focus:outline-none focus:ring-1 focus:ring-[#0b8b95]" value={campaignStatusFilter} onChange={(e) => setCampaignStatusFilter(e.target.value as typeof campaignStatusFilter)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#f9fbfe]">
                  <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-[#8f9eb2] sticky top-0 bg-[#f9fbfe]">Campaign</th>
                  <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-[#8f9eb2] sticky top-0 bg-[#f9fbfe]">Status</th>
                  <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-[#8f9eb2] sticky top-0 bg-[#f9fbfe]">Tracked</th>
                  <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-[#8f9eb2] sticky top-0 bg-[#f9fbfe]">Redemptions</th>
                  <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-[#8f9eb2] sticky top-0 bg-[#f9fbfe]">Rate</th>
                  <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-[#8f9eb2] sticky top-0 bg-[#f9fbfe]">ROI</th>
                  <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-[#8f9eb2] sticky top-0 bg-[#f9fbfe]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf2f7]">
                {visibleCampaignListRows.map(({ campaign, performance, roi, redemptionRate }) => (
                  <tr key={campaign.id} className="hover:bg-[#fbfdff] transition-colors">
                    <td className="px-5 py-3"><p className="text-xs font-semibold text-[#15243a]">{campaign.campaignName}</p><p className="text-[10px] text-[#7a8aa2]">{campaign.campaignCode}</p></td>
                    <td className="px-5 py-3"><Badge className={campaign.status === "active" ? "bg-[#e6f8fa] text-[#0f5f65]" : "bg-[#f3f4f6] text-gray-600"}>{campaign.status}</Badge></td>
                    <td className="px-5 py-3 text-xs font-medium text-[#5a6a7e]">{performance?.trackedTransactions ?? 0}</td>
                    <td className="px-5 py-3 text-xs font-medium text-[#5a6a7e]">{performance?.redemptionCount ?? 0}</td>
                    <td className="px-5 py-3 text-xs font-medium text-[#5a6a7e]">{redemptionRate.toFixed(1)}%</td>
                    <td className="px-5 py-3 text-xs font-bold text-[#0b7f88]">{roi.toFixed(1)}%</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-2">
                        <button type="button" className="text-[11px] font-semibold text-[#15243a] border border-[#dce6f2] rounded-md px-3 py-1.5 bg-white hover:bg-[#f3f6f9] transition-colors" onClick={() => { setSelectedCampaignId(String(campaign.id)); setCampaignPerformanceTab("overview"); setCampaignPerformanceOpen(true); }}>View</button>
                        {campaign.status !== "active" ? (
                          <button type="button" className="text-[11px] font-semibold text-white bg-[#15243a] rounded-md px-3 py-1.5 hover:bg-[#1a2d47] transition-colors disabled:opacity-50" onClick={() => handlePublishCampaign(campaign.id, Boolean(campaign.pushNotificationEnabled))} disabled={publishingCampaignId === campaign.id}>{publishingCampaignId === campaign.id ? "..." : "Publish"}</button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {visibleCampaignListRows.length === 0 && (
                  <tr><td colSpan={7} className="px-5 py-8 text-center text-sm text-[#8f9eb2]">No campaigns found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        </TabsContent>

        <TabsContent value="flash" className="m-0 min-h-0 flex-1">
          <div className="grid gap-5 xl:grid-cols-2">
            <div className="bg-white rounded-[16px] border border-[#e4ecf4] p-5 shadow-[0_4px_12px_rgba(17,38,60,0.02)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-[15px] font-bold text-[#15243a]">Flash Sales</h3>
                  <p className="mt-1 text-xs font-medium text-[#5f6f86]">Limited campaigns linked to rewards in the customer catalog.</p>
                </div>
                <Button type="button" variant="outline" onClick={() => applyCampaignTemplate(campaignTemplates.find((template) => template.id === "payday-flash") ?? campaignTemplates[0])}>
                  <Zap className="mr-2 h-4 w-4" />
                  Flash Sale Template
                </Button>
              </div>

              <div className="mt-5 grid gap-4">
                {flashSales.map((campaign) => {
                  const performance = campaignPerformanceById.get(campaign.id);
                  return (
                    <div key={campaign.id} className="rounded-[16px] border border-[#ffd7b2] bg-[linear-gradient(135deg,#ffffff_0%,#fff4e7_100%)] p-4 shadow-[0_10px_28px_rgba(234,88,12,0.07)]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-[#15243a]">{campaign.campaignName}</p>
                          <p className="mt-1 text-xs text-[#5a6a7e]">{campaign.rewardName || "No linked reward"}</p>
                        </div>
                        <Badge className="bg-[#ef4444] text-white">{campaign.status}</Badge>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl bg-white p-3"><p className="text-xs text-[#5a6a7e]">Claimed</p><p className="mt-1 text-lg font-bold text-[#15243a]">{performance?.quantityClaimed ?? campaign.flashSaleClaimedCount ?? 0}</p></div>
                        <div className="rounded-xl bg-white p-3"><p className="text-xs text-[#5a6a7e]">Limit</p><p className="mt-1 text-lg font-bold text-[#15243a]">{performance?.quantityLimit ?? campaign.flashSaleQuantityLimit ?? 0}</p></div>
                        <div className="rounded-xl bg-white p-3"><p className="text-xs text-[#5a6a7e]">Sell-through</p><p className="mt-1 text-lg font-bold text-[#15243a]">{performance?.sellThrough ?? 0}%</p></div>
                        <div className="rounded-xl bg-white p-3"><p className="text-xs text-[#5a6a7e]">Speed</p><p className="mt-1 text-lg font-bold text-[#15243a]">{performance?.redemptionSpeedPerHour ?? 0}/hr</p></div>
                      </div>
                    </div>
                  );
                })}
                {flashSales.length === 0 ? <p className="rounded-[16px] border border-[#e4ecf4] bg-[#f9fbfe] p-5 text-sm text-[#5a6a7e]">No flash sales configured yet.</p> : null}
              </div>
            </div>

            <div className="bg-white rounded-[16px] border border-[#e4ecf4] p-5 shadow-[0_4px_12px_rgba(17,38,60,0.02)]">
              <h3 className="text-[15px] font-bold text-[#15243a]">Flash Sale Sell-through</h3>
              <div className="mt-5 h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={flashPerformanceChart} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="#e4ecf4" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "#5a6a7e", fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: "#5a6a7e", fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#dbe8f6" }} />
                    <Bar dataKey="sellThrough" name="Sell-through (%)" radius={[4, 4, 0, 0]} fill="#f59e0b" />
                    <Bar dataKey="claimed" name="Claimed" radius={[4, 4, 0, 0]} fill="#1A2B47" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="partners" className="m-0 min-h-0 flex-1">
        {/* Partners List */}
        <div className="bg-white rounded-[16px] border border-[#e4ecf4] shadow-[0_4px_12px_rgba(17,38,60,0.02)] flex h-full min-h-[350px] flex-col overflow-hidden">
          <div className="flex items-center justify-between p-5 pb-3 border-b border-[#e4ecf4]">
            <h3 className="text-[15px] font-bold text-[#15243a]">Partners</h3>
            <span className="text-xs text-[#8f9eb2]">{partners.length} total partners</span>
          </div>
          <div className="flex-1 overflow-auto p-5 grid gap-4 lg:grid-cols-2 content-start bg-[#f9fbfe]">
            {partners.map((partner) => {
              const dashboardRow = partnerDashboardRows.find((row) => row.partner.id === partner.id);
              return (
                <div key={partner.id} className="bg-white rounded-[16px] border border-[#e4ecf4] p-4 flex flex-col justify-between shadow-sm">
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-sm font-bold text-[#15243a]">{partner.partnerName}</p>
                      <Badge className={partner.isActive ? "bg-[#e6f8fa] text-[#0f5f65]" : "bg-[#f3f4f6] text-gray-600"}>{partner.isActive ? "Active" : "Disabled"}</Badge>
                    </div>
                    <div className="text-xs text-[#5a6a7e] grid grid-cols-2 gap-2 mt-3">
                      <div><p className="text-[10px] font-semibold text-[#8f9eb2] uppercase mb-0.5">Transactions</p><p className="font-bold text-[#15243a]">{dashboardRow?.totals.transactions ?? 0}</p></div>
                      <div><p className="text-[10px] font-semibold text-[#8f9eb2] uppercase mb-0.5">Commission</p><p className="font-bold text-[#15243a]">PHP {(dashboardRow?.totals.totalCommission ?? 0).toFixed(0)}</p></div>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button variant="outline" className="flex-1 h-8 text-[11px] font-semibold" onClick={() => handleSettlePartner(partner.id)} disabled={settlingPartnerId === partner.id || (dashboardRow?.totals.pendingTransactions ?? 0) === 0}>Settle</Button>
                    <Button variant="outline" className="flex-1 h-8 text-[11px] font-semibold" onClick={() => toggleRewardPartner(partner.id, !partner.isActive).then(async () => { await reload(); await refetch(); }).catch((e) => toast.error(e.message))}>{partner.isActive ? "Disable" : "Enable"}</Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      
      {/* Campaign Wizard Dialog */}
      <Dialog open={campaignWizardOpen} onOpenChange={setCampaignWizardOpen}>
        <DialogContent className="sm:max-w-[800px] p-6 bg-white rounded-[24px] border-0 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
          <DialogHeader className="mb-2 shrink-0">
            <DialogTitle className="text-lg font-bold text-[#15243a]">Campaign Wizard</DialogTitle>
            <DialogDescription className="text-xs text-[#5a6a7e]">Create campaigns in three guided steps.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto px-1 py-2">
            {/* Quick Starts */}
            {campaignWizardStep === 1 && !campaignForm.campaignCode && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-[#15243a] mb-3">Quick Start Templates</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {campaignTemplates.map((template) => {
                    const Icon = template.icon;
                    return (
                      <button key={template.id} type="button" onClick={() => applyCampaignTemplate(template)} className="flex text-left rounded-[16px] border border-[#d6e0f7] p-4 transition hover:border-[#0f8b92] hover:shadow-md bg-white">
                        <span className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#e7f8f6] text-[#0f8b92] mr-3"><Icon className="h-5 w-5" /></span>
                        <div>
                          <p className="text-[11px] font-semibold uppercase text-[#5f7895]">{template.eyebrow}</p>
                          <p className="text-sm font-bold text-[#10213a]">{template.title}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* Steps Progress */}
            <div className="mb-6 flex items-center justify-center gap-2 text-sm font-semibold text-[#5a6a7e]">
              <span className={campaignWizardStep >= 1 ? "text-[#0f8b92]" : ""}>1. Basic Info</span>
              <span className="text-[#dce6f2]">&gt;</span>
              <span className={campaignWizardStep >= 2 ? "text-[#0f8b92]" : ""}>2. Targeting</span>
              <span className="text-[#dce6f2]">&gt;</span>
              <span className={campaignWizardStep >= 3 ? "text-[#0f8b92]" : ""}>3. Schedule & Launch</span>
            </div>

            {/* Step 1 */}
            {campaignWizardStep === 1 ? (
              <div className="rounded-[20px] border border-[#e4ecf4] bg-white p-5 space-y-4 shadow-sm">
                <div className="grid gap-4 md:grid-cols-2">
                  <div><Label className="mb-1 block text-xs font-semibold">Campaign Code</Label><Input value={campaignForm.campaignCode} onChange={(e) => setCampaignForm((prev) => ({ ...prev, campaignCode: e.target.value }))} className="bg-[#f9fbfe] border-[#dce6f2]" /></div>
                  <div><Label className="mb-1 block text-xs font-semibold">Campaign Name</Label><Input value={campaignForm.campaignName} onChange={(e) => setCampaignForm((prev) => ({ ...prev, campaignName: e.target.value }))} className="bg-[#f9fbfe] border-[#dce6f2]" /></div>
                  <div><Label className="mb-1 block text-xs font-semibold">Type</Label><select className="block w-full px-3 py-2 border border-[#dce6f2] rounded-md text-sm bg-[#f9fbfe]" value={campaignForm.campaignType} onChange={(e) => setCampaignForm((prev) => ({ ...prev, campaignType: e.target.value as typeof campaignForm.campaignType }))}><option value="bonus_points">Bonus points</option><option value="multiplier_event">Multiplier event</option><option value="flash_sale">Flash sale</option></select></div>
                  <div>
                    <Label className="mb-1 block text-xs font-semibold">Reward Link</Label>
                    <select className="block w-full px-3 py-2 border border-[#dce6f2] rounded-md text-sm bg-[#f9fbfe]" value={campaignForm.rewardId} onChange={(e) => setCampaignForm((prev) => ({ ...prev, rewardId: e.target.value }))}>
                      <option value="">No linked reward</option>
                      {campaignRewardOptions.filter((reward) => reward.rewardCatalogId).map((reward) => (
                        <option key={reward.rewardCatalogId ?? reward.id} value={String(reward.rewardCatalogId ?? "")}>{reward.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div><Label className="mb-1 block text-xs font-semibold">Description</Label><Textarea rows={2} value={campaignForm.description} onChange={(e) => setCampaignForm((prev) => ({ ...prev, description: e.target.value }))} className="bg-[#f9fbfe] border-[#dce6f2]" /></div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div><Label className="mb-1 block text-xs font-semibold">Banner Title</Label><Input value={campaignForm.bannerTitle} onChange={(e) => setCampaignForm((prev) => ({ ...prev, bannerTitle: e.target.value }))} className="bg-[#f9fbfe] border-[#dce6f2]" /></div>
                  <div><Label className="mb-1 block text-xs font-semibold">Banner Message</Label><Input value={campaignForm.bannerMessage} onChange={(e) => setCampaignForm((prev) => ({ ...prev, bannerMessage: e.target.value }))} className="bg-[#f9fbfe] border-[#dce6f2]" /></div>
                </div>
              </div>
            ) : null}

            {/* Step 2 */}
            {campaignWizardStep === 2 ? (
              <div className="space-y-4">
                <div className="rounded-[20px] border border-[#e4ecf4] bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-[#15243a] mb-3">Audience Rules</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div><Label className="mb-1 block text-xs font-semibold">Product Scope</Label><Input value={campaignForm.productScope} onChange={(e) => setCampaignForm((prev) => ({ ...prev, productScope: e.target.value }))} placeholder="pastry, beverage" className="bg-[#f9fbfe] border-[#dce6f2]" /></div>
                    <div><Label className="mb-1 block text-xs font-semibold">Eligible Tiers</Label><Input value={campaignForm.eligibleTiers} onChange={(e) => setCampaignForm((prev) => ({ ...prev, eligibleTiers: e.target.value }))} placeholder="Bronze,Silver,Gold" className="bg-[#f9fbfe] border-[#dce6f2]" /></div>
                  </div>
                </div>
                <div className="rounded-[20px] border border-[#dce3f8] bg-[#f8f9ff] p-5 shadow-sm">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-semibold text-[#25326b]">A/B Test Configuration</h3>
                    <label className="flex items-center gap-2 text-xs font-semibold text-[#4333bf]"><input type="checkbox" checked={abTestEnabled} onChange={(e) => setAbTestEnabled(e.target.checked)} className="rounded" /> Enable</label>
                  </div>
                  {abTestEnabled && (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div><Label className="mb-1 block text-xs font-semibold text-[#25326b]">Audience Split</Label><Input value={abAudienceSplit} onChange={(e) => setAbAudienceSplit(e.target.value)} className="bg-white border-[#dce3f8]" /></div>
                      <div><Label className="mb-1 block text-xs font-semibold text-[#25326b]">Success Metric</Label><select className="block w-full px-3 py-2 border border-[#dce3f8] rounded-md text-sm bg-white" value={abSuccessMetric} onChange={(e) => setAbSuccessMetric(e.target.value)}><option value="redemption_rate">Redemption rate</option><option value="points_awarded">Points awarded</option></select></div>
                      <div><Label className="mb-1 block text-xs font-semibold text-[#25326b]">Variant A</Label><Input value={variantAName} onChange={(e) => setVariantAName(e.target.value)} className="bg-white border-[#dce3f8]" /></div>
                      <div><Label className="mb-1 block text-xs font-semibold text-[#25326b]">Variant B</Label><Input value={variantBName} onChange={(e) => setVariantBName(e.target.value)} className="bg-white border-[#dce3f8]" /></div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* Step 3 */}
            {campaignWizardStep === 3 ? (
              <div className="rounded-[20px] border border-[#e4ecf4] bg-white p-5 space-y-4 shadow-sm">
                <div className="grid gap-4 md:grid-cols-2">
                  <div><Label className="mb-1 block text-xs font-semibold">Multiplier</Label><Input type="number" step="0.01" value={campaignForm.multiplier} onChange={(e) => setCampaignForm((prev) => ({ ...prev, multiplier: e.target.value }))} className="bg-[#f9fbfe] border-[#dce6f2]" /></div>
                  <div><Label className="mb-1 block text-xs font-semibold">Bonus Points</Label><Input type="number" value={campaignForm.bonusPoints} onChange={(e) => setCampaignForm((prev) => ({ ...prev, bonusPoints: e.target.value }))} className="bg-[#f9fbfe] border-[#dce6f2]" /></div>
                  <div><Label className="mb-1 block text-xs font-semibold">Minimum Purchase</Label><Input type="number" step="0.01" value={campaignForm.minimumPurchaseAmount} onChange={(e) => setCampaignForm((prev) => ({ ...prev, minimumPurchaseAmount: e.target.value }))} className="bg-[#f9fbfe] border-[#dce6f2]" /></div>
                  <div><Label className="mb-1 block text-xs font-semibold">Flash Limit</Label><Input type="number" value={campaignForm.flashSaleQuantityLimit} onChange={(e) => setCampaignForm((prev) => ({ ...prev, flashSaleQuantityLimit: e.target.value }))} className="bg-[#f9fbfe] border-[#dce6f2]" /></div>
                  <div><Label className="mb-1 block text-xs font-semibold">Countdown Label</Label><Input value={campaignForm.countdownLabel} onChange={(e) => setCampaignForm((prev) => ({ ...prev, countdownLabel: e.target.value }))} className="bg-[#f9fbfe] border-[#dce6f2]" /></div>
                  <div><Label className="mb-1 block text-xs font-semibold">Start Date</Label><CalendarDateTimePicker value={campaignForm.startsAt} onChange={(value) => setCampaignForm((prev) => ({ ...prev, startsAt: value }))} /></div>
                  <div><Label className="mb-1 block text-xs font-semibold">End Date</Label><CalendarDateTimePicker value={campaignForm.endsAt} onChange={(value) => setCampaignForm((prev) => ({ ...prev, endsAt: value }))} /></div>
                </div>
                <div className="flex items-center gap-2 text-sm text-[#15243a] p-3 bg-[#f9fbfe] rounded-lg border border-[#dce6f2]"><input type="checkbox" className="rounded text-[#0b8b95] focus:ring-[#0b8b95]" checked={campaignForm.pushNotificationEnabled} onChange={(e) => setCampaignForm((prev) => ({ ...prev, pushNotificationEnabled: e.target.checked }))} /> Queue push notifications after save</div>
              </div>
            ) : null}
          </div>

          <DialogFooter className="mt-4 pt-4 border-t border-[#e4ecf4] shrink-0 sm:justify-between">
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setCampaignWizardStep((prev) => (prev > 1 ? ((prev - 1) as CampaignWizardStep) : prev))} disabled={campaignWizardStep === 1}>Back</Button>
              <Button type="button" variant="outline" onClick={() => setCampaignWizardStep((prev) => (prev < 3 ? ((prev + 1) as CampaignWizardStep) : prev))} disabled={campaignWizardStep === 3}>Next</Button>
            </div>
            <div className="flex gap-2">
              <Button className={adminDarkButtonClass} onClick={() => { handleSaveCampaign(); setCampaignWizardOpen(false); }} disabled={savingCampaign}>{savingCampaign ? "Saving..." : "Save Draft"}</Button>
              <Button type="button" className="bg-[#0b8b95] hover:bg-[#097c85] text-white" onClick={() => { handleSaveAndPublishCampaign(); setCampaignWizardOpen(false); }} disabled={savingCampaign || Boolean(publishingCampaignId)}>
                {savingCampaign || publishingCampaignId ? "Publishing..." : "Save & Publish"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Campaign Performance Dialog */}
      <Dialog open={campaignPerformanceOpen} onOpenChange={setCampaignPerformanceOpen}>
        <DialogContent className="sm:max-w-[700px] p-6 bg-white rounded-[24px] border-0 shadow-2xl">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-lg font-bold text-[#15243a]">Campaign Performance</DialogTitle>
            <DialogDescription className="text-xs text-[#5a6a7e]">{selectedCampaign?.campaignName} ({performanceWindow})</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mb-5 border-b border-[#e4ecf4] pb-2">
            {(["overview", "audience", "engagement", "financials"] as CampaignPerformanceTab[]).map((tab) => (
              <button key={tab} type="button" onClick={() => setCampaignPerformanceTab(tab)} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${campaignPerformanceTab === tab ? "bg-[#15243a] text-white" : "text-[#5a6a7e] hover:bg-[#f9fbfe]"}`}>{tab[0].toUpperCase() + tab.slice(1)}</button>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {campaignPerformanceTab === "overview" && (
              <>
                <div className="bg-[#f9fbfe] border border-[#dce6f2] rounded-[16px] p-4"><p className="text-[10px] font-bold text-[#8f9eb2] uppercase mb-1">Tracked Activity</p><p className="text-2xl font-extrabold text-[#15243a]">{selectedCampaignPerformance?.trackedTransactions ?? 0}</p></div>
                <div className="bg-[#f9fbfe] border border-[#dce6f2] rounded-[16px] p-4"><p className="text-[10px] font-bold text-[#8f9eb2] uppercase mb-1">Notifications</p><p className="text-2xl font-extrabold text-[#15243a]">{selectedCampaignPerformance?.notificationsSent ?? 0}</p></div>
                <div className="bg-[#f9fbfe] border border-[#dce6f2] rounded-[16px] p-4"><p className="text-[10px] font-bold text-[#8f9eb2] uppercase mb-1">Redemptions</p><p className="text-2xl font-extrabold text-[#15243a]">{selectedCampaignPerformance?.redemptionCount ?? 0}</p></div>
                <div className="bg-[#f9fbfe] border border-[#dce6f2] rounded-[16px] p-4"><p className="text-[10px] font-bold text-[#8f9eb2] uppercase mb-1">Status</p><p className="text-lg font-bold text-[#15243a]">{selectedCampaign?.status || "Unknown"}</p></div>
              </>
            )}
            {campaignPerformanceTab === "audience" && (
              <>
                <div className="bg-[#f9fbfe] border border-[#dce6f2] rounded-[16px] p-4"><p className="text-[10px] font-bold text-[#8f9eb2] uppercase mb-1">Eligible Tiers</p><p className="text-lg font-bold text-[#15243a]">{selectedCampaign?.eligibleTiers?.join(", ") || "All tiers"}</p></div>
                <div className="bg-[#f9fbfe] border border-[#dce6f2] rounded-[16px] p-4"><p className="text-[10px] font-bold text-[#8f9eb2] uppercase mb-1">Product Scope</p><p className="text-lg font-bold text-[#15243a]">{selectedCampaign?.productScope?.join(", ") || "All products"}</p></div>
                <div className="bg-[#f9fbfe] border border-[#dce6f2] rounded-[16px] p-4"><p className="text-[10px] font-bold text-[#8f9eb2] uppercase mb-1">A/B Enabled</p><p className="text-lg font-bold text-[#15243a]">{abTestEnabled ? "Yes" : "No"}</p></div>
                <div className="bg-[#f9fbfe] border border-[#dce6f2] rounded-[16px] p-4"><p className="text-[10px] font-bold text-[#8f9eb2] uppercase mb-1">Audience Split</p><p className="text-lg font-bold text-[#15243a]">{abAudienceSplit}</p></div>
              </>
            )}
            {campaignPerformanceTab === "engagement" && (
              <>
                <div className="bg-[#f9fbfe] border border-[#dce6f2] rounded-[16px] p-4"><p className="text-[10px] font-bold text-[#8f9eb2] uppercase mb-1">Notifications Sent</p><p className="text-2xl font-extrabold text-[#15243a]">{selectedCampaignPerformance?.notificationsSent ?? 0}</p></div>
                <div className="bg-[#f9fbfe] border border-[#dce6f2] rounded-[16px] p-4"><p className="text-[10px] font-bold text-[#8f9eb2] uppercase mb-1">Success Metric</p><p className="text-lg font-bold text-[#15243a]">{abSuccessMetric.replace("_", " ")}</p></div>
                <div className="bg-[#f9fbfe] border border-[#dce6f2] rounded-[16px] p-4"><p className="text-[10px] font-bold text-[#8f9eb2] uppercase mb-1">Primary Variant</p><p className="text-lg font-bold text-[#15243a]">{variantAName}</p></div>
                <div className="bg-[#f9fbfe] border border-[#dce6f2] rounded-[16px] p-4"><p className="text-[10px] font-bold text-[#8f9eb2] uppercase mb-1">Comparison Variant</p><p className="text-lg font-bold text-[#15243a]">{variantBName}</p></div>
              </>
            )}
            {campaignPerformanceTab === "financials" && (
              <>
                <div className="bg-[#f9fbfe] border border-[#dce6f2] rounded-[16px] p-4"><p className="text-[10px] font-bold text-[#8f9eb2] uppercase mb-1">Minimum Purchase</p><p className="text-2xl font-extrabold text-[#15243a]">PHP {Number(selectedCampaign?.minimumPurchaseAmount ?? 0).toFixed(2)}</p></div>
                <div className="bg-[#f9fbfe] border border-[#dce6f2] rounded-[16px] p-4"><p className="text-[10px] font-bold text-[#8f9eb2] uppercase mb-1">Points Cost</p><p className="text-2xl font-extrabold text-[#15243a]">{selectedCampaign?.bonusPoints ?? selectedCampaignPerformance?.pointsAwarded ?? 0}</p></div>
                <div className="bg-[#f9fbfe] border border-[#dce6f2] rounded-[16px] p-4 md:col-span-2"><p className="text-[10px] font-bold text-[#8f9eb2] uppercase mb-1">Estimated ROI</p><p className="text-2xl font-extrabold text-[#0b7f88]">{campaignListRows.find((row) => row.campaign.id === selectedCampaign?.id)?.roi.toFixed(1) ?? "0.0"}%</p></div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Partner Dashboard Dialog */}
      <Dialog open={partnerDashboardOpen} onOpenChange={setPartnerDashboardOpen}>
        <DialogContent className="sm:max-w-[700px] p-6 bg-white rounded-[24px] border-0 shadow-2xl overflow-auto max-h-[90vh]">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-lg font-bold text-[#15243a]">Partner Configuration</DialogTitle>
            <DialogDescription className="text-xs text-[#5a6a7e]">Add or edit a reward partner.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2 mb-4">
            <div><Label className="mb-1 block text-xs font-semibold">Partner Code</Label><Input value={partnerForm.partnerCode} onChange={(e) => setPartnerForm((prev) => ({ ...prev, partnerCode: e.target.value }))} className="bg-[#f9fbfe] border-[#dce6f2]" /></div>
            <div><Label className="mb-1 block text-xs font-semibold">Partner Name</Label><Input value={partnerForm.partnerName} onChange={(e) => setPartnerForm((prev) => ({ ...prev, partnerName: e.target.value }))} className="bg-[#f9fbfe] border-[#dce6f2]" /></div>
            <div><Label className="mb-1 block text-xs font-semibold">Conversion Rate</Label><Input type="number" step="0.01" value={partnerForm.conversionRate} onChange={(e) => setPartnerForm((prev) => ({ ...prev, conversionRate: e.target.value }))} className="bg-[#f9fbfe] border-[#dce6f2]" /></div>
            <div><Label className="mb-1 block text-xs font-semibold">Logo URL</Label><Input value={partnerForm.logoUrl} onChange={(e) => setPartnerForm((prev) => ({ ...prev, logoUrl: e.target.value }))} className="bg-[#f9fbfe] border-[#dce6f2]" /></div>
          </div>
          <div className="mb-4"><Label className="mb-1 block text-xs font-semibold">Description</Label><Textarea rows={3} value={partnerForm.description} onChange={(e) => setPartnerForm((prev) => ({ ...prev, description: e.target.value }))} className="bg-[#f9fbfe] border-[#dce6f2]" /></div>
          <label className="flex items-center gap-2 text-sm text-[#15243a] font-semibold"><input type="checkbox" checked={partnerForm.isActive} onChange={(e) => setPartnerForm((prev) => ({ ...prev, isActive: e.target.checked }))} className="rounded text-[#0b8b95] focus:ring-[#0b8b95]" /> Active partner</label>
          
          <DialogFooter className="mt-6 pt-4 border-t border-[#e4ecf4] sm:justify-end gap-2">
            <Button variant="outline" className="border-[#dce6f2] rounded-full px-6 text-[#15243a]" onClick={() => setPartnerDashboardOpen(false)}>Cancel</Button>
            <Button className="bg-[#0b8b95] hover:bg-[#097c85] rounded-full px-6 text-white" onClick={() => { handleSavePartner(); setPartnerDashboardOpen(false); }} disabled={savingPartner}>{savingPartner ? "Saving..." : "Save Partner"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

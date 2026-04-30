import { useEffect, useMemo, useState } from "react";
import { Award, ShoppingBag, Gift, Store, Truck } from "lucide-react";
import type { Reward } from "../../types/loyalty";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { Switch } from "../../../components/ui/switch";
import { ImageWithFallback } from "../../../components/figma/ImageWithFallback";
import { toast } from "sonner";
import { useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "../../types/app-context";
import { cn } from "../../../components/ui/utils";
import { loadRewardsCatalog } from "../../lib/loyalty-supabase";
import { ensureMemberNotification } from "../../lib/notifications";
import { loadActivePromotionCampaigns, type PromotionCampaign } from "../../lib/promotions";
import { loadActiveCampaignsViaApi, recordPartnerTransactionViaApi, redeemPointsViaApi } from "../../lib/api";
import {
  brandNavyBadgeClass,
  brandNavySolidClass,
  brandNavySolidHoverClass,
  brandTealSolidClass,
  brandTealSolidHoverClass,
  brandTealSurfaceClass,
} from "../../lib/ui-color-tokens";
import {
  customerEyebrowClass,
  customerPageDescriptionClass,
  customerPageHeroClass,
  customerPageHeroInnerClass,
  customerPanelClass,
  customerPanelSoftClass,
  customerPageTitleClass,
  customerTabClass,
  customerTabRailClass,
} from "../lib/page-theme";

const rewardImages = [
  "https://images.unsplash.com/photo-1657048167114-0942f3a2dc93?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
  "https://images.unsplash.com/photo-1751151856149-5ebf1d21586a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
  "https://images.unsplash.com/photo-1680381724318-c8ac9fe3a484?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
  "https://images.unsplash.com/photo-1738682585466-c287db5404de?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
  "https://images.unsplash.com/photo-1561766858-62033ae40ec3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
  "https://images.unsplash.com/photo-1666447616947-cd26838cb88b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
  "https://images.unsplash.com/photo-1637910116483-7efcc9480847?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
  "https://images.unsplash.com/photo-1683888046273-38c106471115?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
];

type RedemptionMethod = "in-store" | "online";
type RewardCategoryTab = "all" | "flash" | "partner" | "beverage" | "food" | "merchandise" | "voucher";

const rewardCategoryTabs: { value: RewardCategoryTab; label: string; hash: string }[] = [
  { value: "all", label: "All Rewards", hash: "#rewards-all" },
  { value: "flash", label: "Flash Sale", hash: "#rewards-flash" },
  { value: "partner", label: "Partner", hash: "#rewards-partner" },
  { value: "beverage", label: "Beverages", hash: "#rewards-beverage" },
  { value: "food", label: "Food", hash: "#rewards-food" },
  { value: "merchandise", label: "Merchandise", hash: "#rewards-merchandise" },
  { value: "voucher", label: "Vouchers", hash: "#rewards-voucher" },
];

function formatCountdown(targetDate?: string | null, nowTs = Date.now()) {
  if (!targetDate) return null;
  const diff = new Date(targetDate).getTime() - nowTs;
  if (diff <= 0) return "Ended";

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const paddedSeconds = `${seconds}`.padStart(2, "0");

  if (days > 0) return `${days}d ${hours}h ${minutes}m ${paddedSeconds}s`;
  if (hours > 0) return `${hours}h ${minutes}m ${paddedSeconds}s`;
  return `${minutes}m ${paddedSeconds}s`;
}

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveNumberOrNull(value: unknown) {
  const parsed = safeNumber(value, 0);
  return parsed > 0 ? parsed : null;
}

function fixed(value: unknown, digits = 2) {
  return safeNumber(value, 0).toFixed(digits);
}

function normalizeReward(reward: Reward): Reward {
  return {
    ...reward,
    id: String(reward.id ?? ""),
    name: String(reward.name ?? "Reward"),
    description: String(reward.description ?? ""),
    pointsCost: safeNumber(reward.pointsCost, 0),
    available: Boolean(reward.available ?? true),
    cashValue: positiveNumberOrNull(reward.cashValue),
    partnerConversionRate: positiveNumberOrNull(reward.partnerConversionRate),
    flashSaleQuantityLimit:
      reward.flashSaleQuantityLimit === null || reward.flashSaleQuantityLimit === undefined
        ? null
        : safeNumber(reward.flashSaleQuantityLimit, 0),
    flashSaleClaimedCount: safeNumber(reward.flashSaleClaimedCount, 0),
  };
}

function normalizeCampaign(campaign: PromotionCampaign): PromotionCampaign {
  return {
    ...campaign,
    multiplier: safeNumber(campaign.multiplier, 0),
    minimumPurchaseAmount: safeNumber(campaign.minimumPurchaseAmount, 0),
    bonusPoints: safeNumber(campaign.bonusPoints, 0),
    eligibleTiers: Array.isArray(campaign.eligibleTiers) ? campaign.eligibleTiers : [],
    productScope: Array.isArray(campaign.productScope) ? campaign.productScope : [],
    flashSaleClaimedCount: safeNumber(campaign.flashSaleClaimedCount, 0),
    budgetSpent: safeNumber(campaign.budgetSpent, 0),
  };
}

export default function Rewards() {
  const { user, refreshUser } = useOutletContext<AppOutletContext>();
  const [activeTab, setActiveTab] = useState<RewardCategoryTab>("all");
  const [catalog, setCatalog] = useState<Reward[]>([]);
  const [activeCampaigns, setActiveCampaigns] = useState<PromotionCampaign[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
  const [redeemDialogOpen, setRedeemDialogOpen] = useState(false);
  const [giftDialogOpen, setGiftDialogOpen] = useState(false);
  const [reserveDialogOpen, setReserveDialogOpen] = useState(false);
  const [redemptionMethod, setRedemptionMethod] = useState<RedemptionMethod>("in-store");
  const [usePoints, setUsePoints] = useState(false);
  const [autoApplyAtCheckout, setAutoApplyAtCheckout] = useState(false);
  const [checkoutAmount, setCheckoutAmount] = useState("");
  const [pointsToUse, setPointsToUse] = useState("");
  const [giftEmail, setGiftEmail] = useState("");
  const [giftMessage, setGiftMessage] = useState("");
  const [redeemSearch, setRedeemSearch] = useState("");
  const [reservedRewards, setReservedRewards] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [countdownNow, setCountdownNow] = useState(() => Date.now());

  const loadRewardsData = async (memberTier: string) => {
    setLoadingData(true);
    setLoadError(null);

    try {
      const [rewards, campaignsResponse] = await Promise.all([
        loadRewardsCatalog(),
        loadActiveCampaignsViaApi(memberTier).catch(async () => ({
          ok: true as const,
          campaigns: await loadActivePromotionCampaigns(memberTier),
        })),
      ]);

      setCatalog(rewards.map(normalizeReward));
      setActiveCampaigns(campaignsResponse.campaigns.map(normalizeCampaign));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load rewards right now.");
      setCatalog([]);
      setActiveCampaigns([]);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    const matchedTab = rewardCategoryTabs.find((tab) => tab.hash === hash);
    if (matchedTab) {
      setActiveTab(matchedTab.value);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const current = rewardCategoryTabs.find((tab) => tab.value === activeTab);
    if (!current) return;
    const nextUrl = `${window.location.pathname}${window.location.search}${current.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, [activeTab]);

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setLoadingData(true);
      setLoadError(null);

      try {
        const [rewards, campaignsResponse] = await Promise.all([
          loadRewardsCatalog(),
          loadActiveCampaignsViaApi(user.tier).catch(async () => ({
            ok: true as const,
            campaigns: await loadActivePromotionCampaigns(user.tier),
          })),
        ]);

        if (!active) return;
        setCatalog(rewards.map(normalizeReward));
        setActiveCampaigns(campaignsResponse.campaigns.map(normalizeCampaign));
      } catch (error) {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : "Unable to load rewards right now.");
        setCatalog([]);
        setActiveCampaigns([]);
      } finally {
        if (active) {
          setLoadingData(false);
        }
      }
    };

    void loadData();
    const interval = window.setInterval(() => {
      void loadActiveCampaignsViaApi(user.tier)
        .then((response) => setActiveCampaigns(response.campaigns.map(normalizeCampaign)))
        .catch(() => undefined);
    }, 30_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [user.tier]);

  useEffect(() => {
    if (!user.memberId) return;

    const activeFlashRewards = catalog.filter((reward) => {
      if (!reward.activeFlashSaleId || !reward.flashSaleStartsAt || !reward.flashSaleEndsAt) return false;
      const startsAt = new Date(reward.flashSaleStartsAt).getTime();
      const endsAt = new Date(reward.flashSaleEndsAt).getTime();
      return startsAt <= Date.now() && endsAt > Date.now();
    });

    activeFlashRewards.forEach((reward) => {
      const notificationKey = `flash-live:${user.memberId}:${reward.id}:${reward.flashSaleEndsAt ?? ""}`;
      if (typeof window !== "undefined" && window.sessionStorage.getItem(notificationKey)) {
        return;
      }

      void ensureMemberNotification({
        memberId: user.memberId,
        channel: "push",
        subject: "Flash Sale Live",
        message: `Flash sale now live: ${reward.name}. Redeem it before ${new Date(String(reward.flashSaleEndsAt)).toLocaleString()}.`,
        isTransactional: true,
      })
        .then((result) => {
          if (result.queued && typeof window !== "undefined") {
            window.sessionStorage.setItem(notificationKey, "1");
          }
        })
        .catch(() => undefined);
    });
  }, [catalog, user.memberId]);

  useEffect(() => {
    const interval = window.setInterval(() => setCountdownNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const filteredRewards = useMemo(() => catalog.filter((reward) => reward.available), [catalog]);
  const flashSaleRewards = useMemo(
    () =>
      filteredRewards.filter((reward) => {
        if (!reward.activeFlashSaleId || !reward.flashSaleStartsAt) return false;
        const startsAt = new Date(reward.flashSaleStartsAt).getTime();
        const endsAt = reward.flashSaleEndsAt ? new Date(reward.flashSaleEndsAt).getTime() : Number.POSITIVE_INFINITY;
        return startsAt <= countdownNow && endsAt > countdownNow;
      }),
    [filteredRewards, countdownNow]
  );
  const partnerRewards = useMemo(
    () => filteredRewards.filter((reward) => Boolean(reward.partnerId)),
    [filteredRewards]
  );
  const bonusCampaigns = useMemo(
    () => activeCampaigns.filter((campaign) => campaign.campaignType !== "flash_sale"),
    [activeCampaigns]
  );
  const redeemedHistory = useMemo(() => {
    const keyword = redeemSearch.trim().toLowerCase();
    return user.transactions
      .filter((tx) => tx.type === "redeemed")
      .filter((tx) => (keyword ? tx.description.toLowerCase().includes(keyword) : true));
  }, [user.transactions, redeemSearch]);

  const isFlashSaleSoldOut = (reward: Reward) =>
    Boolean(
      reward.activeFlashSaleId &&
        reward.flashSaleQuantityLimit !== null &&
        reward.flashSaleQuantityLimit !== undefined &&
        (reward.flashSaleClaimedCount ?? 0) >= reward.flashSaleQuantityLimit
    );

  const isFlashSaleExpired = (reward: Reward) =>
    Boolean(reward.activeFlashSaleId && reward.flashSaleEndsAt && new Date(reward.flashSaleEndsAt).getTime() <= countdownNow);

  const spendPoints = async (
    points: number,
    description: string,
    category = "Reward",
    type: "redeemed" | "gifted" = "redeemed",
    reward?: Reward | null
  ) => {
    await redeemPointsViaApi({
      memberIdentifier: user.memberId,
      fallbackEmail: user.email,
      points,
      transactionType: type === "gifted" ? "GIFT" : "REDEEM",
      reason: `${description}${category ? ` [${category}]` : ""}${type === "gifted" ? " (gifted)" : ""}`,
      rewardCatalogId: reward?.rewardCatalogId,
      promotionCampaignId: reward?.activeFlashSaleId || null,
    });

    if (type !== "gifted" && reward?.partnerId && reward.partnerCode && reward.partnerName) {
      await recordPartnerTransactionViaApi({
        partnerId: String(reward.partnerId),
        partnerCode: reward.partnerCode,
        partnerName: reward.partnerName,
        memberId: user.memberId,
        memberEmail: user.email,
        orderId: `reward-${reward.id}-${Date.now()}`,
        points,
        grossAmount:
          Number(reward.cashValue ?? 0) > 0
            ? Number(reward.cashValue ?? 0)
            : Number(reward.partnerConversionRate ?? 0) > 0
              ? Number((points / Number(reward.partnerConversionRate)).toFixed(2))
              : 0,
        note: description,
      }).catch(() => undefined);
    }

    await refreshUser({ force: true });
  };

  const handleReserve = (reward: Reward) => {
    setSelectedReward(reward);
    setReserveDialogOpen(true);
  };

  const confirmReserve = () => {
    if (!selectedReward) return;
    if (reservedRewards.includes(selectedReward.id)) {
      toast.info("This reward is already reserved.");
      setReserveDialogOpen(false);
      return;
    }
    setReservedRewards((prev) => [...prev, selectedReward.id]);
    toast.success("Reward reserved!", { description: `${selectedReward.name} reserved for 24 hours` });
    setReserveDialogOpen(false);
  };

  const handleRedeem = (reward: Reward) => {
    if (isFlashSaleSoldOut(reward)) {
      toast.error("This flash sale reward is sold out.");
      return;
    }
    if (isFlashSaleExpired(reward)) {
      toast.error("This reward has expired.");
      return;
    }
    setSelectedReward(reward);
    setRedeemDialogOpen(true);
  };

  const confirmRedeem = async () => {
    if (!selectedReward) return;
    if (isFlashSaleSoldOut(selectedReward)) {
      toast.error("Flash sale reward is already sold out.");
      return;
    }
    if (isFlashSaleExpired(selectedReward)) {
      toast.error("This flash sale has already ended.");
      return;
    }
    try {
      setSaving(true);
      await spendPoints(safeNumber(selectedReward.pointsCost, 0), `${selectedReward.name} Redemption`, "Reward", "redeemed", selectedReward);
      setReservedRewards((prev) => prev.filter((id) => id !== selectedReward.id));
      if (selectedReward.activeFlashSaleId) {
        setCatalog((prev) =>
          prev.map((reward) =>
            reward.id === selectedReward.id
              ? { ...reward, flashSaleClaimedCount: (reward.flashSaleClaimedCount ?? 0) + 1 }
              : reward
          )
        );
      }
      toast.success("Reward redeemed!", {
        description: redemptionMethod === "online" ? `${selectedReward.name} will be delivered.` : `Show this confirmation at the counter for ${selectedReward.name}.`,
      });
      setRedeemDialogOpen(false);
      setRedemptionMethod("in-store");
    } catch (error) {
      const errorMessage =
        error && typeof error === "object" && "message" in error && typeof error.message === "string"
          ? error.message
          : "Redeem failed";
      toast.error("Redeem failed", { description: errorMessage });
    } finally {
      setSaving(false);
    }
  };

  const handleGift = (reward: Reward) => {
    setSelectedReward(reward);
    setGiftDialogOpen(true);
  };

  const confirmGift = async () => {
    if (!selectedReward || !giftEmail) return;
    try {
      setSaving(true);
      const giftPoints = safeNumber(selectedReward.pointsCost, 0);
      await spendPoints(giftPoints, `Gifted: ${selectedReward.name} to ${giftEmail}`, "Transfer", "gifted", selectedReward);
      toast.success("Points gifted!", { description: `${giftPoints} points sent to ${giftEmail}` });
      setGiftDialogOpen(false);
      setGiftEmail("");
      setGiftMessage("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gift failed");
    } finally {
      setSaving(false);
    }
  };

  const handlePartialPayment = async () => {
    const points = parseInt(pointsToUse, 10);
    if (!Number.isFinite(points) || points <= 0) {
      toast.error("Enter a valid point amount.");
      return;
    }

    try {
      setSaving(true);
      await spendPoints(points, "Partial payment applied", "Checkout");
      toast.success(`${points} points applied!`);
      setUsePoints(false);
      setPointsToUse("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Apply failed");
    } finally {
      setSaving(false);
    }
  };

  const handleAutoApplyCheckout = async () => {
    const subtotal = parseFloat(checkoutAmount);
    if (!subtotal || subtotal <= 0) {
      toast.error("Enter a valid checkout amount.");
      return;
    }

    const maxApplicablePoints = Math.min(user.points, Math.floor(subtotal * 100));
    if (maxApplicablePoints <= 0) {
      toast.error("No points available to apply.");
      return;
    }

    try {
      setSaving(true);
      await spendPoints(maxApplicablePoints, `Auto apply checkout ($${subtotal.toFixed(2)})`, "Checkout");
      const finalAmount = Math.max(0, subtotal - maxApplicablePoints / 100);
      toast.success("Points auto-applied at checkout!", {
        description: `${maxApplicablePoints} points used. New payable total: $${finalAmount.toFixed(2)}`,
      });
      setCheckoutAmount("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Auto apply failed");
    } finally {
      setSaving(false);
    }
  };


  const renderRewardCard = (reward: Reward, imageIndex: number) => {
    const isReserved = reservedRewards.includes(reward.id);
    const pointsCost = safeNumber(reward.pointsCost, 0);
    const userPoints = safeNumber(user.points, 0);
    const cashValue = positiveNumberOrNull(reward.cashValue);
    const partnerConversionRate = positiveNumberOrNull(reward.partnerConversionRate);
    reward = { ...reward, cashValue, partnerConversionRate };
    const canAfford = userPoints >= pointsCost;
    const soldOut = isFlashSaleSoldOut(reward);
    const expired = isFlashSaleExpired(reward);
    const unavailable = soldOut || expired;
    const safeImageIndex = imageIndex >= 0 ? imageIndex : 0;
    const imageSrc = reward.imageUrl || rewardImages[safeImageIndex % rewardImages.length];

    return (
      <Card
        key={reward.id}
        className={cn(
          "overflow-hidden transition-shadow",
          unavailable ? "relative border-[#f3c2c2] bg-[#fff8f8] shadow-sm" : "hover:shadow-lg"
        )}
      >
        <div className="relative">
          <ImageWithFallback src={imageSrc} alt={reward.name} className="w-full h-48 object-cover" />
          {isReserved && <Badge className="absolute top-3 right-3 bg-sky-600 text-white">Reserved</Badge>}
          {reward.activeFlashSaleId ? (
            <Badge className="absolute top-3 left-3 bg-[#ef4444] text-white">
              {soldOut ? "Sold Out" : expired ? "Ended" : `Flash Sale ${formatCountdown(reward.flashSaleEndsAt, countdownNow)}`}
            </Badge>
          ) : null}
          {unavailable ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/62 backdrop-blur-[2px]">
              <div className="mx-6 rounded-2xl border border-[#f3c2c2] bg-white/90 px-4 py-3 text-center shadow-sm">
                <p className="text-sm font-semibold text-[#991b1b]">
                  {expired ? "This reward has expired" : "This reward is sold out"}
                </p>
                <p className="mt-1 text-xs text-[#b45309]">
                  {expired ? "Flash sale redemption is no longer available." : "All flash sale slots have been claimed."}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className={cn("p-6", unavailable && "opacity-80")}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-gray-900">{reward.name}</h3>
            {reward.partnerName ? <Badge variant="outline">{reward.partnerName}</Badge> : null}
          </div>
          <p className="text-sm text-gray-600 mb-4">{reward.description}</p>

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-baseline gap-1"><span className="text-2xl font-bold text-sky-600">{pointsCost}</span><span className="text-sm text-gray-500">points</span></div>
            <Badge variant="outline" className="capitalize">{reward.category}</Badge>
          </div>

          {cashValue ? (
            <p className="mb-4 text-xs text-gray-500">
              Partner value PHP {fixed(cashValue)}
              {partnerConversionRate ? ` - ${fixed(partnerConversionRate)} pts per PHP` : ""}
            </p>
          ) : null}

          {reward.activeFlashSaleId ? (
            <div className="mb-4 rounded-xl border border-[#fecaca] bg-[#fff5f5] px-3 py-2 text-sm text-[#991b1b]">
              <p className="font-medium">{reward.flashSaleBanner || "Limited-time offer"}</p>
              <p className="mt-1 text-xs">
                {reward.flashSaleCountdownLabel || "Ends soon"} • {reward.flashSaleClaimedCount ?? 0}
                {reward.flashSaleQuantityLimit ? ` / ${reward.flashSaleQuantityLimit} claimed` : " claimed"}
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              className={`flex-1 min-w-[120px] ${brandNavySolidClass} ${brandNavySolidHoverClass}`}
              onClick={() => handleRedeem(reward)}
              disabled={saving || unavailable || !canAfford}
            >
              {expired ? "This Reward Has Expired" : soldOut ? "Sold Out" : isReserved ? "Redeem Now" : "Redeem"}
            </Button>
            {!isReserved && canAfford && !unavailable ? <Button variant="outline" className="border-gray-200 text-[#1A2B47] hover:bg-[#e9edf5] hover:text-[#1A2B47]" onClick={() => handleReserve(reward)}>Reserve</Button> : null}
            <Button variant="outline" className="border-gray-200 text-[#1A2B47] hover:bg-[#e9edf5] hover:text-[#1A2B47]" size="icon" onClick={() => handleGift(reward)} disabled={saving}><Gift className="w-4 h-4" /></Button>
          </div>

          {expired ? (
            <p className="mt-2 text-xs font-medium text-[#991b1b]">This flash sale reward has expired.</p>
          ) : soldOut ? (
            <p className="mt-2 text-xs font-medium text-[#991b1b]">This flash sale reward is sold out.</p>
          ) : !canAfford ? (
            <p className="text-xs text-orange-600 mt-2">Need {Math.max(0, pointsCost - userPoints)} more points</p>
          ) : null}
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className={customerPageHeroClass}>
        <div className={customerPageHeroInnerClass}>
          <div className={customerEyebrowClass}>Reward Studio</div>
          <h1 className={customerPageTitleClass}>Rewards</h1>
          <p className={customerPageDescriptionClass}>Redeem your points for curated member rewards, flash sale offers, and partner picks in a calmer, more cohesive portal view.</p>
        </div>
      </div>

      <Card className="p-6 bg-gradient-to-br from-[#1A2B47] to-[#1A2B47] border-0 text-white">
        <div className="flex items-center justify-between gap-4">
          <div><p className="text-white/90 text-sm font-medium">Available Points</p><h2 className="text-4xl font-bold mt-2 text-white">{user.points.toLocaleString()}</h2><p className="text-white/85 text-sm mt-1">{user.pendingPoints > 0 && `+${user.pendingPoints} pending`}</p></div>
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center"><Award className="w-8 h-8" /></div>
        </div>
      </Card>

      {loadError ? (
        <Card className="border border-[#f3c2c2] bg-[#fff8f8] p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#991b1b]">Rewards data failed to load</p>
              <p className="mt-1 text-sm text-[#7f1d1d]">{loadError}</p>
            </div>
            <Button
              variant="outline"
              className="border-[#d7b0b0] text-[#7f1d1d] hover:bg-[#fff1f1]"
              onClick={() => {
                void loadRewardsData(user.tier);
              }}
            >
              Retry
            </Button>
          </div>
        </Card>
      ) : null}

      {loadingData && catalog.length === 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={`reward-skeleton-${index}`} className="overflow-hidden border border-[#dce8f5]">
              <div className="h-48 animate-pulse bg-[#e9eff7]" />
              <div className="space-y-3 p-6">
                <div className="h-5 w-2/3 animate-pulse rounded bg-[#e9eff7]" />
                <div className="h-4 w-full animate-pulse rounded bg-[#eef3f9]" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-[#eef3f9]" />
                <div className="h-10 w-full animate-pulse rounded-xl bg-[#e1e8f2]" />
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      {bonusCampaigns.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {bonusCampaigns.map((campaign) => (
            <Card
              key={campaign.id}
              className="overflow-hidden border border-[#d9e7f5] bg-[linear-gradient(135deg,#ffffff_0%,#f5fbff_100%)]"
            >
              <div className="p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={brandNavyBadgeClass}>{campaign.campaignType === "multiplier_event" ? "Multiplier Event" : "Bonus Campaign"}</Badge>
                  {(campaign.eligibleTiers ?? []).length > 0 ? (
                    <Badge variant="outline">{(campaign.eligibleTiers ?? []).join(", ")}</Badge>
                  ) : null}
                </div>
                <h3 className="mt-3 text-xl font-semibold text-gray-900">{campaign.bannerTitle || campaign.campaignName}</h3>
                <p className="mt-2 text-sm text-gray-600">{campaign.bannerMessage || campaign.description}</p>
                <div className="mt-4 flex flex-wrap gap-4 text-sm text-[#1A2B47]">
                  <span>{safeNumber(campaign.multiplier, 0) > 1 ? `${fixed(campaign.multiplier, 0)}x points` : `${safeNumber(campaign.bonusPoints, 0)} bonus points`}</span>
                  <span>Min purchase ${fixed(campaign.minimumPurchaseAmount)}</span>
                  <span>Ends {new Date(campaign.endsAt).toLocaleString()}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      {flashSaleRewards.length > 0 ? (
        <Card className="p-6 border-[#fecaca] bg-[linear-gradient(135deg,#fff7f7_0%,#ffffff_100%)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Flash Sales Live Now</h2>
              <p className="text-sm text-gray-600 mt-1">Limited quantity offers with live countdown timers and sold-out protection.</p>
            </div>
            <Badge className="bg-[#ef4444] text-white">{flashSaleRewards.length} live</Badge>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {flashSaleRewards.map((reward, index) => (
              <div
                key={`flash-${reward.id}`}
                className={cn(
                  "relative rounded-2xl border border-[#f3c2c2] bg-white p-4 shadow-sm",
                  (isFlashSaleSoldOut(reward) || isFlashSaleExpired(reward)) && "overflow-hidden bg-[#fff8f8]"
                )}
              >
                {isFlashSaleSoldOut(reward) || isFlashSaleExpired(reward) ? (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-[2px]">
                    <div className="rounded-2xl border border-[#f3c2c2] bg-white/92 px-4 py-3 text-center shadow-sm">
                      <p className="text-sm font-semibold text-[#991b1b]">
                        {isFlashSaleExpired(reward) ? "This reward has expired" : "This reward is sold out"}
                      </p>
                    </div>
                  </div>
                ) : null}
                <div className="flex gap-4">
                  <ImageWithFallback
                    src={reward.imageUrl || rewardImages[index % rewardImages.length]}
                    alt={reward.name}
                    className="h-24 w-24 rounded-xl object-cover"
                  />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-900">{reward.name}</p>
                      <Badge className="bg-[#ef4444] text-white">{formatCountdown(reward.flashSaleEndsAt, countdownNow)}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{reward.description}</p>
                    <p className="mt-2 text-sm text-[#991b1b]">
                      {reward.flashSaleClaimedCount ?? 0}
                      {reward.flashSaleQuantityLimit ? ` / ${reward.flashSaleQuantityLimit}` : ""} claimed
                    </p>
                    <Button
                      className="mt-3 bg-[#10213a] text-white hover:bg-[#1b3153]"
                      disabled={saving || isFlashSaleSoldOut(reward) || isFlashSaleExpired(reward)}
                      onClick={() => handleRedeem(reward)}
                    >
                      {isFlashSaleExpired(reward)
                        ? "This Reward Has Expired"
                        : isFlashSaleSoldOut(reward)
                          ? "Sold Out"
                          : `Redeem for ${reward.pointsCost} pts`}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card className={customerPanelClass}>
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 mb-2">Use Points as Partial Payment</h3>
            <p className="text-sm text-gray-600 mb-4">Apply your points to reduce the cost of any purchase (1 point = $0.01)</p>
            {usePoints && (
              <div className="flex flex-col sm:flex-row gap-3 max-w-md">
                <Input type="number" placeholder="Enter points" value={pointsToUse} onChange={(e) => setPointsToUse(e.target.value)} max={user.points} />
                <Button className={`${brandTealSolidClass} ${brandTealSolidHoverClass}`} onClick={handlePartialPayment} disabled={saving || !pointsToUse || parseInt(pointsToUse, 10) <= 0}>Apply</Button>
              </div>
            )}
          </div>
          <Button variant={usePoints ? "outline" : "default"} className={cn("w-full sm:w-auto", !usePoints ? `${brandNavySolidClass} ${brandNavySolidHoverClass}` : "")} onClick={() => setUsePoints((prev) => !prev)}>{usePoints ? "Cancel" : "Use Points"}</Button>
        </div>
      </Card>

      <Card className={cn("p-6", brandTealSurfaceClass)}>
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 mb-1">Apply Points Automatically at Checkout</h3>
            <p className="text-sm text-gray-600 mb-3">Enable auto-apply to use the maximum available points for your current checkout amount.</p>
            {autoApplyAtCheckout && (
              <div className="flex flex-col sm:flex-row gap-3 max-w-xl">
                <Input type="number" step="0.01" min="0" placeholder="Checkout amount (e.g. 18.50)" value={checkoutAmount} onChange={(e) => setCheckoutAmount(e.target.value)} />
                <Button className={`${brandNavySolidClass} ${brandNavySolidHoverClass}`} onClick={handleAutoApplyCheckout} disabled={saving}>Auto Apply</Button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 pt-1"><Label htmlFor="auto-apply">Auto Apply</Label><Switch id="auto-apply" checked={autoApplyAtCheckout} onCheckedChange={setAutoApplyAtCheckout} /></div>
        </div>
      </Card>

      {reservedRewards.length > 0 && (
        <Card className={customerPanelClass}>
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><ShoppingBag className="w-5 h-5" />Reserved Rewards ({reservedRewards.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {catalog.filter((reward) => reservedRewards.includes(reward.id)).map((reward, index) => (
              <div key={reward.id} className="flex items-center gap-4 p-4 rounded-xl border-2 border-sky-200 bg-sky-50/50">
                <ImageWithFallback src={rewardImages[index]} alt={reward.name} className="w-20 h-20 rounded-lg object-cover" />
                <div className="flex-1 min-w-0"><p className="font-medium text-gray-900 truncate">{reward.name}</p><p className="text-sm text-gray-600">{reward.pointsCost} points</p><Badge className="mt-1 bg-sky-100 text-sky-700">Reserved</Badge></div>
                <Button size="sm" onClick={() => handleRedeem(reward)} className={`${brandNavySolidClass} ${brandNavySolidHoverClass}`}>Redeem</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className={cn(customerPanelSoftClass, "border-orange-200 bg-orange-50/50")}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h3 className="font-semibold text-gray-900">Redeemed History</h3>
          <Input value={redeemSearch} onChange={(e) => setRedeemSearch(e.target.value)} placeholder="Search redeemed item..." className="sm:w-72 bg-white" />
        </div>
        {redeemedHistory.length === 0 ? (
          <p className="text-sm text-gray-600">No redeemed items found.</p>
        ) : (
          <div className="space-y-3">
            {redeemedHistory.slice(0, 20).map((tx) => (
              <div key={tx.id} className="flex items-center justify-between gap-3 p-4 rounded-xl bg-white border border-gray-200">
                <div>
                  <p className="font-medium text-gray-900">{tx.description}</p>
                  <p className="text-sm text-gray-600">{new Date(tx.date).toLocaleDateString()} | Balance after redeem: {tx.balance.toLocaleString()} pts</p>
                </div>
                <Badge className="bg-orange-100 text-orange-700 border-orange-200" variant="outline">-{tx.points} pts</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as RewardCategoryTab)} className="space-y-6">
        <div className="overflow-x-auto pb-1">
        <TabsList className={`h-auto min-w-max flex-nowrap justify-start gap-1 shadow-sm ${customerTabRailClass}`}>
          <TabsTrigger value="all" className={cn(customerTabClass, "data-[state=active]:bg-white data-[state=active]:text-[#1A2B47] data-[state=active]:ring-2 data-[state=active]:ring-[#2b4468]/18 data-[state=active]:shadow-sm")}>All Rewards</TabsTrigger>
          <TabsTrigger value="flash" className={cn(customerTabClass, "data-[state=active]:bg-white data-[state=active]:text-[#1A2B47] data-[state=active]:ring-2 data-[state=active]:ring-[#2b4468]/18 data-[state=active]:shadow-sm")}>Flash Sale</TabsTrigger>
          <TabsTrigger value="partner" className={cn(customerTabClass, "data-[state=active]:bg-white data-[state=active]:text-[#1A2B47] data-[state=active]:ring-2 data-[state=active]:ring-[#2b4468]/18 data-[state=active]:shadow-sm")}>Partner</TabsTrigger>
          <TabsTrigger value="beverage" className={cn(customerTabClass, "data-[state=active]:bg-white data-[state=active]:text-[#1A2B47] data-[state=active]:ring-2 data-[state=active]:ring-[#2b4468]/18 data-[state=active]:shadow-sm")}>Beverages</TabsTrigger>
          <TabsTrigger value="food" className={cn(customerTabClass, "data-[state=active]:bg-white data-[state=active]:text-[#1A2B47] data-[state=active]:ring-2 data-[state=active]:ring-[#2b4468]/18 data-[state=active]:shadow-sm")}>Food</TabsTrigger>
          <TabsTrigger value="merchandise" className={cn(customerTabClass, "data-[state=active]:bg-white data-[state=active]:text-[#1A2B47] data-[state=active]:ring-2 data-[state=active]:ring-[#2b4468]/18 data-[state=active]:shadow-sm")}>Merchandise</TabsTrigger>
          <TabsTrigger value="voucher" className={cn(customerTabClass, "data-[state=active]:bg-white data-[state=active]:text-[#1A2B47] data-[state=active]:ring-2 data-[state=active]:ring-[#2b4468]/18 data-[state=active]:shadow-sm")}>Vouchers</TabsTrigger>
        </TabsList>
        </div>

        <TabsContent value="all" className="space-y-4"><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{filteredRewards.map((reward, index) => renderRewardCard(reward, index))}</div></TabsContent>
        <TabsContent value="flash" className="space-y-4">
          {flashSaleRewards.length === 0 ? (
            <Card className={`${customerPanelSoftClass} border-dashed border-gray-300`}>
              <p className="text-sm text-gray-600">No live flash sales right now.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {flashSaleRewards.map((reward) => {
                const imageIndex = catalog.findIndex((item) => item.id === reward.id);
                return renderRewardCard(reward, imageIndex);
              })}
            </div>
          )}
        </TabsContent>
        <TabsContent value="partner" className="space-y-4">
          {partnerRewards.length === 0 ? (
            <Card className={`${customerPanelSoftClass} border-dashed border-gray-300`}>
              <p className="text-sm text-gray-600">No partner rewards are available yet.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {partnerRewards.map((reward) => {
                const imageIndex = catalog.findIndex((item) => item.id === reward.id);
                return renderRewardCard(reward, imageIndex);
              })}
            </div>
          )}
        </TabsContent>
        {["beverage", "food", "merchandise", "voucher"].map((category) => (
          <TabsContent key={category} value={category} className="space-y-4"><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{filteredRewards.filter((reward) => reward.category === category).map((reward) => { const imageIndex = catalog.findIndex((item) => item.id === reward.id); return renderRewardCard(reward, imageIndex); })}</div></TabsContent>
        ))}
      </Tabs>

      {filteredRewards.length === 0 && (
        <Card className={`${customerPanelSoftClass} border-dashed border-gray-300`}>
          <p className="text-sm text-gray-600">
            No rewards found in database. Add rows to <code>rewards_catalog</code> to show redeemable items.
          </p>
        </Card>
      )}

      <Dialog open={redeemDialogOpen} onOpenChange={setRedeemDialogOpen}>
        <DialogContent className="sm:max-w-lg !bg-white !text-gray-900 border border-gray-200 shadow-2xl"><DialogHeader><DialogTitle className="text-gray-900">Redeem Reward</DialogTitle><DialogDescription className="text-gray-500">Choose how you'd like to receive your reward</DialogDescription></DialogHeader>
          {selectedReward && (
            <div className="space-y-6 py-4">
              {isFlashSaleExpired(selectedReward) || isFlashSaleSoldOut(selectedReward) ? (
                <div className="rounded-2xl border border-[#f3c2c2] bg-[#fff5f5] px-4 py-3">
                  <p className="text-sm font-semibold text-[#991b1b]">
                    {isFlashSaleExpired(selectedReward) ? "This reward has expired." : "This reward is sold out."}
                  </p>
                  <p className="mt-1 text-xs text-[#7f1d1d]">
                    {isFlashSaleExpired(selectedReward)
                      ? "Flash sale redemption is closed for this item."
                      : "No more flash sale redemptions are available for this item."}
                  </p>
                </div>
              ) : null}
              <div className="flex items-center gap-4 p-4 rounded-xl bg-gray-50"><div className="flex-1"><p className="font-semibold text-gray-900">{selectedReward.name}</p><p className="text-sm text-gray-600">{selectedReward.description}</p></div><div className="text-right"><p className="text-4xl font-bold leading-none text-[#1A2B47]">{selectedReward.pointsCost}</p><p className="text-xs text-gray-500 mt-1">points</p></div></div>
              <div className="space-y-3"><Label className="text-gray-900">Redemption Method</Label><div className="grid grid-cols-2 gap-3"><button className={`p-4 rounded-2xl border transition-all ${redemptionMethod === "in-store" ? "border-[#1A2B47] bg-[#e9f2f8]" : "border-gray-200 bg-white hover:bg-gray-50"} ${(isFlashSaleExpired(selectedReward) || isFlashSaleSoldOut(selectedReward)) ? "cursor-not-allowed opacity-50" : ""}`} onClick={() => setRedemptionMethod("in-store")} disabled={isFlashSaleExpired(selectedReward) || isFlashSaleSoldOut(selectedReward)}><Store className={`w-6 h-6 mx-auto mb-2 ${redemptionMethod === "in-store" ? "text-[#1A2B47]" : "text-gray-400"}`} /><p className="font-medium text-sm text-gray-900">In-Store</p><p className="text-xs text-gray-500 mt-1">Pick up at counter</p></button><button className={`p-4 rounded-2xl border transition-all ${redemptionMethod === "online" ? "border-[#1A2B47] bg-[#e9f2f8]" : "border-gray-200 bg-white hover:bg-gray-50"} ${(isFlashSaleExpired(selectedReward) || isFlashSaleSoldOut(selectedReward)) ? "cursor-not-allowed opacity-50" : ""}`} onClick={() => setRedemptionMethod("online")} disabled={isFlashSaleExpired(selectedReward) || isFlashSaleSoldOut(selectedReward)}><Truck className={`w-6 h-6 mx-auto mb-2 ${redemptionMethod === "online" ? "text-[#1A2B47]" : "text-gray-400"}`} /><p className="font-medium text-sm text-gray-900">Delivery</p><p className="text-xs text-gray-500 mt-1">Redeem online for delivery</p></button></div></div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-3">
            <Button
              variant="outline"
              className="h-10 border-gray-300 bg-white text-gray-800 hover:bg-gray-50"
              onClick={() => setRedeemDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className={`h-10 ${brandNavySolidClass} ${brandNavySolidHoverClass}`}
              onClick={confirmRedeem}
              disabled={
                saving ||
                (selectedReward ? isFlashSaleExpired(selectedReward) || isFlashSaleSoldOut(selectedReward) : false)
              }
            >
              {selectedReward && isFlashSaleExpired(selectedReward)
                ? "Reward Expired"
                : selectedReward && isFlashSaleSoldOut(selectedReward)
                  ? "Sold Out"
                  : "Confirm Redemption"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={giftDialogOpen} onOpenChange={setGiftDialogOpen}>
        <DialogContent className="sm:max-w-md !bg-white !text-gray-900 border border-gray-200 shadow-2xl"><DialogHeader><DialogTitle className="text-gray-900">Gift Points to Friend</DialogTitle><DialogDescription className="text-gray-500">Share points with another member</DialogDescription></DialogHeader>
          {selectedReward && (
            <div className="space-y-4 py-4"><div className="p-4 rounded-lg bg-purple-50 border border-purple-200"><p className="text-sm text-gray-900 mb-1"><strong>Sending:</strong> {selectedReward.pointsCost} points</p><p className="text-sm text-gray-600">For: {selectedReward.name}</p></div><div><Label htmlFor="gift-email">Recipient Email</Label><Input id="gift-email" type="email" placeholder="friend@email.com" value={giftEmail} onChange={(e) => setGiftEmail(e.target.value)} className="mt-2" /></div><div><Label htmlFor="gift-message">Personal Message (Optional)</Label><Input id="gift-message" placeholder="Enjoy your reward" value={giftMessage} onChange={(e) => setGiftMessage(e.target.value)} className="mt-2" /></div></div>
          )}
          <DialogFooter className="gap-2 sm:gap-3">
            <Button
              variant="outline"
              className="h-10 border-gray-300 bg-white text-gray-800 hover:bg-gray-50"
              onClick={() => setGiftDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button className="h-10 bg-purple-600 hover:bg-purple-700 text-white" onClick={confirmGift} disabled={!giftEmail || saving}>Send Gift</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reserveDialogOpen} onOpenChange={setReserveDialogOpen}>
        <DialogContent className="sm:max-w-md !bg-white !text-gray-900 border border-gray-200 shadow-2xl"><DialogHeader><DialogTitle className="text-gray-900">Reserve Reward</DialogTitle><DialogDescription className="text-gray-500">Reserve this reward for 24 hours without using points yet</DialogDescription></DialogHeader>
          {selectedReward && (
            <div className="space-y-4 py-4"><div className="flex items-center gap-4 p-4 rounded-lg bg-gray-50"><div className="flex-1"><p className="font-semibold text-gray-900">{selectedReward.name}</p><p className="text-sm text-gray-600">{selectedReward.description}</p></div><div className="text-right"><p className="text-2xl font-bold text-[#1A2B47]">{selectedReward.pointsCost}</p><p className="text-xs text-gray-500">points</p></div></div></div>
          )}
          <DialogFooter className="gap-2 sm:gap-3">
            <Button
              variant="outline"
              className="h-10 border-gray-300 bg-white text-gray-800 hover:bg-gray-50"
              onClick={() => setReserveDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button className={`h-10 ${brandNavySolidClass} ${brandNavySolidHoverClass}`} onClick={confirmReserve}>Reserve Reward</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

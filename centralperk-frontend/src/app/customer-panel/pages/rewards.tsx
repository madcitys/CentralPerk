import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Grid3X3,
  Gift,
  List,
  MapPin,
  PackageCheck,
  Phone,
  QrCode,
  TicketPercent,
  ShoppingBag,
  Store,
  Truck,
  type LucideIcon,
} from "lucide-react";
import type { Reward, Transaction } from "../../types/loyalty";
import type { RedemptionVoucher } from "../../types/voucher";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import { ImageWithFallback } from "../../../components/figma/ImageWithFallback";
import { toast } from "sonner";
import { useNavigate, useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "../../types/app-context";
import { cn } from "../../../components/ui/utils";
import { ensureMemberNotification } from "../../lib/notifications";
import type { PromotionCampaign } from "../../lib/promotions";
import {
  createVoucherViaApi,
  loadActiveCampaignsViaApi,
  loadRewardsViaApi,
  loadVouchersViaApi,
  recordPartnerTransactionViaApi,
  redeemPointsViaApi,
  redeemRewardViaApi,
} from "../../lib/api";
import { PHARMACY_FALLBACK_IMAGE, normalizeRewardDisplayName, normalizeTransactionDescription } from "../../lib/reward-display";
import { generateVoucherQrDataUrl } from "../../lib/voucher-qr";
import {
  brandNavyBadgeClass,
  brandNavySolidClass,
  brandNavySolidHoverClass,
  brandTealSolidClass,
  brandTealSolidHoverClass,
} from "../../lib/ui-color-tokens";
import {
  customerPanelClass,
  customerPanelSoftClass,
} from "../lib/page-theme";

type RedemptionMethod = "in-store" | "online";
type RewardCategoryTab = "all" | "flash" | "partner" | "pharmacy" | "wellness" | "voucher";
type RewardsWorkspace = "catalog" | "flash" | "wallet" | "history";
type DeliveryPartner = "grab" | "foodpanda" | "lalamove" | "pickup";

const REWARDS_PAGE_SIZE = 8;
const HISTORY_PAGE_SIZE = 8;

const rewardCategoryTabs: { value: RewardCategoryTab; label: string; icon: LucideIcon }[] = [
  { value: "all", label: "All Rewards", icon: Grid3X3 },
  { value: "flash", label: "Flash Sale", icon: TicketPercent },
  { value: "partner", label: "Partner", icon: Store },
  { value: "pharmacy", label: "Pharmacy", icon: PackageCheck },
  { value: "wellness", label: "Wellness", icon: Gift },
  { value: "voucher", label: "Vouchers", icon: ShoppingBag },
];

const deliveryPartners: Array<{ value: DeliveryPartner; label: string; description: string }> = [
  { value: "grab", label: "Grab", description: "For same-day city delivery." },
  { value: "foodpanda", label: "Foodpanda", description: "For food and light item delivery." },
  { value: "lalamove", label: "Lalamove", description: "For flexible courier drop-off." },
  { value: "pickup", label: "Partner Pickup", description: "Store-managed pickup and dispatch." },
];

const partnerMarks: Record<DeliveryPartner, { label: string; className: string }> = {
  grab: { label: "Grab", className: "text-[#16a34a]" },
  foodpanda: { label: "fp", className: "rounded-lg bg-[#ff0068] text-white" },
  lalamove: { label: "L", className: "text-[#f97316]" },
  pickup: { label: "P", className: "text-[#061e3b]" },
};

function formatRewardCategory(value: string, name = "", description = "") {
  const normalized = `${value || "voucher"} ${name} ${description}`.toLowerCase();
  if (normalized.includes("wellness")) return "Wellness";
  if (normalized.includes("medicine") || normalized.includes("pharmacy")) return "Pharmacy";
  if (normalized.includes("food") || normalized.includes("beverage")) return "Voucher";
  if (normalized.includes("partner")) return "Partner";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function resolveRewardImageUrl(imageUrl?: string | null) {
  const rawImageUrl = String(imageUrl || "").trim();
  if (rawImageUrl && !rawImageUrl.includes("images.unsplash.com")) return rawImageUrl;
  return PHARMACY_FALLBACK_IMAGE;
}

function buildVoucherScanUrl(voucherId: string, voucherCode: string) {
  const suffix = `/voucher/${voucherId}?code=${encodeURIComponent(voucherCode)}`;
  if (typeof window === "undefined") return suffix;
  return `${window.location.origin}${suffix}`;
}

async function withVoucherQr(voucher: RedemptionVoucher) {
  const qrValue = voucher.qrValue || voucher.qrTargetUrl || buildVoucherScanUrl(voucher.id, voucher.voucherCode);
  if (voucher.qrImageUrl && voucher.qrValue) return voucher;
  try {
    const qrImageUrl = await generateVoucherQrDataUrl(qrValue);
    return { ...voucher, qrValue, qrTargetUrl: voucher.qrTargetUrl || qrValue, qrImageUrl };
  } catch {
    return { ...voucher, qrValue, qrTargetUrl: voucher.qrTargetUrl || qrValue };
  }
}

async function withVoucherQrs(vouchers: RedemptionVoucher[]) {
  return Promise.all(vouchers.map((voucher) => withVoucherQr(voucher)));
}

function formatCountdown(targetDate?: string | null, nowTs = Date.now()) {
  if (!targetDate) return null;
  const diff = new Date(targetDate).getTime() - nowTs;
  if (diff <= 0) return "Ended";

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function mergeRewardsWithCampaigns(rewards: Reward[], campaigns: PromotionCampaign[]) {
  const flashSaleByRewardId = new Map<string, PromotionCampaign>();
  const now = Date.now();

  for (const campaign of campaigns) {
    if (campaign.campaignType !== "flash_sale" || !campaign.rewardId) continue;

    const rewardId = String(campaign.rewardId);
    const startsAt = new Date(campaign.startsAt).getTime();
    const endsAt = new Date(campaign.endsAt).getTime();
    const nextPriority = startsAt <= now && endsAt >= now ? 2 : startsAt > now ? 1 : 0;
    const existing = flashSaleByRewardId.get(rewardId);

    if (!existing) {
      flashSaleByRewardId.set(rewardId, campaign);
      continue;
    }

    const existingStartsAt = new Date(existing.startsAt).getTime();
    const existingEndsAt = new Date(existing.endsAt).getTime();
    const existingPriority = existingStartsAt <= now && existingEndsAt >= now ? 2 : existingStartsAt > now ? 1 : 0;

    if (nextPriority > existingPriority || (nextPriority === existingPriority && endsAt > existingEndsAt)) {
      flashSaleByRewardId.set(rewardId, campaign);
    }
  }

  return rewards.map((reward) => {
    const rewardCatalogId = reward.rewardCatalogId ? String(reward.rewardCatalogId) : "";
    const flashSale = rewardCatalogId ? flashSaleByRewardId.get(rewardCatalogId) : undefined;

    if (!flashSale) return reward;

    return {
      ...reward,
      activeFlashSaleId: flashSale.id,
      flashSaleStartsAt: flashSale.startsAt,
      flashSaleEndsAt: flashSale.endsAt,
      flashSaleQuantityLimit: flashSale.flashSaleQuantityLimit,
      flashSaleClaimedCount: flashSale.flashSaleClaimedCount,
      flashSaleBanner: flashSale.bannerTitle || flashSale.bannerMessage || null,
      flashSaleCountdownLabel: flashSale.countdownLabel || null,
    };
  });
}

function normalizeTierLabel(value: string, fallback: "Bronze" | "Silver" | "Gold") {
  const normalized = value.trim().toLowerCase();
  if (normalized === "gold") return "Gold";
  if (normalized === "silver") return "Silver";
  if (normalized === "bronze") return "Bronze";
  return fallback;
}

function buildOptimisticTransaction(input: {
  description: string;
  points: number;
  newBalance: number;
  type: Transaction["type"];
}): Transaction {
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    date: new Date().toISOString(),
    description: input.description,
    type: input.type,
    points: Math.abs(input.points),
    balance: input.newBalance,
    category: "Reward",
  };
}

function renderPaginationControls(input: {
  currentPage: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
  label: string;
}) {
  if (input.totalPages <= 1) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dce7f2] bg-[#fbfdff] px-4 py-3">
      <p className="text-sm text-[#5a6f8d]">
        {input.label}: page {input.currentPage} of {input.totalPages}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={input.onPrevious}
          disabled={input.currentPage <= 1}
          className="inline-flex items-center gap-2 rounded-full border border-[#d7e4ef] bg-white px-3 py-2 text-sm font-medium text-[#173555] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ArrowLeft className="h-4 w-4" />
          Previous
        </button>
        <button
          type="button"
          onClick={input.onNext}
          disabled={input.currentPage >= input.totalPages}
          className="inline-flex items-center gap-2 rounded-full border border-[#d7e4ef] bg-white px-3 py-2 text-sm font-medium text-[#173555] disabled:cursor-not-allowed disabled:opacity-45"
        >
          Next
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function Rewards() {
  const { user, setUser, refreshUser } = useOutletContext<AppOutletContext>();
  const navigate = useNavigate();
  const [workspace, setWorkspace] = useState<RewardsWorkspace>("catalog");
  const [activeTab, setActiveTab] = useState<RewardCategoryTab>("all");
  const [catalog, setCatalog] = useState<Reward[]>([]);
  const [activeCampaigns, setActiveCampaigns] = useState<PromotionCampaign[]>([]);
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
  const [redeemDialogOpen, setRedeemDialogOpen] = useState(false);
  const [voucherDialogOpen, setVoucherDialogOpen] = useState(false);
  const [giftDialogOpen, setGiftDialogOpen] = useState(false);
  const [reserveDialogOpen, setReserveDialogOpen] = useState(false);
  const [redemptionMethod, setRedemptionMethod] = useState<RedemptionMethod>("in-store");
  const [deliveryPartner, setDeliveryPartner] = useState<DeliveryPartner>("grab");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [deliveryPartnerInstructions, setDeliveryPartnerInstructions] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [giftEmail, setGiftEmail] = useState("");
  const [giftMessage, setGiftMessage] = useState("");
  const [redeemSearch, setRedeemSearch] = useState("");
  const [reservedRewards, setReservedRewards] = useState<string[]>([]);
  const [voucherWallet, setVoucherWallet] = useState<RedemptionVoucher[]>([]);
  const [selectedVoucherId, setSelectedVoucherId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const [catalogPage, setCatalogPage] = useState(1);
  const [flashPage, setFlashPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);

  useEffect(() => {
    setDeliveryAddress(user.address || "");
    setContactNumber(user.phone || "");
  }, [user.address, user.phone]);

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      const [rewardsResponse, campaignsResponse] = await Promise.all([
        loadRewardsViaApi().catch(() => ({ ok: true as const, rewards: [] as Reward[] })),
        loadActiveCampaignsViaApi(user.tier).catch(() => ({ ok: true as const, campaigns: [] as PromotionCampaign[] })),
      ]);

      if (!active) return;
      setCatalog(mergeRewardsWithCampaigns(rewardsResponse.rewards, campaignsResponse.campaigns));
      setActiveCampaigns(campaignsResponse.campaigns);
    };

    void loadData();
    const interval = window.setInterval(() => {
      void loadActiveCampaignsViaApi(user.tier)
        .then((response) => {
          setActiveCampaigns(response.campaigns);
          setCatalog((current) => mergeRewardsWithCampaigns(current, response.campaigns));
        })
        .catch(() => undefined);
    }, 30_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [user.tier]);

  useEffect(() => {
    let active = true;

    const loadWallet = async () => {
      try {
        const response = await loadVouchersViaApi({
          memberId: user.memberId || undefined,
          email: user.email || undefined,
        });
        const hydrated = await withVoucherQrs(response.vouchers);
        if (!active) return;
        setVoucherWallet(hydrated);
        setSelectedVoucherId((current) => current && hydrated.some((voucher) => voucher.id === current) ? current : hydrated[0]?.id ?? null);
      } catch (error) {
        if (!active) return;
        setVoucherWallet([]);
        setSelectedVoucherId(null);
        const message = error instanceof Error ? error.message : "Unable to load vouchers.";
        toast.error(message);
      }
    };

    if (user.memberId || user.email) {
      void loadWallet();
    }

    return () => {
      active = false;
    };
  }, [user.email, user.memberId]);

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
      if (typeof window !== "undefined" && window.sessionStorage.getItem(notificationKey)) return;

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

  useEffect(() => {
    setCatalogPage(1);
  }, [activeTab]);

  useEffect(() => {
    setFlashPage(1);
  }, [workspace, activeCampaigns.length]);

  useEffect(() => {
    setHistoryPage(1);
  }, [redeemSearch]);

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

  const partnerRewards = useMemo(() => filteredRewards.filter((reward) => Boolean(reward.partnerId)), [filteredRewards]);

  const redeemedHistory = useMemo(() => {
    const keyword = redeemSearch.trim().toLowerCase();
    return user.transactions
      .filter((tx) => tx.type === "redeemed")
      .filter((tx) => (keyword ? normalizeTransactionDescription(tx.description).toLowerCase().includes(keyword) : true))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [user.transactions, redeemSearch]);

  const readyVoucherWallet = useMemo(
    () => voucherWallet.filter((voucher) => voucher.status !== "validated"),
    [voucherWallet]
  );

  const walletSelection = useMemo(
    () => readyVoucherWallet.find((voucher) => voucher.id === selectedVoucherId) ?? readyVoucherWallet[0] ?? null,
    [selectedVoucherId, readyVoucherWallet]
  );

  const visibleRewards = useMemo(() => {
    switch (activeTab) {
      case "flash":
        return flashSaleRewards;
      case "partner":
        return partnerRewards;
      case "pharmacy":
        return filteredRewards.filter((reward) => {
          const text = `${reward.category} ${reward.name} ${reward.description}`.toLowerCase();
          return text.includes("pharmacy") || text.includes("medicine") || text.includes("medic") || text.includes("health");
        });
      case "wellness":
        return filteredRewards.filter((reward) => {
          const text = `${reward.category} ${reward.name} ${reward.description}`.toLowerCase();
          return text.includes("wellness") || text.includes("vitamin") || text.includes("fitness") || text.includes("spa");
        });
      case "voucher":
        return filteredRewards.filter((reward) => {
          const text = `${reward.category} ${reward.name} ${reward.description}`.toLowerCase();
          return text.includes("voucher");
        });
      case "all":
      default:
        return filteredRewards;
    }
  }, [activeTab, filteredRewards, flashSaleRewards, partnerRewards]);

  const pagedVisibleRewards = useMemo(() => {
    const start = (catalogPage - 1) * REWARDS_PAGE_SIZE;
    return visibleRewards.slice(start, start + REWARDS_PAGE_SIZE);
  }, [catalogPage, visibleRewards]);

  const pagedFlashRewards = useMemo(() => {
    const start = (flashPage - 1) * REWARDS_PAGE_SIZE;
    return flashSaleRewards.slice(start, start + REWARDS_PAGE_SIZE);
  }, [flashPage, flashSaleRewards]);

  const pagedHistory = useMemo(() => {
    const start = (historyPage - 1) * HISTORY_PAGE_SIZE;
    return redeemedHistory.slice(start, start + HISTORY_PAGE_SIZE);
  }, [historyPage, redeemedHistory]);

  const catalogPageCount = Math.max(1, Math.ceil(visibleRewards.length / REWARDS_PAGE_SIZE));
  const flashPageCount = Math.max(1, Math.ceil(flashSaleRewards.length / REWARDS_PAGE_SIZE));
  const historyPageCount = Math.max(1, Math.ceil(redeemedHistory.length / HISTORY_PAGE_SIZE));

  useEffect(() => {
    setCatalogPage((current) => Math.min(current, catalogPageCount));
  }, [catalogPageCount]);

  useEffect(() => {
    setFlashPage((current) => Math.min(current, flashPageCount));
  }, [flashPageCount]);

  useEffect(() => {
    setHistoryPage((current) => Math.min(current, historyPageCount));
  }, [historyPageCount]);

  const featuredFlashRewards = flashSaleRewards.slice(0, 2);
  const redeemableRewardsCount = filteredRewards.filter((reward) => user.points >= reward.pointsCost).length;
  const nextReward = filteredRewards
    .filter((reward) => reward.pointsCost > user.points)
    .sort((left, right) => left.pointsCost - right.pointsCost)[0] ?? null;

  const isFlashSaleSoldOut = (reward: Reward) =>
    Boolean(
      reward.activeFlashSaleId &&
        reward.flashSaleQuantityLimit !== null &&
        reward.flashSaleQuantityLimit !== undefined &&
        (reward.flashSaleClaimedCount ?? 0) >= reward.flashSaleQuantityLimit
    );

  const isFlashSaleExpired = (reward: Reward) =>
    Boolean(reward.activeFlashSaleId && reward.flashSaleEndsAt && new Date(reward.flashSaleEndsAt).getTime() <= countdownNow);

  const resetRedeemForm = () => {
    setRedemptionMethod("online");
    setDeliveryPartner("grab");
    setDeliveryAddress(user.address || "");
    setDeliveryNotes("");
    setDeliveryPartnerInstructions("");
    setContactNumber(user.phone || "");
  };

  const updateUserAfterSpend = (input: {
    description: string;
    points: number;
    newBalance: number;
    newTier: string;
    type: Transaction["type"];
  }) => {
    setUser((previous) => {
      const optimisticTransaction = buildOptimisticTransaction({
        description: input.description,
        points: input.points,
        newBalance: input.newBalance,
        type: input.type,
      });
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const isCurrentMonth =
        new Date(optimisticTransaction.date).getMonth() === currentMonth &&
        new Date(optimisticTransaction.date).getFullYear() === currentYear;

      return {
        ...previous,
        points: input.newBalance,
        tier: normalizeTierLabel(input.newTier, previous.tier),
        redeemedThisMonth:
          input.type === "redeemed" && isCurrentMonth
            ? previous.redeemedThisMonth + Math.abs(input.points)
            : previous.redeemedThisMonth,
        transactions: [optimisticTransaction, ...previous.transactions].sort(
          (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()
        ),
      };
    });
  };

  const spendPoints = async (
    points: number,
    description: string,
    category = "Reward",
    type: "redeemed" | "gifted" = "redeemed",
    reward?: Reward | null
  ) => {
    const reason = `${description}${category ? ` [${category}]` : ""}${type === "gifted" ? " (gifted)" : ""}`;
    const response =
      type === "redeemed" && reward?.rewardCatalogId
        ? await redeemRewardViaApi({
            memberIdentifier: user.memberId,
            fallbackEmail: user.email,
            points,
            reason,
            rewardCatalogId: reward.rewardCatalogId,
            promotionCampaignId: reward.activeFlashSaleId || null,
          })
        : await redeemPointsViaApi({
            memberIdentifier: user.memberId,
            fallbackEmail: user.email,
            points,
            transactionType: type === "gifted" ? "GIFT" : "REDEEM",
            reason,
            rewardCatalogId: reward?.rewardCatalogId,
            promotionCampaignId: reward?.activeFlashSaleId || null,
          });

    updateUserAfterSpend({
      description,
      points,
      newBalance: response.result.newBalance,
      newTier: response.result.newTier,
      type: type === "gifted" ? "gifted" : "redeemed",
    });

    await refreshUser().catch(() => undefined);
    return response.result;
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
    toast.success("Reward reserved.", { description: `${selectedReward.name} is saved for quick redeem.` });
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
    resetRedeemForm();
    setRedeemDialogOpen(true);
  };

  const handleGift = (reward: Reward) => {
    setSelectedReward(reward);
    setGiftDialogOpen(true);
  };

  const confirmGift = async () => {
    if (!selectedReward || !giftEmail.trim()) return;
    try {
      setSaving(true);
      await spendPoints(selectedReward.pointsCost, `Gifted: ${selectedReward.name} to ${giftEmail.trim()}`, "Transfer", "gifted", selectedReward);
      toast.success("Points gifted.", { description: `${selectedReward.pointsCost} points sent to ${giftEmail.trim()}` });
      setGiftDialogOpen(false);
      setGiftEmail("");
      setGiftMessage("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gift failed");
    } finally {
      setSaving(false);
    }
  };

  const normalizedContact = contactNumber.replace(/\D/g, "");
  const deliveryValidationMessage = useMemo(() => {
    if (!selectedReward) return "";
    if (user.points < selectedReward.pointsCost) return `You need ${selectedReward.pointsCost - user.points} more points.`;
    if (redemptionMethod === "online") {
      if (normalizedContact.length < 10 || normalizedContact.length > 13) return "Enter a valid delivery contact number.";
      if (deliveryAddress.trim().length < 18) return "Enter a complete delivery address with street, barangay, and city.";
      if (!deliveryPartners.find((item) => item.value === deliveryPartner)) return "Select a delivery partner.";
    }
    return "";
  }, [deliveryAddress, deliveryPartner, normalizedContact.length, redemptionMethod, selectedReward, user.points]);

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
    if (deliveryValidationMessage) {
      toast.error(deliveryValidationMessage);
      return;
    }

    const deliveryPartnerOption = deliveryPartners.find((item) => item.value === deliveryPartner) ?? null;
    const combinedDeliveryNotes = [deliveryNotes.trim(), deliveryPartnerInstructions.trim()].filter(Boolean).join(" | ");
    const orderId = `CPK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const voucherId = crypto.randomUUID();
    const voucherCode = `RWD-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Date.now().toString().slice(-4)}`;
    const qrTargetUrl = buildVoucherScanUrl(voucherId, voucherCode);
    const description =
      redemptionMethod === "online"
        ? `${selectedReward.name} delivery via ${deliveryPartnerOption?.label ?? "Delivery Partner"}`
        : `${selectedReward.name} counter pickup`;

    try {
      setSaving(true);
      await spendPoints(selectedReward.pointsCost, description, "Reward", "redeemed", selectedReward);

      if (selectedReward.partnerId && selectedReward.partnerCode && selectedReward.partnerName) {
        await recordPartnerTransactionViaApi({
          partnerId: String(selectedReward.partnerId),
          partnerCode: selectedReward.partnerCode,
          partnerName: selectedReward.partnerName,
          memberId: user.memberId,
          memberEmail: user.email,
          orderId,
          points: selectedReward.pointsCost,
          grossAmount:
            Number(selectedReward.cashValue ?? 0) > 0
              ? Number(selectedReward.cashValue ?? 0)
              : Number(selectedReward.partnerConversionRate ?? 0) > 0
                ? Number((selectedReward.pointsCost / Number(selectedReward.partnerConversionRate)).toFixed(2))
                : 0,
          note: description,
          fulfillmentMethod: redemptionMethod,
          deliveryPartner: redemptionMethod === "online" ? deliveryPartnerOption?.label ?? null : null,
          deliveryAddress: redemptionMethod === "online" ? deliveryAddress.trim() : null,
          deliveryNotes: redemptionMethod === "online" ? combinedDeliveryNotes || null : null,
          contactNumber: redemptionMethod === "online" ? contactNumber.trim() : null,
        }).catch(() => undefined);
      }

      if (selectedReward.activeFlashSaleId) {
        setCatalog((prev) =>
          prev.map((reward) =>
            reward.id === selectedReward.id
              ? { ...reward, flashSaleClaimedCount: (reward.flashSaleClaimedCount ?? 0) + 1 }
              : reward
          )
        );
      }

      const voucherDraft: RedemptionVoucher = {
        id: voucherId,
        memberId: user.memberId,
        memberEmail: user.email || null,
        rewardId: selectedReward.id,
        rewardCatalogId: selectedReward.rewardCatalogId ? String(selectedReward.rewardCatalogId) : null,
        rewardName: selectedReward.name,
        pointsCost: selectedReward.pointsCost,
        method: redemptionMethod,
        voucherCode,
        orderId,
        qrValue: qrTargetUrl,
        qrTargetUrl,
        createdAt: new Date().toISOString(),
        partnerLabel: selectedReward.partnerName || null,
        deliveryPartner: redemptionMethod === "online" ? deliveryPartnerOption?.label ?? null : null,
        deliveryAddress: redemptionMethod === "online" ? deliveryAddress.trim() : null,
        deliveryNotes: redemptionMethod === "online" ? combinedDeliveryNotes || null : null,
        contactNumber: redemptionMethod === "online" ? contactNumber.trim() : null,
        status: redemptionMethod === "online" ? "processing" : "ready",
        validatedAt: null,
      };

      const createdVoucher = await createVoucherViaApi(voucherDraft)
        .then((response) => response.voucher)
        .catch(() => voucherDraft);
      const hydratedVoucher = await withVoucherQr(createdVoucher);

      setVoucherWallet((prev) => [hydratedVoucher, ...prev.filter((voucher) => voucher.id !== hydratedVoucher.id)].slice(0, 12));
      setSelectedVoucherId(hydratedVoucher.id);
      setReservedRewards((prev) => prev.filter((id) => id !== selectedReward.id));
      setRedeemDialogOpen(false);

      toast.success("Reward redeemed.", {
        description:
          redemptionMethod === "online"
            ? `${selectedReward.name} queued for ${deliveryPartnerOption?.label ?? "delivery"}. Open Activity to view the QR voucher.`
            : `${selectedReward.name} is ready. Open Activity to view the QR voucher.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Redeem failed.";
      toast.error("Redeem failed", { description: message });
    } finally {
      setSaving(false);
    }
  };

  const renderRewardCard = (reward: Reward) => {
    const isReserved = reservedRewards.includes(reward.id);
    const canAfford = user.points >= reward.pointsCost;
    const soldOut = isFlashSaleSoldOut(reward);
    const expired = isFlashSaleExpired(reward);
    const unavailable = soldOut || expired;
    const categoryLabel = formatRewardCategory(reward.category, reward.name, reward.description);

    return (
      <Card
        key={reward.id}
        className={cn(
          "group grid h-full min-h-[164px] overflow-hidden rounded-[14px] border border-[#dfe7f0] bg-white shadow-[0_10px_24px_rgba(8,26,53,0.05)] transition hover:-translate-y-0.5 hover:border-[#c6d5e5] hover:shadow-[0_18px_36px_rgba(8,26,53,0.09)] sm:grid-cols-[150px_minmax(0,1fr)]",
          unavailable && "border-[#f3c2c2] bg-[#fff8f8]"
        )}
      >
        <div className="relative min-h-[156px]">
          <ImageWithFallback
            src={resolveRewardImageUrl(reward.imageUrl)}
            alt={reward.name}
            className="h-full min-h-[156px] w-full object-cover transition duration-300 group-hover:scale-[1.02]"
          />
          <div className="absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-2">
            <Badge variant="outline" className="h-7 rounded-lg border-white/70 bg-white/95 px-3 text-[11px] font-black text-[#0b706d] shadow-sm">
              {categoryLabel}
            </Badge>
            {reward.activeFlashSaleId ? (
              <Badge className="h-7 rounded-lg bg-[#ffe8e8] px-3 text-[11px] font-black text-[#ef4444] shadow-sm">
                {soldOut ? "Sold Out" : expired ? "Ended" : `Flash ${formatCountdown(reward.flashSaleEndsAt, countdownNow)}`}
              </Badge>
            ) : null}
          </div>
          {isReserved ? <Badge className="absolute right-3 top-3 h-8 rounded-xl bg-sky-600 px-3 text-[11px] text-white shadow-sm">Reserved</Badge> : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col p-4">
          <div>
            <p className="line-clamp-2 text-[15px] font-black leading-5 text-[#10213a]">{reward.name}</p>
            <p className="mt-2 line-clamp-2 text-[13px] leading-5 text-[#657286]">{reward.description}</p>
          </div>

          {reward.activeFlashSaleId ? (
            <div className="mt-3 rounded-xl border border-[#ffd2d2] bg-[#fff8f8] px-3 py-2">
              <p className="text-xs font-black text-[#991b1b]">{reward.flashSaleBanner || "Limited-time offer"}</p>
              <p className="mt-1 text-xs font-semibold text-[#b45309]">
                {(reward.flashSaleClaimedCount ?? 0).toLocaleString()}
                {reward.flashSaleQuantityLimit ? ` / ${reward.flashSaleQuantityLimit}` : ""} claimed
              </p>
            </div>
          ) : null}

          <div className="mt-auto border-t border-[#edf1f5] pt-4">
            <div className="grid items-center gap-3 sm:grid-cols-[auto_minmax(112px,1fr)]">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#0b706d]">Point Cost</p>
                <p className="mt-1 text-[20px] font-black leading-none text-[#0b8a80]">
                  {reward.pointsCost.toLocaleString()}
                  <span className="ml-1 text-sm font-bold text-[#10213a]">pts</span>
                </p>
              </div>
              <Button
                className="h-10 rounded-lg bg-[#008c80] px-5 text-sm font-black text-white hover:bg-[#00736f]"
                disabled={saving || unavailable || !canAfford}
                onClick={() => handleRedeem(reward)}
              >
                {expired ? "Reward Expired" : soldOut ? "Sold Out" : "Redeem"}
              </Button>
            </div>
          </div>

          {!canAfford ? <p className="mt-2 text-xs font-medium text-orange-600">Need {(reward.pointsCost - user.points).toLocaleString()} more points.</p> : null}
          {expired ? <p className="mt-2 text-xs font-medium text-[#991b1b]">This reward is no longer available.</p> : null}
          {soldOut ? <p className="mt-2 text-xs font-medium text-[#991b1b]">This flash reward is sold out.</p> : null}
        </div>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f2fbf8_0%,#f7fafc_48%,#edf8f4_100%)] text-[#10213a]" style={{ fontFamily: "'Poppins', sans-serif" }}>
      <header>
        <div className="mx-auto max-w-[1180px] px-5 pb-2 pt-5 lg:px-6">
          <div className="mb-5 rounded-[16px] border border-[#bfe9e4] bg-[linear-gradient(135deg,#ffffff_0%,#f4fffb_100%)] px-5 py-5 shadow-[0_12px_28px_rgba(0,96,86,0.07)]">
            <div>
              <div className="inline-flex items-center rounded-full border border-[#bfe5e8] bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#0f766e]">
                Rewards Center
              </div>
              <h1 className="mt-3 text-[30px] font-extrabold leading-tight tracking-normal text-[#071a35]">Rewards</h1>
              <p className="mt-1 text-[13px] font-medium text-[#64748b]">Redeem pharmacy vouchers, wellness perks, and partner rewards.</p>
            </div>
          </div>

          <section className="grid gap-4 lg:grid-cols-[0.95fr_1.35fr]">
            <Card className="relative min-h-[230px] overflow-hidden rounded-[14px] border border-[#d7e2ef] bg-[radial-gradient(circle_at_88%_88%,rgba(8,105,134,0.34),transparent_35%),linear-gradient(135deg,#061d3a_0%,#062c55_100%)] p-6 text-white shadow-[0_18px_34px_rgba(8,26,53,0.16)]">
              <div className="pointer-events-none absolute -bottom-24 -right-20 h-72 w-72 rounded-full border border-white/6" />
              <div className="pointer-events-none absolute -bottom-14 -right-12 h-52 w-52 rounded-full border border-white/6" />
              <div className="relative flex items-start justify-between gap-4">
                <p className="text-[12px] font-extrabold uppercase tracking-[0.18em] text-[#bfe7f2]">Member Balance</p>
                <span className="inline-flex min-w-[140px] justify-center rounded-full bg-[#d8fff7] px-5 py-2 text-[12px] font-extrabold text-[#005f5a]">{user.tier} Tier</span>
              </div>
              <div className="relative mt-8 flex flex-wrap items-end justify-center gap-3 text-center">
                <p className="text-[46px] font-extrabold leading-none tracking-normal sm:text-[52px]">{user.points.toLocaleString()}</p>
                <p className="pb-2 text-[14px] font-extrabold uppercase tracking-[0.08em] text-white/88">points</p>
              </div>
              <p className="relative mx-auto mt-5 max-w-[380px] text-center text-[13px] font-semibold leading-6 text-white/90">
                You are currently in {user.tier}. Use your balance for available rewards and active campaigns.
              </p>
            </Card>

            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="min-h-[122px] rounded-[12px] border border-[#e2e8f0] bg-white p-4 shadow-[0_12px_24px_rgba(8,26,53,0.06)]">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#64748b]">Redeemable</p>
                <p className="mt-4 text-[32px] font-extrabold leading-none text-[#071a35]">{redeemableRewardsCount.toLocaleString()}</p>
                <p className="mt-2 text-[12px] font-semibold text-[#0b8a80]">Available with your balance</p>
              </Card>
              <Card className="min-h-[122px] rounded-[12px] border border-[#e2e8f0] bg-white p-4 shadow-[0_12px_24px_rgba(8,26,53,0.06)]">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#64748b]">Campaigns</p>
                <p className="mt-4 text-[32px] font-extrabold leading-none text-[#071a35]">{activeCampaigns.length.toLocaleString()}</p>
                <p className="mt-2 text-[12px] font-semibold text-[#0b8a80]">Live promotions</p>
              </Card>
              <Card className="min-h-[122px] rounded-[12px] border border-[#e2e8f0] bg-white p-4 shadow-[0_12px_24px_rgba(8,26,53,0.06)]">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#64748b]">Next Unlock</p>
                <p className="mt-4 text-[32px] font-extrabold leading-none text-[#071a35]">
                  {nextReward ? Math.max(0, nextReward.pointsCost - user.points).toLocaleString() : "0"}
                </p>
                <p className="mt-2 truncate text-[12px] font-semibold text-[#0b8a80]">{nextReward ? "points away" : "All affordable"}</p>
              </Card>
            </div>
          </section>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-5 pb-10 lg:px-6">
        <nav className="mt-4 grid gap-1 overflow-x-auto rounded-[14px] border border-[#dfe7f0] bg-white p-1 shadow-[0_10px_24px_rgba(8,26,53,0.04)] md:grid-cols-3 xl:grid-cols-6">
          {rewardCategoryTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => {
                  setWorkspace("catalog");
                  setActiveTab(tab.value);
                }}
                className={cn(
                  "inline-flex h-11 min-w-[132px] shrink-0 items-center justify-center gap-2 rounded-[10px] border px-5 text-sm font-black transition",
                  activeTab === tab.value
                    ? "border-[#008c80] bg-[#eefbf8] text-[#00736f] shadow-[inset_0_0_0_1px_rgba(0,140,128,0.12)]"
                    : "border-[#dde6ef] bg-white text-[#4a5a73] hover:border-[#cbd8e6] hover:bg-[#f8fafc]"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => setWorkspace("wallet")}
            className={cn(
              "inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border px-4 text-[13px] font-extrabold transition",
              workspace === "wallet"
                ? "border-[#008c80] bg-[#e7fbf7] text-[#006f69]"
                : "border-[#d6e3ee] bg-white text-[#344563] hover:border-[#a8deda] hover:text-[#00736f]"
            )}
          >
            <QrCode className="h-4 w-4" />
            Saved Vouchers
          </button>
          <button
            type="button"
            onClick={() => setWorkspace("history")}
            className={cn(
              "inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border px-4 text-[13px] font-extrabold transition",
              workspace === "history"
                ? "border-[#008c80] bg-[#e7fbf7] text-[#006f69]"
                : "border-[#d6e3ee] bg-white text-[#344563] hover:border-[#a8deda] hover:text-[#00736f]"
            )}
          >
            <List className="h-4 w-4" />
            Redemption History
          </button>
        </div>

        {workspace === "catalog" || workspace === "flash" ? (
        <section className="pt-7">
          <div className="flex items-center justify-between gap-4">
            <h2 className="flex items-center gap-3 text-[22px] font-black">
              <TicketPercent className="h-6 w-6 text-[#ef4444]" />
              Flash Sales Live Now
            </h2>
            <button
              type="button"
              onClick={() => {
                setWorkspace("catalog");
                setActiveTab("flash");
              }}
              className="inline-flex items-center gap-2 text-sm font-black text-[#007f78] hover:text-[#005f5a]"
            >
              View All Flash Sales
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            {featuredFlashRewards.length === 0 ? (
              <Card className="col-span-full rounded-[20px] border border-dashed border-[#d8e5f0] bg-white p-8 text-center shadow-[0_12px_26px_rgba(8,26,53,0.04)]">
                <TicketPercent className="mx-auto h-10 w-10 text-[#ef4444]" />
                <h3 className="mt-3 text-base font-black text-[#10213a]">No Flash Sales Live Right Now</h3>
                <p className="mt-1 text-sm font-medium text-[#64748b]">Check back later for limited-time pharmacy rewards.</p>
              </Card>
            ) : featuredFlashRewards.map((reward, index) => {
              const soldOut = isFlashSaleSoldOut(reward);
              const expired = isFlashSaleExpired(reward);
              const claimed = reward.flashSaleClaimedCount ?? 0;
              const limit = reward.flashSaleQuantityLimit;
              const progress = limit ? Math.min(100, (claimed / Math.max(limit, 1)) * 100) : 0;
              return (
                <button
                  key={`flash-strip-${reward.id}`}
                  type="button"
                  onClick={() => handleRedeem(reward)}
                  disabled={saving || soldOut || expired || user.points < reward.pointsCost}
                  className="grid min-h-[128px] gap-4 rounded-[20px] border border-[#dfe7f0] bg-white px-5 py-4 text-left shadow-[0_14px_32px_rgba(8,26,53,0.06)] transition hover:-translate-y-0.5 hover:border-[#c9d6e5] hover:shadow-[0_18px_40px_rgba(8,26,53,0.10)] disabled:cursor-not-allowed disabled:opacity-70 md:grid-cols-[72px_1fr_auto] md:items-center"
                >
                  <span className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-[#fff0f0] text-[#ef777d]">
                    <TicketPercent className="h-8 w-8" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-lg font-black text-[#10213a]">{reward.name}</span>
                    <span className="mt-1 block line-clamp-1 text-sm font-medium text-[#657286]">{reward.description}</span>
                    <span className="mt-3 block text-xs font-black text-[#dc2626]">
                      {limit ? `${claimed.toLocaleString()} / ${limit.toLocaleString()} claimed` : `${claimed.toLocaleString()} claimed`}
                    </span>
                    {limit ? (
                      <span className="mt-2 block h-1.5 max-w-[360px] overflow-hidden rounded-full bg-[#e8edf3]">
                        <span className="block h-full rounded-full bg-[#dc2626]" style={{ width: `${progress}%` }} />
                      </span>
                    ) : null}
                  </span>
                  <span className="flex min-w-[116px] flex-col items-end gap-4">
                    <span className="rounded-full bg-[#ffecec] px-4 py-2 text-xs font-black text-[#ef4444]">
                      {formatCountdown(reward.flashSaleEndsAt, countdownNow) || "Live"}
                    </span>
                    <span className="rounded-xl bg-[linear-gradient(135deg,#008c80,#006f69)] px-5 py-3 text-sm font-black text-white shadow-[0_10px_24px_rgba(0,140,128,0.18)]">
                      {reward.pointsCost.toLocaleString()} pts
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
        ) : null}

      {workspace === "catalog" ? (
        <section className="space-y-5 pt-9">
          <Card className="border-0 bg-transparent p-0 shadow-none">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-[22px] font-black text-[#10213a]">All Available Rewards</h2>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-[#e1e8f0] bg-white p-1 shadow-[0_10px_24px_rgba(8,26,53,0.05)]">
                <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#008c80] text-white" aria-label="Grid view">
                  <Grid3X3 className="h-4 w-4" />
                </button>
                <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#64748b] transition hover:bg-[#f3f7fb]" aria-label="List view">
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {pagedVisibleRewards.map((reward) => renderRewardCard(reward))}
            </div>

            {renderPaginationControls({
              currentPage: catalogPage,
              totalPages: catalogPageCount,
              label: "Catalog",
              onPrevious: () => setCatalogPage((page) => Math.max(1, page - 1)),
              onNext: () => setCatalogPage((page) => Math.min(catalogPageCount, page + 1)),
            })}
          </Card>
        </section>
      ) : null}

      {workspace === "flash" ? (
        <section className="space-y-4">
          <Card className="border-[#fecaca] bg-[linear-gradient(135deg,#fff7f7_0%,#ffffff_100%)] p-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Flash Deals</h2>
                <p className="mt-1 text-sm text-gray-600">Everything time-sensitive is grouped here with paging controls and immediate redeem access.</p>
              </div>
              <Badge className="bg-[#ef4444] text-white">{flashSaleRewards.length} live</Badge>
            </div>
            {flashSaleRewards.length === 0 ? (
              <p className="mt-5 text-sm text-gray-600">No Live Flash Rewards Right Now.</p>
            ) : (
              <>
                <div className="mt-5 grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
                  {pagedFlashRewards.map((reward) => renderRewardCard(reward))}
                </div>
                {renderPaginationControls({
                  currentPage: flashPage,
                  totalPages: flashPageCount,
                  label: "Flash deals",
                  onPrevious: () => setFlashPage((page) => Math.max(1, page - 1)),
                  onNext: () => setFlashPage((page) => Math.min(flashPageCount, page + 1)),
                })}
              </>
            )}
          </Card>
        </section>
      ) : null}

      {workspace === "wallet" ? (
        <section className="grid gap-4 2xl:grid-cols-[0.7fr_1.3fr]">
          <Card className={customerPanelClass}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Voucher Wallet</h3>
                <p className="mt-1 text-sm text-gray-600">Ready-to-scan reward passes live here after redemption.</p>
              </div>
              <Badge className={brandNavyBadgeClass}>{readyVoucherWallet.length} ready</Badge>
            </div>
            {readyVoucherWallet.length === 0 ? (
              <div className="mt-5 rounded-3xl border border-dashed border-[#d8e4f0] bg-[#fbfdff] p-5 text-sm text-gray-600">
                Redeem a reward first to generate a server-backed QR voucher.
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {readyVoucherWallet.map((voucher) => (
                  <button
                    key={voucher.id}
                    type="button"
                    onClick={() => setSelectedVoucherId(voucher.id)}
                    className={cn(
                      "w-full rounded-2xl border p-4 text-left transition",
                      walletSelection?.id === voucher.id ? "border-[#10213a] bg-[#10213a] text-white" : "border-[#dce7f2] bg-white text-[#173555]"
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">{normalizeRewardDisplayName(voucher.rewardName)}</p>
                        <p className={cn("mt-1 text-xs", walletSelection?.id === voucher.id ? "text-white/72" : "text-[#6d829e]")}>
                          {voucher.voucherCode}
                        </p>
                      </div>
                      <Badge className={voucher.status === "validated" ? "bg-[#dff4e8] text-[#166534]" : voucher.status === "ready" ? "bg-[#ecfdf3] text-[#166534]" : "bg-[#eff6ff] text-[#1d4ed8]"}>
                        {voucher.status === "validated" ? "Validated" : voucher.status === "ready" ? "Ready" : "Processing"}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card className={customerPanelClass}>
            {walletSelection ? (
              <div className="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
                <div className="rounded-3xl border border-[#dce7f2] bg-[#fbfdff] p-5 text-center">
                  {walletSelection.qrImageUrl ? (
                    <img src={walletSelection.qrImageUrl} alt={`QR for ${normalizeRewardDisplayName(walletSelection.rewardName)}`} className="mx-auto h-56 w-56 rounded-2xl border border-[#dce7f2] bg-white p-3" />
                  ) : (
                    <div className="mx-auto flex h-56 w-56 items-center justify-center rounded-2xl border border-[#dce7f2] bg-white text-[#10213a]">
                      <QrCode className="h-10 w-10" />
                    </div>
                  )}
                  <p className="mt-4 text-sm font-semibold text-[#10213a]">{walletSelection.voucherCode}</p>
                  <p className="mt-1 text-xs text-gray-500">Scan at partner counter or open on another device.</p>
                  <a
                    href={walletSelection.qrTargetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex rounded-full border border-[#d7e4ef] bg-white px-4 py-2 text-sm font-semibold text-[#173555]"
                  >
                    Open validation page
                  </a>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={brandNavyBadgeClass}>Voucher details</Badge>
                    <Badge className={walletSelection.status === "validated" ? "bg-[#dff4e8] text-[#166534]" : walletSelection.status === "ready" ? "bg-[#ecfdf3] text-[#166534]" : "bg-[#eff6ff] text-[#1d4ed8]"}>
                      {walletSelection.status === "validated" ? "Validated" : walletSelection.status === "ready" ? "Ready to scan" : "Delivery processing"}
                    </Badge>
                  </div>
                  <h3 className="text-2xl font-semibold text-gray-900">{normalizeRewardDisplayName(walletSelection.rewardName)}</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-[#f7fafc] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-[#6d829e]">Order ID</p>
                      <p className="mt-2 text-sm font-semibold text-[#10213a]">{walletSelection.orderId}</p>
                    </div>
                    <div className="rounded-2xl bg-[#f7fafc] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-[#6d829e]">Method</p>
                      <p className="mt-2 text-sm font-semibold capitalize text-[#10213a]">
                        {walletSelection.method === "in-store" ? "In-store pickup" : "Delivery"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-[#f7fafc] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-[#6d829e]">Points used</p>
                      <p className="mt-2 text-sm font-semibold text-[#10213a]">{walletSelection.pointsCost}</p>
                    </div>
                    <div className="rounded-2xl bg-[#f7fafc] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-[#6d829e]">Partner</p>
                      <p className="mt-2 text-sm font-semibold text-[#10213a]">
                        {walletSelection.deliveryPartner || walletSelection.partnerLabel || "Counter pickup"}
                      </p>
                    </div>
                  </div>

                  {walletSelection.deliveryAddress ? (
                    <div className="rounded-2xl border border-[#dce7f2] bg-white p-4">
                      <div className="flex items-start gap-3">
                        <MapPin className="mt-0.5 h-4 w-4 text-[#10213a]" />
                        <div>
                          <p className="text-sm font-semibold text-gray-900">Delivery Address</p>
                          <p className="mt-1 text-sm text-gray-600">{walletSelection.deliveryAddress}</p>
                          {walletSelection.contactNumber ? (
                            <p className="mt-1 text-xs text-gray-500">Contact: {walletSelection.contactNumber}</p>
                          ) : null}
                          {walletSelection.deliveryNotes ? (
                            <p className="mt-2 text-xs text-gray-500">Notes: {walletSelection.deliveryNotes}</p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-2xl border border-[#dce7f2] bg-white p-4">
                    <p className="text-sm font-semibold text-gray-900">Scan target</p>
                    <p className="mt-2 break-all text-xs leading-6 text-gray-600">{walletSelection.qrTargetUrl}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-[#d8e4f0] bg-[#fbfdff] p-6 text-sm text-gray-600">
                No voucher selected yet.
              </div>
            )}
          </Card>
        </section>
      ) : null}

      {workspace === "history" ? (
        <section className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-3">
            <Card className={customerPanelClass}>
              <p className="text-xs uppercase tracking-[0.18em] text-[#6d829e]">Redeemed actions</p>
              <p className="mt-4 text-5xl font-black tracking-tight text-[#10213a]">{redeemedHistory.length}</p>
            </Card>
            <Card className={customerPanelClass}>
              <p className="text-xs uppercase tracking-[0.18em] text-[#6d829e]">Saved vouchers</p>
              <p className="mt-4 text-5xl font-black tracking-tight text-[#10213a]">{voucherWallet.length}</p>
            </Card>
            <Card className={customerPanelClass}>
              <p className="text-xs uppercase tracking-[0.18em] text-[#6d829e]">Reserved rewards</p>
              <p className="mt-4 text-5xl font-black tracking-tight text-[#10213a]">{reservedRewards.length}</p>
            </Card>
          </div>

          <Card className={cn(customerPanelSoftClass, "border-orange-200 bg-orange-50/40")}>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Redeemed History</h3>
                <p className="mt-1 text-sm text-gray-600">Search past reward redemptions and balance snapshots without scrolling endlessly.</p>
              </div>
              <Input value={redeemSearch} onChange={(e) => setRedeemSearch(e.target.value)} placeholder="Search redeemed item..." className="xl:w-80 bg-white" />
            </div>
            {redeemedHistory.length === 0 ? (
              <p className="mt-5 text-sm text-gray-600">No redeemed items found.</p>
            ) : (
              <>
                <div className="mt-5 space-y-3">
                  {pagedHistory.map((tx) => (
                    <div key={tx.id} className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{normalizeTransactionDescription(tx.description)}</p>
                        <p className="mt-1 text-sm text-gray-600">
                          {new Date(tx.date).toLocaleDateString()} | Balance after redeem: {tx.balance.toLocaleString()} pts
                        </p>
                      </div>
                      <Badge className="w-fit border-orange-200 bg-orange-100 text-orange-700" variant="outline">
                        -{tx.points} pts
                      </Badge>
                    </div>
                  ))}
                </div>
                {renderPaginationControls({
                  currentPage: historyPage,
                  totalPages: historyPageCount,
                  label: "History",
                  onPrevious: () => setHistoryPage((page) => Math.max(1, page - 1)),
                  onNext: () => setHistoryPage((page) => Math.min(historyPageCount, page + 1)),
                })}
              </>
            )}
          </Card>
        </section>
      ) : null}

      {filteredRewards.length === 0 ? (
        <Card className={`${customerPanelSoftClass} border-dashed border-gray-300`}>
          <p className="text-sm text-gray-600">No rewards found in database yet.</p>
        </Card>
      ) : null}
      </main>

      <Dialog open={redeemDialogOpen} onOpenChange={setRedeemDialogOpen}>
        <DialogContent className="max-h-[calc(100vh-2.5rem)] overflow-y-auto rounded-[22px] border border-[#dfe7f0] !bg-white p-0 !text-gray-900 shadow-[0_30px_90px_rgba(8,26,53,0.25)] sm:max-w-[760px]">
          <DialogHeader className="border-b border-[#edf1f5] px-7 pb-4 pt-6">
            <DialogTitle className="text-[22px] font-black text-[#10213a]">Redeem Reward</DialogTitle>
            <DialogDescription className="text-sm font-medium leading-6 text-[#64748b]">
              Validate the redemption details first, then confirm to generate a scannable QR voucher.
            </DialogDescription>
          </DialogHeader>
          {selectedReward ? (
            <div className="space-y-5 px-7 py-5">
              <div className="grid gap-4 rounded-2xl bg-[#f7fafc] p-5 md:grid-cols-[1fr_auto]">
                <div className="flex items-center gap-4">
                  <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#fff0f0] text-[#ef777d]">
                    <TicketPercent className="h-7 w-7" />
                  </span>
                  <div>
                    <p className="text-lg font-black text-[#10213a]">{selectedReward.name}</p>
                    <p className="mt-1 text-sm font-medium leading-5 text-[#64748b]">{selectedReward.description}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[42px] font-black leading-none text-[#10213a]">{selectedReward.pointsCost.toLocaleString()}</p>
                  <p className="mt-1 text-xs font-medium text-[#64748b]">points</p>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-black text-[#10213a]">Redemption Method</Label>
                <div className="grid gap-4 md:grid-cols-2">
                  <button
                    type="button"
                    className={cn(
                      "relative min-h-[112px] rounded-2xl border p-4 text-left transition",
                      redemptionMethod === "in-store" ? "border-[#008c80] bg-[#f1fbf9]" : "border-[#dfe7f0] bg-white hover:bg-gray-50"
                    )}
                    onClick={() => setRedemptionMethod("in-store")}
                  >
                    {redemptionMethod === "in-store" ? (
                      <CheckCircle2 className="absolute right-4 top-4 h-6 w-6 fill-[#008c80] text-white" />
                    ) : null}
                    <Store className="h-7 w-7 text-[#10213a]" />
                    <p className="mt-4 font-black text-[#10213a]">In-store pickup</p>
                    <p className="mt-2 text-sm font-medium leading-6 text-[#64748b]">Generate a counter QR that staff can scan and validate.</p>
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "relative min-h-[112px] rounded-2xl border p-4 text-left transition",
                      redemptionMethod === "online" ? "border-[#008c80] bg-[#f1fbf9]" : "border-[#dfe7f0] bg-white hover:bg-gray-50"
                    )}
                    onClick={() => setRedemptionMethod("online")}
                  >
                    {redemptionMethod === "online" ? (
                      <CheckCircle2 className="absolute right-4 top-4 h-6 w-6 fill-[#008c80] text-white" />
                    ) : null}
                    <Truck className="h-7 w-7 text-[#10213a]" />
                    <p className="mt-4 font-black text-[#10213a]">Delivery</p>
                    <p className="mt-2 text-sm font-medium leading-6 text-[#64748b]">Require address, contact, and partner before redeeming.</p>
                  </button>
                </div>
              </div>

              {redemptionMethod === "online" ? (
                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="delivery-address" className="text-xs font-black text-[#10213a]">Delivery Address</Label>
                      <div className="relative mt-2">
                        <MapPin className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#64748b]" />
                      <Textarea
                        id="delivery-address"
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        placeholder="House / unit, street, barangay, city, province"
                          className="min-h-[68px] rounded-xl border-[#d9e3ee] bg-white pl-10 text-sm shadow-none focus-visible:ring-[#008c80]/20"
                      />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="delivery-contact" className="text-xs font-black text-[#10213a]">Contact Number</Label>
                      <div className="relative mt-2">
                        <Phone className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#64748b]" />
                        <Input
                          id="delivery-contact"
                          value={contactNumber}
                          onChange={(e) => setContactNumber(e.target.value)}
                          placeholder="09XXXXXXXXX"
                          className="h-[68px] rounded-xl border-[#d9e3ee] bg-white pl-10 text-sm shadow-none focus-visible:ring-[#008c80]/20"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="delivery-notes" className="text-xs font-black text-[#10213a]">Delivery Notes (Optional)</Label>
                      <Textarea
                        id="delivery-notes"
                        value={deliveryNotes}
                        onChange={(e) => setDeliveryNotes(e.target.value)}
                        placeholder="Landmark, gate code, rider note"
                        className="mt-2 min-h-[58px] rounded-xl border-[#d9e3ee] bg-white text-sm shadow-none focus-visible:ring-[#008c80]/20"
                      />
                    </div>
                    <div>
                      <Label htmlFor="delivery-partner-instructions" className="text-xs font-black text-[#10213a]">Delivery Partner Instructions (Optional)</Label>
                      <Input
                        id="delivery-partner-instructions"
                        value={deliveryPartnerInstructions}
                        onChange={(e) => setDeliveryPartnerInstructions(e.target.value)}
                        placeholder="Any instructions for the delivery partner"
                        className="mt-2 h-[58px] rounded-xl border-[#d9e3ee] bg-white text-sm shadow-none focus-visible:ring-[#008c80]/20"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-black text-[#10213a]">Delivery Partner</Label>
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                      {deliveryPartners.map((partner) => {
                        const mark = partnerMarks[partner.value];
                        const selected = deliveryPartner === partner.value;
                        return (
                          <button
                            key={partner.value}
                            type="button"
                            onClick={() => setDeliveryPartner(partner.value)}
                            className={cn(
                              "relative flex min-h-[86px] items-center gap-4 rounded-2xl border p-4 text-left transition",
                              selected ? "border-[#008c80] bg-[#f1fbf9]" : "border-[#dfe7f0] bg-white hover:bg-gray-50"
                            )}
                          >
                            {selected ? <CheckCircle2 className="absolute right-4 top-4 h-6 w-6 fill-[#008c80] text-white" /> : null}
                            <span className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-black", mark.className)}>
                              {partner.value === "pickup" ? <Store className="h-6 w-6" /> : mark.label}
                            </span>
                            <span>
                              <span className="block text-sm font-black text-[#10213a]">{partner.label}</span>
                              <span className="mt-1 block text-xs font-medium leading-5 text-[#64748b]">{partner.description}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-[#dce7f2] bg-[#fbfdff] p-4">
                  <div className="flex items-start gap-3">
                    <PackageCheck className="mt-0.5 h-5 w-5 text-[#10213a]" />
                    <div>
                      <p className="font-black text-[#10213a]">Counter validation</p>
                      <p className="mt-1 text-sm font-medium leading-6 text-[#64748b]">
                        After confirmation, the app will generate a real QR voucher that opens a validation page when scanned.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {deliveryValidationMessage ? (
                <div className="flex items-center gap-3 rounded-2xl border border-[#f4d0aa] bg-[#fff8ef] px-4 py-3 text-sm font-bold text-[#9a4d09]">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-[#f59e0b]" />
                  <span>{deliveryValidationMessage}</span>
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter className="border-t border-[#edf1f5] bg-white px-7 py-5">
            <Button variant="outline" className="h-11 rounded-xl border-[#d9e3ee] bg-white px-5 text-[#10213a] hover:bg-gray-50" onClick={() => setRedeemDialogOpen(false)}>
              Cancel
            </Button>
            <Button className="h-11 rounded-xl bg-[linear-gradient(135deg,#008c80,#006d68)] px-5 font-black text-white shadow-[0_12px_28px_rgba(0,140,128,0.18)] hover:bg-[#006d68]" onClick={confirmRedeem} disabled={saving || Boolean(deliveryValidationMessage)}>
              {redemptionMethod === "online" ? "Confirm & Generate Delivery Voucher" : "Confirm & Generate QR Voucher"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={voucherDialogOpen} onOpenChange={setVoucherDialogOpen}>
        <DialogContent className="sm:max-w-2xl !bg-white !text-gray-900 border border-gray-200 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Voucher Ready</DialogTitle>
            <DialogDescription className="text-gray-500">
              This QR now points to a validation page and the voucher is also saved in the wallet workspace.
            </DialogDescription>
          </DialogHeader>
          {walletSelection ? (
            <div className="grid gap-5 py-4 lg:grid-cols-[0.8fr_1.2fr]">
              <div className="rounded-3xl border border-[#dce7f2] bg-[#fbfdff] p-4 text-center">
                {walletSelection.qrImageUrl ? (
                  <img src={walletSelection.qrImageUrl} alt={`Voucher QR for ${normalizeRewardDisplayName(walletSelection.rewardName)}`} className="mx-auto h-56 w-56 rounded-2xl border border-[#dce7f2] bg-white p-3" />
                ) : (
                  <div className="mx-auto flex h-56 w-56 items-center justify-center rounded-2xl border border-[#dce7f2] bg-white text-[#10213a]">
                    <QrCode className="h-10 w-10" />
                  </div>
                )}
                <p className="mt-4 text-sm font-semibold text-[#10213a]">{walletSelection.voucherCode}</p>
                <p className="mt-1 text-xs text-gray-500">Order {walletSelection.orderId}</p>
              </div>
              <div className="space-y-4">
                <div className="rounded-2xl bg-[#f7fafc] p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#6d829e]">Reward</p>
                  <p className="mt-2 text-xl font-semibold text-gray-900">{normalizeRewardDisplayName(walletSelection.rewardName)}</p>
                </div>
                <div className="rounded-2xl bg-[#f7fafc] p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#6d829e]">Use this voucher</p>
                  <p className="mt-2 text-sm leading-6 text-gray-700">
                    {walletSelection.method === "in-store"
                      ? "Show the QR and voucher code at the counter. The scan opens the validation page."
                      : `Track this with ${walletSelection.deliveryPartner || walletSelection.partnerLabel || "the selected partner"}. Delivery details are attached to the voucher record.`}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#dce7f2] bg-white p-4">
                  <p className="text-sm font-semibold text-gray-900">Scan target</p>
                  <p className="mt-2 break-all text-xs leading-6 text-gray-600">{walletSelection.qrTargetUrl}</p>
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-3">
            <Button variant="outline" className="h-10 border-gray-300 bg-white text-gray-800 hover:bg-gray-50" onClick={() => setVoucherDialogOpen(false)}>
              Close
            </Button>
            <Button className={`h-10 ${brandNavySolidClass} ${brandNavySolidHoverClass}`} onClick={() => { setVoucherDialogOpen(false); navigate("/customer/activity"); }}>
              Open in Activity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={giftDialogOpen} onOpenChange={setGiftDialogOpen}>
        <DialogContent className="sm:max-w-md !bg-white !text-gray-900 border border-gray-200 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Gift Points to Friend</DialogTitle>
            <DialogDescription className="text-gray-500">Share points with another member.</DialogDescription>
          </DialogHeader>
          {selectedReward ? (
            <div className="space-y-4 py-4">
              <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
                <p className="text-sm text-gray-900"><strong>Sending:</strong> {selectedReward.pointsCost} points</p>
                <p className="mt-1 text-sm text-gray-600">For: {selectedReward.name}</p>
              </div>
              <div>
                <Label htmlFor="gift-email">Recipient Email</Label>
                <Input id="gift-email" type="email" placeholder="friend@email.com" value={giftEmail} onChange={(e) => setGiftEmail(e.target.value)} className="mt-2" />
              </div>
              <div>
                <Label htmlFor="gift-message">Personal Message</Label>
                <Input id="gift-message" placeholder="Enjoy your reward" value={giftMessage} onChange={(e) => setGiftMessage(e.target.value)} className="mt-2" />
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-3">
            <Button variant="outline" className="h-10 border-gray-300 bg-white text-gray-800 hover:bg-gray-50" onClick={() => setGiftDialogOpen(false)}>
              Cancel
            </Button>
            <Button className="h-10 bg-purple-600 text-white hover:bg-purple-700" onClick={confirmGift} disabled={!giftEmail || saving}>
              Send Gift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reserveDialogOpen} onOpenChange={setReserveDialogOpen}>
        <DialogContent className="sm:max-w-md !bg-white !text-gray-900 border border-gray-200 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Reserve Reward</DialogTitle>
            <DialogDescription className="text-gray-500">Reserve this reward for later without spending points yet.</DialogDescription>
          </DialogHeader>
          {selectedReward ? (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-4 rounded-lg bg-gray-50 p-4">
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{selectedReward.name}</p>
                  <p className="text-sm text-gray-600">{selectedReward.description}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-[#1A2B47]">{selectedReward.pointsCost}</p>
                  <p className="text-xs text-gray-500">points</p>
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-3">
            <Button variant="outline" className="h-10 border-gray-300 bg-white text-gray-800 hover:bg-gray-50" onClick={() => setReserveDialogOpen(false)}>
              Cancel
            </Button>
            <Button className={`h-10 ${brandNavySolidClass} ${brandNavySolidHoverClass}`} onClick={confirmReserve}>
              Reserve Reward
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

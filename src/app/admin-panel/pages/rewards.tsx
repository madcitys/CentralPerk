import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
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
  queueCampaignNotifications,
  savePromotionCampaign,
  saveRewardPartner,
  toggleRewardPartner,
  type CampaignPerformance,
  type PromotionCampaign,
  type RewardPartner,
  type RewardPartnerPerformance,
} from "../../lib/promotions";

function toInputDate(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type RewardsTab = "overview" | "campaigns" | "flash" | "partners";

const rewardsTabs: { value: RewardsTab; label: string; hash: string }[] = [
  { value: "overview", label: "Overview", hash: "#rewards-overview" },
  { value: "campaigns", label: "Campaigns", hash: "#rewards-campaigns" },
  { value: "flash", label: "Flash Sales", hash: "#rewards-flash" },
  { value: "partners", label: "Partners", hash: "#rewards-partners" },
];

export default function AdminRewardsPage() {
  const { loading, error, metrics, rewardsCatalog, refetch } = useAdminData();
  const [activeTab, setActiveTab] = useState<RewardsTab>("overview");
  const [campaigns, setCampaigns] = useState<PromotionCampaign[]>([]);
  const [campaignPerformance, setCampaignPerformance] = useState<CampaignPerformance[]>([]);
  const [partners, setPartners] = useState<RewardPartner[]>([]);
  const [partnerPerformance, setPartnerPerformance] = useState<RewardPartnerPerformance[]>([]);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [savingPartner, setSavingPartner] = useState(false);
  const [campaignForm, setCampaignForm] = useState({
    campaignCode: "",
    campaignName: "",
    description: "",
    campaignType: "bonus_points" as "bonus_points" | "flash_sale" | "multiplier_event",
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
  });
  const [partnerForm, setPartnerForm] = useState({
    partnerCode: "",
    partnerName: "",
    description: "",
    logoUrl: "",
    conversionRate: "12",
    isActive: true,
  });

  const reload = async () => {
    const [campaignRows, performanceRows, partnerRows, partnerPerfRows] = await Promise.all([
      loadPromotionCampaigns(),
      loadCampaignPerformance(),
      loadRewardPartners(),
      loadPartnerPerformance(),
    ]);
    setCampaigns(campaignRows);
    setCampaignPerformance(performanceRows);
    setPartners(partnerRows);
    setPartnerPerformance(partnerPerfRows);
  };

  useEffect(() => {
    reload().catch(() => {
      setCampaigns([]);
      setCampaignPerformance([]);
      setPartners([]);
      setPartnerPerformance([]);
    });
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

  const handleSaveCampaign = async () => {
    if (!campaignForm.campaignCode.trim() || !campaignForm.campaignName.trim()) {
      toast.error("Campaign code and name are required.");
      return;
    }
    try {
      setSavingCampaign(true);
      const saved = await savePromotionCampaign({
        campaignCode: campaignForm.campaignCode,
        campaignName: campaignForm.campaignName,
        description: campaignForm.description,
        campaignType: campaignForm.campaignType,
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
      if (campaignForm.pushNotificationEnabled) await queueCampaignNotifications(saved.id).catch(() => 0);
      await reload();
      toast.success("Campaign saved.");
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Unable to save campaign.");
    } finally {
      setSavingCampaign(false);
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

  if (loading) return <p className="text-base text-gray-700">Loading rewards data...</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div className={adminPageShellClass}>
      <div className={adminPageHeroClass}>
        <div className={adminPageHeroInnerClass}>
          <div className={adminEyebrowClass}>Rewards Engine</div>
          <h1 className={adminPageTitleClass}>Campaigns & Promotions</h1>
          <p className={adminPageDescriptionClass}>Admin workspace for bonus campaigns, flash sales, badges, and partner rewards with the same visual rhythm as analytics.</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as RewardsTab)} className="space-y-6">
        <div className="overflow-x-auto pb-1">
        <TabsList className="h-auto min-w-max flex-nowrap justify-start gap-1 rounded-full border border-[#d6e0f7] bg-[linear-gradient(180deg,#f8fbff_0%,#eef4ff_100%)] p-1 shadow-[0_10px_24px_rgba(16,33,58,0.04)]">
          <TabsTrigger value="overview" className="rounded-full px-4 py-2 data-[state=active]:bg-white data-[state=active]:ring-2 data-[state=active]:ring-[#2b4468]">Overview</TabsTrigger>
          <TabsTrigger value="campaigns" className="rounded-full px-4 py-2 data-[state=active]:bg-white data-[state=active]:ring-2 data-[state=active]:ring-[#2b4468]">Campaigns</TabsTrigger>
          <TabsTrigger value="flash" className="rounded-full px-4 py-2 data-[state=active]:bg-white data-[state=active]:ring-2 data-[state=active]:ring-[#2b4468]">Flash Sales</TabsTrigger>
          <TabsTrigger value="partners" className="rounded-full px-4 py-2 data-[state=active]:bg-white data-[state=active]:ring-2 data-[state=active]:ring-[#2b4468]">Partners</TabsTrigger>
        </TabsList>
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
            <h2 className="text-xl font-semibold text-gray-900">Campaign Creation UI</h2>
            <p className="text-sm text-gray-500 mt-1">Create bonus points, multiplier events, and flash-sale campaigns.</p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div><Label>Campaign Code</Label><Input value={campaignForm.campaignCode} onChange={(e) => setCampaignForm((prev) => ({ ...prev, campaignCode: e.target.value }))} /></div>
              <div><Label>Campaign Name</Label><Input value={campaignForm.campaignName} onChange={(e) => setCampaignForm((prev) => ({ ...prev, campaignName: e.target.value }))} /></div>
              <div><Label>Type</Label><select className={adminSelectClass} value={campaignForm.campaignType} onChange={(e) => setCampaignForm((prev) => ({ ...prev, campaignType: e.target.value as typeof campaignForm.campaignType }))}><option value="bonus_points">Bonus points</option><option value="multiplier_event">Multiplier event</option><option value="flash_sale">Flash sale</option></select></div>
              <div><Label>Reward Link</Label><select className={adminSelectClass} value={campaignForm.rewardId} onChange={(e) => setCampaignForm((prev) => ({ ...prev, rewardId: e.target.value }))}><option value="">No linked reward</option>{rewardsCatalog.map((reward) => <option key={reward.id ?? reward.reward_id} value={String(reward.id ?? "")}>{reward.name}</option>)}</select></div>
              <div><Label>Multiplier</Label><Input type="number" step="0.01" value={campaignForm.multiplier} onChange={(e) => setCampaignForm((prev) => ({ ...prev, multiplier: e.target.value }))} /></div>
              <div><Label>Bonus Points</Label><Input type="number" value={campaignForm.bonusPoints} onChange={(e) => setCampaignForm((prev) => ({ ...prev, bonusPoints: e.target.value }))} /></div>
              <div><Label>Minimum Purchase</Label><Input type="number" step="0.01" value={campaignForm.minimumPurchaseAmount} onChange={(e) => setCampaignForm((prev) => ({ ...prev, minimumPurchaseAmount: e.target.value }))} /></div>
              <div><Label>Flash Quantity Limit</Label><Input type="number" value={campaignForm.flashSaleQuantityLimit} onChange={(e) => setCampaignForm((prev) => ({ ...prev, flashSaleQuantityLimit: e.target.value }))} /></div>
              <div><Label>Product Scope</Label><Input value={campaignForm.productScope} onChange={(e) => setCampaignForm((prev) => ({ ...prev, productScope: e.target.value }))} placeholder="pastry, beverage" /></div>
              <div><Label>Eligible Tiers</Label><Input value={campaignForm.eligibleTiers} onChange={(e) => setCampaignForm((prev) => ({ ...prev, eligibleTiers: e.target.value }))} placeholder="Bronze,Silver,Gold" /></div>
              <div><Label>Start</Label><Input type="datetime-local" value={campaignForm.startsAt} onChange={(e) => setCampaignForm((prev) => ({ ...prev, startsAt: e.target.value }))} /></div>
              <div><Label>End</Label><Input type="datetime-local" value={campaignForm.endsAt} onChange={(e) => setCampaignForm((prev) => ({ ...prev, endsAt: e.target.value }))} /></div>
            </div>
            <div className="mt-4"><Label>Description</Label><Textarea rows={3} value={campaignForm.description} onChange={(e) => setCampaignForm((prev) => ({ ...prev, description: e.target.value }))} /></div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div><Label>Banner Title</Label><Input value={campaignForm.bannerTitle} onChange={(e) => setCampaignForm((prev) => ({ ...prev, bannerTitle: e.target.value }))} /></div>
              <div><Label>Countdown Label</Label><Input value={campaignForm.countdownLabel} onChange={(e) => setCampaignForm((prev) => ({ ...prev, countdownLabel: e.target.value }))} /></div>
            </div>
            <div className="mt-4"><Label>Banner Message</Label><Textarea rows={3} value={campaignForm.bannerMessage} onChange={(e) => setCampaignForm((prev) => ({ ...prev, bannerMessage: e.target.value }))} /></div>
            <label className="mt-4 flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={campaignForm.pushNotificationEnabled} onChange={(e) => setCampaignForm((prev) => ({ ...prev, pushNotificationEnabled: e.target.checked }))} /> Queue push notifications after save</label>
            <div className="mt-5"><Button className={adminDarkButtonClass} onClick={handleSaveCampaign} disabled={savingCampaign}>{savingCampaign ? "Saving..." : "Save Campaign"}</Button></div>
          </Card>

          <Card className={adminPanelClass}>
            <h2 className="text-xl font-semibold text-gray-900">Campaign Analytics</h2>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {campaigns.map((campaign) => {
                const performance = campaignPerformanceById.get(campaign.id);
                return (
                  <div key={campaign.id} className={adminPanelSoftClass}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div><p className="font-semibold text-gray-900">{campaign.campaignName}</p><p className="text-sm text-gray-500">{campaign.campaignCode}</p></div>
                      <div className="flex gap-2"><Badge variant="outline">{campaign.campaignType}</Badge><Badge className={campaign.status === "active" ? "bg-[#e6f8fa] text-[#0f5f65]" : "bg-[#f3f4f6] text-gray-600"}>{campaign.status}</Badge></div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div className={`${adminMetricPanelClass} ${adminMetricVariantClass(0)} p-3`}><p className="text-gray-500">Points Awarded</p><p className="mt-1 text-lg font-semibold text-gray-900">{performance?.pointsAwarded ?? 0}</p></div>
                      <div className={`${adminMetricPanelClass} ${adminMetricVariantClass(1)} p-3`}><p className="text-gray-500">Tracked Events</p><p className="mt-1 text-lg font-semibold text-gray-900">{performance?.trackedTransactions ?? 0}</p></div>
                      <div className={`${adminMetricPanelClass} ${adminMetricVariantClass(3)} p-3`}><p className="text-gray-500">Redemptions</p><p className="mt-1 text-lg font-semibold text-gray-900">{performance?.redemptionCount ?? 0}</p></div>
                      <div className={`${adminMetricPanelClass} ${adminMetricVariantClass(2)} p-3`}><p className="text-gray-500">Notifications</p><p className="mt-1 text-lg font-semibold text-gray-900">{performance?.notificationsSent ?? 0}</p></div>
                    </div>
                    <div className="mt-4"><Button variant="outline" size="sm" onClick={() => queueCampaignNotifications(campaign.id).then(async (count) => { toast.success(`Queued ${count} notifications.`); await reload(); }).catch((queueError) => toast.error(queueError instanceof Error ? queueError.message : "Unable to queue notifications."))}>Queue Notifications</Button></div>
                  </div>
                );
              })}
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
          <Card className={adminPanelClass}>
            <h2 className="text-xl font-semibold text-gray-900">Partner Management UI</h2>
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
              const linkedRewards = rewardsByPartner.get(partner.id) || [];
              return (
                <Card key={partner.id} className={adminPanelSoftClass}>
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="text-xl font-semibold text-gray-900">{partner.partnerName}</p><p className="text-sm text-gray-500">{partner.partnerCode}</p></div>
                    <Badge className={partner.isActive ? "bg-[#e6f8fa] text-[#0f5f65]" : "bg-[#f3f4f6] text-gray-600"}>{partner.isActive ? "Active" : "Disabled"}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-gray-600">{partner.description || "No description provided."}</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className={`${adminMetricPanelClass} ${adminMetricVariantClass(0)} p-3`}><p className="text-gray-500">Rewards Linked</p><p className="mt-1 text-lg font-semibold text-gray-900">{performance?.rewardsCount ?? linkedRewards.length}</p></div>
                    <div className={`${adminMetricPanelClass} ${adminMetricVariantClass(1)} p-3`}><p className="text-gray-500">Redemptions</p><p className="mt-1 text-lg font-semibold text-gray-900">{performance?.redemptionCount ?? 0}</p></div>
                    <div className={`${adminMetricPanelClass} ${adminMetricVariantClass(3)} p-3`}><p className="text-gray-500">Unique Redeemers</p><p className="mt-1 text-lg font-semibold text-gray-900">{performance?.uniqueRedeemers ?? 0}</p></div>
                    <div className={`${adminMetricPanelClass} ${adminMetricVariantClass(2)} p-3`}><p className="text-gray-500">Points Redeemed</p><p className="mt-1 text-lg font-semibold text-gray-900">{performance?.pointsRedeemed ?? 0}</p></div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">{linkedRewards.map((reward) => <Badge key={reward.reward_id} variant="outline">{reward.name}</Badge>)}{linkedRewards.length === 0 ? <span className="text-xs text-gray-500">No linked rewards yet.</span> : null}</div>
                  <div className="mt-4"><Button variant="outline" onClick={() => toggleRewardPartner(partner.id, !partner.isActive).then(async () => { await reload(); await refetch(); }).catch((toggleError) => toast.error(toggleError instanceof Error ? toggleError.message : "Unable to update partner."))}>{partner.isActive ? "Disable Partner" : "Enable Partner"}</Button></div>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

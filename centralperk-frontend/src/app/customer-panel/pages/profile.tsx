import { useEffect, useState } from "react";
import { Award, Calendar, Edit2, Save, Star, Trophy, X } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import { toast } from "sonner";
import TierHistory from "../../../components/TierHistory";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Progress } from "../../../components/ui/progress";
import { Switch } from "../../../components/ui/switch";
import {
  loadBirthdayRewardStatus,
  loadCommunicationPreference,
  saveCommunicationPreference,
  type CommunicationPreference,
} from "../../lib/member-lifecycle";
import { fetchTierRules, loadTierHistory, updateMemberProfile, uploadMemberProfilePhoto } from "../../lib/loyalty-supabase";
import { loadBadgeLeaderboard, loadMemberBadgeProgress, type BadgeLeaderboardEntry, type MemberBadgeProgress } from "../../lib/promotions";
import type { AppOutletContext } from "../../types/app-context";
import { brandNavyBadgeClass, brandNavySolidClass, brandNavySolidHoverClass, brandTealBadgeClass } from "../../lib/ui-color-tokens";
import {
  customerEyebrowClass,
  customerPageDescriptionClass,
  customerPageHeroClass,
  customerPageHeroInnerClass,
  customerPanelClass,
  customerPageTitleClass,
  customerTabActiveClass,
  customerTabClass,
  customerTabRailClass,
} from "../lib/page-theme";

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] || "", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

type ProfileTab = "overview" | "personal" | "membership" | "preferences" | "achievements";

const profileTabs: { value: ProfileTab; label: string; hash: string }[] = [
  { value: "overview", label: "Overview", hash: "#profile-overview" },
  { value: "personal", label: "Personal Info", hash: "#profile-personal" },
  { value: "membership", label: "Membership", hash: "#profile-membership" },
  { value: "preferences", label: "Preferences", hash: "#profile-preferences" },
  { value: "achievements", label: "Achievements", hash: "#profile-achievements" },
];

export default function Profile() {
  const { user, setUser, refreshUser } = useOutletContext<AppOutletContext>();
  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");
  const [isEditing, setIsEditing] = useState(false);
  const [pendingOtp, setPendingOtp] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState("");
  const [pendingSave, setPendingSave] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [birthdayBadge, setBirthdayBadge] = useState<string | null>(null);
  const [badgeProgress, setBadgeProgress] = useState<MemberBadgeProgress[]>([]);
  const [badgeLeaderboard, setBadgeLeaderboard] = useState<BadgeLeaderboardEntry[]>([]);
  const [tierTimeline, setTierTimeline] = useState<{ id: string; old_tier: string; new_tier: string; changed_at: string; reason?: string }[]>([]);
  const [preferences, setPreferences] = useState<CommunicationPreference>({ sms: true, email: true, push: true, promotionalOptIn: true, frequency: "weekly" });
  const [globalOptOutDialogOpen, setGlobalOptOutDialogOpen] = useState(false);
  const [tierMinimums, setTierMinimums] = useState({ Bronze: 0, Silver: 250, Gold: 750 });
  const [formData, setFormData] = useState({
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    birthdate: user.birthdate || "",
    address: user.address || "",
    profileImage: user.profileImage,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    const matchedTab = profileTabs.find((tab) => tab.hash === hash);
    if (matchedTab) {
      setActiveTab(matchedTab.value);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const current = profileTabs.find((tab) => tab.value === activeTab);
    if (!current) return;
    const nextUrl = `${window.location.pathname}${window.location.search}${current.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, [activeTab]);

  useEffect(() => {
    loadCommunicationPreference(user.memberId, user.email).then(setPreferences).catch(() => {});
    setFormData({
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      birthdate: user.birthdate || "",
      address: user.address || "",
      profileImage: user.profileImage,
    });
    loadTierHistory(user.memberId, user.email)
      .then((rows) => setTierTimeline(rows.map((r) => ({ id: String(r.id), old_tier: String(r.old_tier || "Bronze"), new_tier: String(r.new_tier || "Bronze"), changed_at: String(r.changed_at || new Date().toISOString()), reason: r.reason ? String(r.reason) : undefined }))))
      .catch(() => setTierTimeline([]));
    loadBirthdayRewardStatus(user.memberId, user.email).then((status) => setBirthdayBadge(status.badgeLabel)).catch(() => setBirthdayBadge(null));
    loadMemberBadgeProgress(user.memberId, user.email).then(setBadgeProgress).catch(() => setBadgeProgress([]));
    loadBadgeLeaderboard(5).then(setBadgeLeaderboard).catch(() => setBadgeLeaderboard([]));
  }, [user]);

  useEffect(() => {
    fetchTierRules()
      .then((rules) => {
        const nextMinimums = { Bronze: 0, Silver: 250, Gold: 750 };
        for (const rule of rules) {
          const tierLabel = String(rule.tier_label).toLowerCase();
          if (tierLabel === "bronze") nextMinimums.Bronze = Math.max(0, Number(rule.min_points) || 0);
          if (tierLabel === "silver") nextMinimums.Silver = Math.max(0, Number(rule.min_points) || 0);
          if (tierLabel === "gold") nextMinimums.Gold = Math.max(0, Number(rule.min_points) || 0);
        }
        setTierMinimums(nextMinimums);
      })
      .catch(() => {});
  }, []);

  const handleCancel = () => {
    setFormData({ fullName: user.fullName, email: user.email, phone: user.phone, birthdate: user.birthdate || "", address: user.address || "", profileImage: user.profileImage });
    setPendingOtp(null);
    setOtpInput("");
    setPendingSave(false);
    setIsEditing(false);
  };

  const handleSave = async () => {
    const emailChanged = formData.email.trim().toLowerCase() !== user.email.trim().toLowerCase();
    const addressChanged = (formData.address || "").trim() !== (user.address || "").trim();
    if ((emailChanged || addressChanged) && !pendingSave) {
      const generatedOtp = `${Math.floor(100000 + Math.random() * 900000)}`;
      setPendingOtp(generatedOtp);
      setOtpInput("");
      setPendingSave(true);
      toast.info(`OTP sent to your registered channel: ${generatedOtp}`, { description: "Demo mode OTP. Enter this code to confirm secure changes." });
      return;
    }
    if ((emailChanged || addressChanged) && (!pendingOtp || otpInput.trim() !== pendingOtp)) {
      toast.error("Invalid OTP. Please try again.");
      return;
    }
    const { firstName, lastName } = splitName(user.fullName);
    try {
      const updateResult = await updateMemberProfile({
        memberIdentifier: user.memberId,
        fallbackEmail: user.email,
        firstName,
        lastName,
        email: formData.email,
        phone: formData.phone,
        birthdate: formData.birthdate,
        address: formData.address,
        profilePhotoUrl: formData.profileImage,
      });
      setUser((prev) => ({ ...prev, email: String(updateResult.effectiveEmail || prev.email), address: formData.address, profileImage: formData.profileImage }));
      setFormData((prev) => ({ ...prev, email: String(updateResult.effectiveEmail || prev.email) }));
      setPendingOtp(null);
      setOtpInput("");
      setPendingSave(false);
      setIsEditing(false);
      toast.success(
        updateResult.pendingEmailVerification
          ? "Profile updated. Confirm your new email address to finish the auth email change."
          : "Profile updated!"
      );
      await refreshUser();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update profile.");
    }
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setIsUploadingPhoto(true);
      const photoUrl = await uploadMemberProfilePhoto(user.memberId, file);
      setFormData((prev) => ({ ...prev, profileImage: photoUrl }));
      toast.success("Profile photo uploaded.", { description: "Save your changes to apply the new photo to your profile." });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload profile photo.");
    } finally {
      setIsUploadingPhoto(false);
      event.target.value = "";
    }
  };

  const savePreferences = async () => {
    try {
      await saveCommunicationPreference(user.memberId, preferences, user.email);
      toast.success("Communication preferences saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save communication preferences.");
    }
  };

  const nextTierInfo = { Bronze: { name: "Silver", pointsNeeded: tierMinimums.Silver }, Silver: { name: "Gold", pointsNeeded: tierMinimums.Gold }, Gold: { name: "Gold", pointsNeeded: tierMinimums.Gold } } as const;
  const nextTier = nextTierInfo[user.tier];
  const tierProgress = user.tier === "Gold" ? 100 : nextTier.pointsNeeded > 0 ? Math.min(100, (user.lifetimePoints / nextTier.pointsNeeded) * 100) : 0;
  const tierBenefits: Record<"Bronze" | "Silver" | "Gold", string[]> = {
    Bronze: ["Earn 1 point per $1 spent", "Basic member promotions", "Monthly welcome offers"],
    Silver: ["Earn 2 points per $1 spent", "Birthday month bonus: 100 points", "Early access to new products"],
    Gold: ["Earn 3 points per $1 spent", "Birthday month bonus: 200 points", "Priority customer support", "Exclusive Gold member events", "Free delivery on online orders"],
  };

  const membershipStats = [
    { label: "Member ID", value: user.memberId, icon: Award, iconClass: "bg-emerald-100 text-emerald-600" },
    { label: "Member Since", value: user.memberSince, icon: Calendar, iconClass: "bg-blue-100 text-blue-600" },
    { label: "Current Points", value: user.points.toLocaleString(), icon: Star, iconClass: "bg-purple-100 text-purple-600" },
    { label: "Lifetime Points", value: user.lifetimePoints.toLocaleString(), icon: Star, iconClass: "bg-orange-100 text-orange-600" },
  ];

  const preferenceChannels = [
    {
      key: "sms" as const,
      title: "SMS",
      description: "Short-form alerts and urgent delivery messages.",
    },
    {
      key: "email" as const,
      title: "Email",
      description: "Statements, confirmations, and long-form campaign details.",
    },
    {
      key: "push" as const,
      title: "Push",
      description: "In-app nudges, reminders, and device notifications.",
    },
  ];

  const handleGlobalPromotionalOpt = (checked: boolean) => {
    if (!checked) {
      setGlobalOptOutDialogOpen(true);
      return;
    }

    setPreferences((prev) => ({ ...prev, promotionalOptIn: true }));
  };

  const confirmGlobalOptOut = () => {
    setPreferences((prev) => ({ ...prev, promotionalOptIn: false }));
    setGlobalOptOutDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className={customerPageHeroClass}>
        <div className={customerPageHeroInnerClass}>
          <div className={customerEyebrowClass}>Member Identity</div>
          <h1 className={customerPageTitleClass}>Profile</h1>
          <p className={customerPageDescriptionClass}>Manage your account details, membership progress, preferences, and achievements in a softer layout that matches the rest of the portal.</p>
          {birthdayBadge ? <Badge className="mt-3">{birthdayBadge}</Badge> : null}
        </div>
      </div>

      <div className="space-y-6">
        <div className="overflow-x-auto pb-1">
        <div className={customerTabRailClass}>
          {profileTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveTab(tab.value)}
              className={`${customerTabClass} ${
                activeTab === tab.value
                  ? customerTabActiveClass
                  : "bg-transparent text-[#5a6f8d]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        </div>

        {activeTab === "overview" ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <Card className={customerPanelClass}>
                <h3 className="font-semibold text-gray-900 text-lg mb-6">Membership Details</h3>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  {membershipStats.map((item) => (
                    <div key={item.label} className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${item.iconClass}`}>
                        <item.icon className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">{item.label}</p>
                        <p className="font-semibold text-gray-900 mt-1">{item.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className={customerPanelClass}>
                <h3 className="font-semibold text-gray-900 text-lg mb-4">{user.tier} Tier Benefits</h3>
                <ul className="space-y-3">
                  {tierBenefits[user.tier].map((benefit) => (
                    <li key={benefit} className="flex items-start gap-3">
                      <div className="w-5 h-5 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg className="w-3 h-3 text-emerald-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                      </div>
                      <span className="text-gray-700">{benefit}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className={customerPanelClass}>
                <h3 className="font-semibold text-gray-900 mb-4">Tier Progress</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{user.tier === "Gold" ? "Max tier achieved" : `Progress to ${nextTier.name}`}</span>
                    <span className="font-semibold text-gray-900">{Math.min(100, Math.round(tierProgress))}%</span>
                  </div>
                  <Progress value={tierProgress} className="h-3" />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{Math.min(user.lifetimePoints, nextTier.pointsNeeded).toLocaleString()} / {nextTier.pointsNeeded.toLocaleString()}</span>
                    <span className="text-[#1A2B47] font-medium">{user.tier === "Gold" ? "Top tier" : `${Math.max(0, nextTier.pointsNeeded - user.lifetimePoints).toLocaleString()} to go`}</span>
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Quick Stats</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-4 border-b border-gray-200"><span className="text-gray-600 text-sm">This Month</span><div className="text-right"><p className="font-semibold text-green-600">+{user.earnedThisMonth}</p><p className="text-xs text-gray-500">earned</p></div></div>
                  <div className="flex items-center justify-between pb-4 border-b border-gray-200"><span className="text-gray-600 text-sm">Redeemed</span><div className="text-right"><p className="font-semibold text-orange-600">-{user.redeemedThisMonth}</p><p className="text-xs text-gray-500">this month</p></div></div>
                  <div className="flex items-center justify-between pb-4 border-b border-gray-200"><span className="text-gray-600 text-sm">Transactions</span><div className="text-right"><p className="font-semibold text-gray-900">{user.transactions.length}</p><p className="text-xs text-gray-500">total</p></div></div>
                  <div className="flex items-center justify-between"><span className="text-gray-600 text-sm">Surveys Completed</span><div className="text-right"><p className="font-semibold text-gray-900">{user.surveysCompleted}</p><p className="text-xs text-gray-500">surveys</p></div></div>
                </div>
              </Card>

              <Card className="p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Account Status</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between"><span className="text-sm text-gray-600">Profile Complete</span><Badge className={user.profileComplete ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>{user.profileComplete ? "Yes" : "No"}</Badge></div>
                  <div className="flex items-center justify-between"><span className="text-sm text-gray-600">App Downloaded</span><Badge className={user.hasDownloadedApp ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>{user.hasDownloadedApp ? "Yes" : "No"}</Badge></div>
                  <div className="flex items-center justify-between"><span className="text-sm text-gray-600">Email Verified</span><Badge className="bg-green-100 text-green-700">Verified</Badge></div>
                </div>
              </Card>

              <TierHistory timeline={tierTimeline} />
            </div>
          </div>
        ) : null}

        {activeTab === "personal" ? (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-semibold text-gray-900 text-lg">Personal Information</h3>
              {!isEditing ? (
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="border-emerald-200 bg-white text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"><Edit2 className="w-4 h-4 mr-2" />Edit (Email/Address)</Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleCancel}><X className="w-4 h-4 mr-2" />Cancel</Button>
                  <Button size="sm" onClick={handleSave} className="bg-emerald-700 text-white hover:bg-emerald-800"><Save className="w-4 h-4 mr-2" />Save</Button>
                </div>
              )}
            </div>

            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
              <img src={formData.profileImage} alt={formData.fullName} className="w-14 h-14 rounded-full object-cover border border-[#00A3AD]/30 bg-white" />
              <div>
                <h2 className="text-3xl font-bold text-gray-900">{formData.fullName}</h2>
                <div className="flex items-center gap-2 mt-2">
                  <Badge className={brandNavyBadgeClass}>{user.tier} Member</Badge>
                  <Badge variant="outline" className={user.status === "Active" ? brandTealBadgeClass : "border-gray-200 text-gray-500"}>{user.status}</Badge>
                </div>
                {isEditing ? (
                  <div className="mt-3">
                    <label className="inline-flex cursor-pointer items-center rounded-md border border-[#00A3AD]/30 px-3 py-1.5 text-xs font-medium text-[#1A2B47] hover:bg-[#f3fbfc]">
                      {isUploadingPhoto ? "Uploading..." : "Upload Profile Photo"}
                      <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={isUploadingPhoto} />
                    </label>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="space-y-4">
              <div><Label htmlFor="fullName">Full Name</Label><Input id="fullName" value={formData.fullName} onChange={(e) => setFormData({ ...formData, fullName: e.target.value })} disabled className="mt-2" /></div>
              <div><Label htmlFor="email">Email Address</Label><Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} disabled={!isEditing} className="mt-2" /></div>
              <div><Label htmlFor="phone">Phone Number</Label><Input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} disabled className="mt-2" /></div>
              <div><Label htmlFor="birthdate">Birthdate</Label><Input id="birthdate" type="date" value={formData.birthdate} onChange={(e) => setFormData({ ...formData, birthdate: e.target.value })} disabled className="mt-2" /></div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">For security, self-service updates keep mobile, name, and birthdate locked. Email, address, and profile photo can be updated here.</div>
              {pendingSave ? <div><Label htmlFor="otp">OTP Confirmation</Label><Input id="otp" value={otpInput} onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Enter 6-digit OTP" className="mt-2" /></div> : null}
              <div><Label htmlFor="address">Address</Label><Input id="address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} disabled={!isEditing} className="mt-2" /></div>
            </div>
          </Card>
        ) : null}

        {activeTab === "membership" ? (
          <div className="space-y-6">
          <Card className="p-6">
            <h3 className="font-semibold text-gray-900 text-lg mb-6">Membership Details</h3>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {membershipStats.map((item) => (
                <div key={item.label} className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${item.iconClass}`}>
                    <item.icon className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">{item.label}</p>
                    <p className="font-semibold text-gray-900 mt-1">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold text-gray-900 text-lg mb-4">{user.tier} Tier Benefits</h3>
            <ul className="space-y-3">
              {tierBenefits[user.tier].map((benefit) => (
                <li key={benefit} className="flex items-start gap-3">
                  <div className="w-5 h-5 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-emerald-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                  </div>
                  <span className="text-gray-700">{benefit}</span>
                </li>
              ))}
            </ul>
          </Card>
          </div>
        ) : null}

        {activeTab === "preferences" ? (
          <Card className="p-6">
            <h3 className="font-semibold text-gray-900 text-lg">Communication Preferences</h3>
            <p className="text-sm text-gray-500 mt-1">Control transactional and promotional messages by channel.</p>

            <div className="mt-5 rounded-2xl border border-[#ffd7dc] bg-[#fff7f8] p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c2415b]">Global promotional opt-out</p>
                  <h4 className="mt-2 text-xl font-semibold text-gray-900">Pause all marketing messages</h4>
                  <p className="mt-1 text-sm text-gray-600">Transactional confirmations stay on. This controls promo email, SMS, and push.</p>
                </div>
                <div className="rounded-2xl border border-[#ffd7dc] bg-white px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{preferences.promotionalOptIn ? "Promotions enabled" : "Global opt-out enabled"}</p>
                      <p className="text-xs text-gray-500">{preferences.promotionalOptIn ? "Promo messages are on." : "Only transactional messages are on."}</p>
                    </div>
                    <Switch checked={preferences.promotionalOptIn} onCheckedChange={(v) => handleGlobalPromotionalOpt(Boolean(v))} />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-3">
              {preferenceChannels.map((channel) => {
                const enabled = preferences[channel.key];
                return (
                  <div key={channel.key} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_10px_30px_rgba(16,33,58,0.04)]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5f6f86]">{channel.title}</p>
                        <h4 className="mt-2 text-lg font-semibold text-gray-900">{channel.title} channel</h4>
                        <p className="mt-1 text-sm text-gray-500">{channel.description}</p>
                      </div>
                      <Switch checked={enabled} onCheckedChange={(v) => setPreferences((prev) => ({ ...prev, [channel.key]: Boolean(v) }))} />
                    </div>

                    <div className="mt-5 space-y-3">
                      <div className="rounded-xl border border-gray-100 bg-[#f8fbff] px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-[#5f6f86]">Transactional</p>
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <p className="text-sm text-gray-700">Receipts, confirmations, and alerts</p>
                          <Badge className={enabled ? brandTealBadgeClass : "bg-gray-100 text-gray-600"}>{enabled ? "Enabled" : "Off"}</Badge>
                        </div>
                      </div>
                      <div className="rounded-xl border border-gray-100 bg-[#f8fbff] px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-[#5f6f86]">Promotions</p>
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <p className="text-sm text-gray-700">Campaigns and promo updates</p>
                          <Badge className={enabled && preferences.promotionalOptIn ? brandNavyBadgeClass : "bg-gray-100 text-gray-600"}>
                            {enabled && preferences.promotionalOptIn ? "On" : "Muted"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
              <div className="space-y-2">
                <Label htmlFor="pref-frequency">Promotional frequency</Label>
                <select id="pref-frequency" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" value={preferences.frequency} onChange={(e) => setPreferences((prev) => ({ ...prev, frequency: e.target.value as CommunicationPreference["frequency"] }))}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="never">Never</option>
                </select>
              </div>
              <Button onClick={savePreferences} className={`${brandNavySolidClass} ${brandNavySolidHoverClass}`}>Save Preferences</Button>
            </div>
          </Card>
        ) : null}

        {activeTab === "achievements" ? (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <Card className="p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-[#f7f5ff] p-3"><Award className="h-5 w-5 text-[#6d28d9]" /></div>
                <div><h3 className="text-xl font-semibold text-gray-900">Achievement Badges</h3><p className="text-sm text-gray-500">Track earned badges and your progress toward the next milestone.</p></div>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {badgeProgress.map((badge) => {
                  const percent = badge.milestoneTarget > 0 ? Math.min(100, (badge.progressValue / badge.milestoneTarget) * 100) : 0;
                  return (
                    <div key={badge.badgeId} className="rounded-2xl border border-gray-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div><p className="font-semibold text-gray-900">{badge.badgeName}</p><p className="mt-1 text-sm text-gray-600">{badge.description}</p></div>
                      <Badge className={badge.isEarned ? brandNavyBadgeClass : "bg-[#f3f4f6] text-gray-600"}>{badge.isEarned ? "Earned" : "In Progress"}</Badge>
                      </div>
                      <div className="mt-4 space-y-2">
                        <Progress value={percent} className="h-2" />
                        <p className="text-xs text-gray-500">{badge.progressValue} / {badge.milestoneTarget}{badge.earnedAt ? ` | earned ${new Date(badge.earnedAt).toLocaleDateString()}` : ""}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <div className="space-y-6">
              <Card className="p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-[#fff7ed] p-3"><Trophy className="h-5 w-5 text-[#c2410c]" /></div>
                  <div><h3 className="text-xl font-semibold text-gray-900">Badge Leaderboard</h3><p className="text-sm text-gray-500">Members with the highest number of earned badges.</p></div>
                </div>
                <div className="mt-5 space-y-3">
                  {badgeLeaderboard.map((entry, index) => (
                    <div key={entry.memberId} className="flex items-center justify-between rounded-2xl border border-gray-200 px-4 py-3">
                      <div><p className="font-medium text-gray-900">#{index + 1} {entry.memberName || entry.memberNumber}</p><p className="text-xs text-gray-500">{entry.memberNumber}</p></div>
                      <Badge variant="outline">{entry.badgeCount} badges</Badge>
                    </div>
                  ))}
                  {badgeLeaderboard.length === 0 ? <p className="text-sm text-gray-500">No badge awards yet.</p> : null}
                </div>
              </Card>
              <TierHistory timeline={tierTimeline} />
            </div>
          </div>
        ) : null}
      </div>

      <Dialog open={globalOptOutDialogOpen} onOpenChange={setGlobalOptOutDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm global opt-out</DialogTitle>
            <DialogDescription>
              This will turn off promotional email, SMS, and push messages across every channel. Transactional updates will still stay enabled.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-3">
            <Button variant="outline" onClick={() => setGlobalOptOutDialogOpen(false)}>Cancel</Button>
            <Button className="bg-[#b42318] text-white hover:bg-[#962d22]" onClick={confirmGlobalOptOut}>
              Confirm opt-out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

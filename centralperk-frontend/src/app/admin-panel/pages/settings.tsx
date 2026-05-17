import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { fetchActiveEarningRules, fetchTierRules, saveEarningRules, saveTierRules, type EarningRule } from "../../lib/loyalty-supabase";
import type { TierRule } from "../../lib/loyalty-engine";
import { toast } from "sonner";
import {
  DEFAULT_BIRTHDAY_REWARD_SETTINGS,
  loadBirthdayRewardSettings,
  saveBirthdayRewardSettings,
  type BirthdayRewardSettings,
} from "../../lib/member-lifecycle";
import {
  adminEyebrowClass,
  adminInputClass,
  adminPageDescriptionClass,
  adminPageHeroClass,
  adminPageHeroInnerClass,
  adminPageShellClass,
  adminPageTitleClass,
  adminPanelClass,
  adminPanelSoftClass,
  adminPrimaryButtonClass,
} from "../lib/page-theme";

const FALLBACK_RULES: TierRule[] = [
  { tier_label: "Bronze", min_points: 0 },
  { tier_label: "Silver", min_points: 250 },
  { tier_label: "Gold", min_points: 750 },
];

const FALLBACK_EARNING_RULES: EarningRule[] = [
  { tier_label: "Bronze", peso_per_point: 10, multiplier: 1, is_active: true },
  { tier_label: "Silver", peso_per_point: 10, multiplier: 1.25, is_active: true },
  { tier_label: "Gold", peso_per_point: 10, multiplier: 1.5, is_active: true },
];

export default function AdminSettingsPage() {
  const [rules, setRules] = useState<TierRule[]>(FALLBACK_RULES);
  const [earningRules, setEarningRules] = useState<EarningRule[]>(FALLBACK_EARNING_RULES);
  const [birthdaySettings, setBirthdaySettings] = useState<BirthdayRewardSettings>(DEFAULT_BIRTHDAY_REWARD_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [pendingOtp, setPendingOtp] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState("");
  const [pendingSave, setPendingSave] = useState(false);

  useEffect(() => {
    fetchTierRules()
      .then((data) => setRules(data))
      .catch(() => setRules(FALLBACK_RULES));

    fetchActiveEarningRules()
      .then((data) => setEarningRules(data))
      .catch(() => setEarningRules(FALLBACK_EARNING_RULES));

    setBirthdaySettings(loadBirthdayRewardSettings());
  }, []);

  const updateRule = (tierLabel: string, nextValue: number) => {
    setRules((prev) =>
      prev.map((rule) =>
        rule.tier_label.toLowerCase() === tierLabel.toLowerCase()
          ? {
              ...rule,
              // Bronze is fixed as the base tier at 0 points.
              min_points: tierLabel.toLowerCase() === "bronze" ? 0 : Math.max(0, Math.floor(nextValue || 0)),
            }
          : rule
      )
    );
  };

  const updateEarningRule = (tierLabel: string, patch: Partial<EarningRule>) => {
    setEarningRules((prev) =>
      prev.map((rule) =>
        rule.tier_label.toLowerCase() === tierLabel.toLowerCase()
          ? { ...rule, ...patch }
          : rule
      )
    );
  };

  const handleSave = async () => {
    if (!pendingSave) {
      const generatedOtp = `${Math.floor(100000 + Math.random() * 900000)}`;
      setPendingOtp(generatedOtp);
      setOtpInput("");
      setPendingSave(true);
      toast.info(`OTP sent to your registered channel: ${generatedOtp}`, {
        description: "Demo mode OTP. Enter this code to confirm settings changes.",
      });
      return;
    }

    if (!pendingOtp || otpInput.trim() !== pendingOtp) {
      toast.error("Invalid OTP. Please try again.");
      return;
    }

    try {
      setSaving(true);
      await Promise.all([saveTierRules(rules), saveEarningRules(earningRules)]);
      saveBirthdayRewardSettings(birthdaySettings);
      toast.success("Tier and earning rules saved.");
      setPendingOtp(null);
      setOtpInput("");
      setPendingSave(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save rules.");
    } finally {
      setSaving(false);
    }
  };

  const byTier = (label: string) => rules.find((rule) => rule.tier_label.toLowerCase() === label.toLowerCase());
  const earningByTier = (label: string) => earningRules.find((rule) => rule.tier_label.toLowerCase() === label.toLowerCase());
  const updateBirthdayAmount = (tier: "Bronze" | "Silver" | "Gold", nextValue: number) => {
    setBirthdaySettings((prev) => ({
      ...prev,
      amounts: {
        ...prev.amounts,
        [tier]: Math.max(0, Math.floor(nextValue || 0)),
      },
    }));
  };

  return (
    <div className={adminPageShellClass}>
      <div className={adminPageHeroClass}>
        <div className={adminPageHeroInnerClass}>
          <div className={adminEyebrowClass}>Rules & Configuration</div>
          <h1 className={adminPageTitleClass}>Settings</h1>
          <p className={adminPageDescriptionClass}>Administrative configuration for tiers and earning rules, using the same softer analytics visual language.</p>
        </div>
      </div>

      <div className={adminPanelClass}>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Tier Rules Configuration</h2>
          <p className="text-gray-600 text-sm mt-1">Configure points thresholds used to calculate member tier.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(["Bronze", "Silver", "Gold"] as const).map((tier) => (
            <label key={tier} className={`${adminPanelSoftClass} block`}>
              <p className="text-sm font-semibold text-gray-700 mb-2">{tier} minimum points</p>
              <input
                type="number"
                min={0}
                value={byTier(tier)?.min_points ?? 0}
                onChange={(e) => updateRule(tier, Number(e.target.value))}
                disabled={tier === "Bronze"}
                className={adminInputClass}
              />
              {tier === "Bronze" ? (
                <p className="mt-2 text-xs text-gray-500">Bronze is the default starting tier and stays at 0 points.</p>
              ) : null}
            </label>
          ))}
        </div>
      </div>

      <div className={adminPanelClass}>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Earning Rate Configuration</h2>
          <p className="text-gray-600 text-sm mt-1">Default target is 1 point per PHP 10 with optional tier multipliers.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(["Bronze", "Silver", "Gold"] as const).map((tier) => (
            <div key={tier} className={`${adminPanelSoftClass} space-y-3`}>
              <p className="text-sm font-semibold text-gray-700">{tier} earning rule</p>
              <label className="block">
                <span className="text-xs text-gray-600">Peso per 1 point</span>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={earningByTier(tier)?.peso_per_point ?? 10}
                  onChange={(e) => updateEarningRule(tier, { peso_per_point: Number(e.target.value) || 10 })}
                  className={`mt-1 ${adminInputClass}`}
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-600">Multiplier</span>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={earningByTier(tier)?.multiplier ?? 1}
                  onChange={(e) => updateEarningRule(tier, { multiplier: Number(e.target.value) || 1 })}
                  className={`mt-1 ${adminInputClass}`}
                />
              </label>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={`${adminPrimaryButtonClass} mt-6 disabled:opacity-70`}
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : pendingSave ? "Confirm OTP & Save" : "Save Rules"}
        </button>
        {pendingSave ? (
          <div className={`${adminPanelSoftClass} mt-4`}>
            <p className="text-sm font-semibold text-gray-700">OTP Confirmation</p>
            <p className="mt-1 text-xs text-gray-500">Enter the 6-digit OTP shown in the toast to confirm these settings changes.</p>
            <input
              type="text"
              inputMode="numeric"
              value={otpInput}
              onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="Enter 6-digit OTP"
              className={`mt-3 ${adminInputClass}`}
            />
          </div>
        ) : null}
      </div>

      <div className={adminPanelClass}>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Birthday Rewards Schedule</h2>
          <p className="text-gray-600 text-sm mt-1">
            Configure Bronze, Silver, and Gold birthday amounts plus when the perk becomes available to members.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(["Bronze", "Silver", "Gold"] as const).map((tier) => (
            <label key={tier} className={`${adminPanelSoftClass} block`}>
              <p className="text-sm font-semibold text-gray-700 mb-2">{tier} birthday reward</p>
              <input
                type="number"
                min={0}
                step={1}
                value={birthdaySettings.amounts[tier]}
                onChange={(e) => updateBirthdayAmount(tier, Number(e.target.value))}
                className={adminInputClass}
              />
              <p className="mt-2 text-xs text-gray-500">Points credited when a {tier.toLowerCase()} member unlocks their birthday reward.</p>
            </label>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <label className={`${adminPanelSoftClass} block`}>
            <p className="text-sm font-semibold text-gray-700 mb-2">Release timing</p>
            <select
              value={birthdaySettings.releaseTiming}
              onChange={(e) =>
                setBirthdaySettings((prev) => ({
                  ...prev,
                  releaseTiming: e.target.value === "birthday_date" ? "birthday_date" : "first_day_of_birthday_month",
                }))
              }
              className={adminInputClass}
            >
              <option value="first_day_of_birthday_month">1st day of birthday month</option>
              <option value="birthday_date">Exact birthday date</option>
            </select>
          </label>

          <label className={`${adminPanelSoftClass} block`}>
            <p className="text-sm font-semibold text-gray-700 mb-2">Fulfillment</p>
            <select
              value={birthdaySettings.fulfillmentMode}
              onChange={(e) =>
                setBirthdaySettings((prev) => ({
                  ...prev,
                  fulfillmentMode: e.target.value === "auto_credit" ? "auto_credit" : "manual_claim",
                }))
              }
              className={adminInputClass}
            >
              <option value="manual_claim">Manual claim in portal</option>
              <option value="auto_credit">Auto-credit bonus</option>
            </select>
          </label>

          <label className={`${adminPanelSoftClass} block`}>
            <p className="text-sm font-semibold text-gray-700 mb-2">Claim window</p>
            <select
              value={birthdaySettings.claimWindow}
              onChange={(e) =>
                setBirthdaySettings((prev) => ({
                  ...prev,
                  claimWindow: e.target.value === "birthday_week" ? "birthday_week" : "birthday_month_only",
                }))
              }
              className={adminInputClass}
            >
              <option value="birthday_month_only">Birthday month only</option>
              <option value="birthday_week">Birthday week only</option>
            </select>
          </label>
        </div>

        <div className={`${adminPanelSoftClass} mt-4`}>
          <p className="text-sm font-semibold text-gray-700">Current rule summary</p>
          <p className="mt-2 text-sm text-gray-600">
            Bronze: {birthdaySettings.amounts.Bronze} pts • Silver: {birthdaySettings.amounts.Silver} pts • Gold: {birthdaySettings.amounts.Gold} pts
          </p>
          <p className="mt-1 text-sm text-gray-600">
            Unlocks on{" "}
            {birthdaySettings.releaseTiming === "birthday_date" ? "the exact birthday date" : "the 1st day of the birthday month"} with{" "}
            {birthdaySettings.fulfillmentMode === "auto_credit" ? "automatic crediting" : "manual member claiming"} during the{" "}
            {birthdaySettings.claimWindow === "birthday_week" ? "birthday week" : "birthday month"}.
          </p>
        </div>
      </div>
    </div>
  );
}

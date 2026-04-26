import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import type { EarningRule } from "../../lib/loyalty-supabase";
import { normalizeTierLabel, type TierRule } from "../../lib/loyalty-engine";
import { toast } from "sonner";
import { loadTierRulesViaApi, recalculateTiersViaApi, saveTierRulesViaApi } from "../../lib/api";
import { DEFAULT_EARNING_RULES, DEFAULT_TIER_RULES, ensureArray } from "../../lib/defaults";
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

const FALLBACK_RULES: TierRule[] = DEFAULT_TIER_RULES;
const FALLBACK_EARNING_RULES: EarningRule[] = DEFAULT_EARNING_RULES;

export default function AdminSettingsPage() {
  const [rules, setRules] = useState<TierRule[]>(FALLBACK_RULES);
  const [earningRules, setEarningRules] = useState<EarningRule[]>(FALLBACK_EARNING_RULES);
  const [birthdaySettings, setBirthdaySettings] = useState<BirthdayRewardSettings>(DEFAULT_BIRTHDAY_REWARD_SETTINGS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTierRulesViaApi()
      .then((data) => {
        const safeTiers = ensureArray(data.tiers);
        const safeEarningRules = ensureArray(data.earningRules);
        setRules(
          safeTiers.length > 0
            ? safeTiers.map((rule) => ({
                tier_label: rule.tier_label,
                min_points: Number(rule.min_points || 0),
              }))
            : FALLBACK_RULES,
        );
        setEarningRules(
          safeEarningRules.length > 0
            ? safeEarningRules.map((rule) => ({
                tier_label: normalizeTierLabel(rule.tier_label),
                peso_per_point: Number(rule.peso_per_point || 10),
                multiplier: Number(rule.multiplier || 1),
                is_active: rule.is_active !== false,
              }))
            : FALLBACK_EARNING_RULES,
        );
      })
      .catch(() => {
        setRules(FALLBACK_RULES);
        setEarningRules(FALLBACK_EARNING_RULES);
      });

    setBirthdaySettings(loadBirthdayRewardSettings());
  }, []);

  const updateRule = (tierLabel: string, nextValue: number) => {
    setRules((prev) =>
      prev.map((rule) =>
        rule.tier_label.toLowerCase() === tierLabel.toLowerCase()
          ? {
              ...rule,
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
    try {
      setSaving(true);
      const response = await saveTierRulesViaApi({
        tiers: rules.map((rule) => ({
          tier_label: rule.tier_label,
          min_points: Number(rule.min_points || 0),
          is_active: true,
        })),
        earningRules: earningRules.map((rule) => ({
          tier_label: rule.tier_label,
          peso_per_point: Number(rule.peso_per_point || 10),
          multiplier: Number(rule.multiplier || 1),
          is_active: rule.is_active !== false,
        })),
      });
      const recalc = await recalculateTiersViaApi();
      saveBirthdayRewardSettings(birthdaySettings);
      setRules(
        ensureArray(response.tiers).map((rule) => ({
          tier_label: rule.tier_label,
          min_points: Number(rule.min_points || 0),
        })),
      );
      setEarningRules(
        ensureArray(response.earningRules).map((rule) => ({
          tier_label: normalizeTierLabel(rule.tier_label),
          peso_per_point: Number(rule.peso_per_point || 10),
          multiplier: Number(rule.multiplier || 1),
          is_active: rule.is_active !== false,
        })),
      );
      toast.success("Tier rules saved.", {
        description: `${recalc.updatedMembers || 0} member records recalculated.`,
      });
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
          {saving ? "Saving..." : "Save Tier Rules"}
        </button>
        <p className="mt-3 text-xs text-gray-500">
          Saving applies the new thresholds and earning multipliers immediately, then recalculates member tiers in the backend.
        </p>
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

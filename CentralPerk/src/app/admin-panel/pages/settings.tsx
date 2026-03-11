import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { fetchTierRules, saveTierRules } from "../../lib/loyalty-supabase";
import type { TierRule } from "../../lib/loyalty-engine";
import { toast } from "sonner";

const FALLBACK_RULES: TierRule[] = [
  { tier_label: "Bronze", min_points: 0 },
  { tier_label: "Silver", min_points: 250 },
  { tier_label: "Gold", min_points: 750 },
];

export default function AdminSettingsPage() {
  const [rules, setRules] = useState<TierRule[]>(FALLBACK_RULES);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTierRules()
      .then((data) => setRules(data))
      .catch(() => setRules(FALLBACK_RULES));
  }, []);

  const updateRule = (tierLabel: string, nextValue: number) => {
    setRules((prev) =>
      prev.map((rule) =>
        rule.tier_label.toLowerCase() === tierLabel.toLowerCase()
          ? { ...rule, min_points: Math.max(0, Math.floor(nextValue || 0)) }
          : rule
      )
    );
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await saveTierRules(rules);
      toast.success("Tier rules saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save rules.");
    } finally {
      setSaving(false);
    }
  };

  const byTier = (label: string) => rules.find((rule) => rule.tier_label.toLowerCase() === label.toLowerCase());

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">Administrative configuration</p>
      </div>

      <div className="rounded-xl border border-[#9ed8ff] bg-white p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Tier Rules Configuration</h2>
          <p className="text-gray-600 text-sm mt-1">Configure points thresholds used to calculate member tier.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(["Bronze", "Silver", "Gold"] as const).map((tier) => (
            <label key={tier} className="rounded-lg border border-gray-200 p-4 block">
              <p className="text-sm font-semibold text-gray-700 mb-2">{tier} minimum points</p>
              <input
                type="number"
                min={0}
                value={byTier(tier)?.min_points ?? 0}
                onChange={(e) => updateRule(tier, Number(e.target.value))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#00A3AD]/30"
              />
            </label>
          ))}
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-[#00A3AD] hover:bg-[#08939c] text-white px-4 py-2.5 text-sm font-semibold disabled:opacity-70"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : "Save Rules"}
        </button>
      </div>
    </div>
  );
}

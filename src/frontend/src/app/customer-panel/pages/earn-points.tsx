import { useEffect, useMemo, useState } from "react";
import { Check, User, Smartphone, Clipboard, Users, Share2, Star, ShoppingCart, Receipt, FileText } from "lucide-react";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../../../components/ui/dialog";
import { toast } from "sonner";
import { useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "../../types/app-context";
import { normalizeTierLabel } from "../../lib/loyalty-engine";
import { createPurchaseViaApi, loadPurchasesViaApi, loadTasksViaApi, startTaskViaApi, submitTaskViaApi } from "../../lib/api";
import type { EarnOpportunity } from "../../types/loyalty";
import { createDefaultMemberData, ensureArray } from "../../lib/defaults";
import {
  brandNavySolidClass,
  brandNavySolidHoverClass,
  infoPillClass,
  infoTextStrongClass,
} from "../../lib/ui-color-tokens";
import {
  customerEyebrowClass,
  customerPageDescriptionClass,
  customerPageHeroClass,
  customerPageHeroInnerClass,
  customerPanelClass,
  customerPanelSoftClass,
  customerPageTitleClass,
} from "../lib/page-theme";

export default function EarnPoints() {
  const { user, refreshUser, completedTaskIds, setCompletedTaskIds } = useOutletContext<AppOutletContext>();
  const safeUser = createDefaultMemberData(user);
  type EarnTask = EarnOpportunity & { type?: string; memberStatus?: string };

  const [tasks, setTasks] = useState<EarnTask[]>([]);
  const [surveyOpen, setSurveyOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [purchaseAmount, setPurchaseAmount] = useState("");
  const [purchaseCategory, setPurchaseCategory] = useState("beverage");
  const [receiptReference, setReceiptReference] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [purchaseNotes, setPurchaseNotes] = useState("");
  const [surveyRating, setSurveyRating] = useState("5");
  const [surveyFeedback, setSurveyFeedback] = useState("");
  const [recentPurchases, setRecentPurchases] = useState<Array<Record<string, unknown>>>([]);
  const [saving, setSaving] = useState(false);
  const [activeSurveyTaskId, setActiveSurveyTaskId] = useState("survey-feedback");

  const refreshEarnData = async () => {
    const [taskResponse, purchaseResponse] = await Promise.all([
      loadTasksViaApi(safeUser.memberId).catch(() => ({ tasks: [] as Array<Record<string, unknown>> })),
      loadPurchasesViaApi(safeUser.memberId).catch(() => ({ purchases: [] as Array<Record<string, unknown>> })),
    ]);

    const normalizedTasks = ensureArray(taskResponse.tasks).map((row) => ({
        id: String(row.id || ""),
        title: String(row.title || "Task"),
        description: String(row.description || ""),
        points: Number(row.points || 0),
        completed: String(row.memberStatus || "") === "completed" || String(row.memberStatus || "") === "already_claimed",
        icon: String(row.type || "").toLowerCase() === "survey" ? "clipboard" : "star",
        active: String(row.status || "available") === "available",
        type: String(row.type || "task"),
        memberStatus: String(row.memberStatus || "available"),
      }));
    setTasks(normalizedTasks);
    const firstSurveyTask = normalizedTasks.find((task) => task.type === "survey");
    if (firstSurveyTask) {
      setActiveSurveyTaskId(firstSurveyTask.id);
    }
    setRecentPurchases(ensureArray(purchaseResponse.purchases));
  };

  useEffect(() => {
    void refreshEarnData().catch(() => {
      setTasks([]);
      setRecentPurchases([]);
    });
  }, [safeUser.memberId]);

  const completedSet = useMemo(() => new Set(completedTaskIds), [completedTaskIds]);

  const startTask = async (task: EarnTask) => {
    if (task.memberStatus === "already_claimed" || task.memberStatus === "completed") {
      toast.error("This task was already claimed.");
      return;
    }

    try {
      setSaving(true);
      const startResponse = await startTaskViaApi(task.id, { memberId: safeUser.memberId });
      if (startResponse.status === "already_claimed") {
        toast.error("This task was already claimed.");
        await refreshEarnData();
        return;
      }

      if (task.type === "survey") {
        setActiveSurveyTaskId(task.id);
        setSurveyOpen(true);
        toast.success("Survey opened. Submit all required answers to earn points.");
      } else {
        const response = await submitTaskViaApi(task.id, {
          memberId: safeUser.memberId,
          email: safeUser.email,
          title: task.title,
          description: task.description,
          type: task.type || "task",
          points: task.points,
          requiredFields: ["confirmation"],
          answers: { confirmation: "confirmed" },
        });
        setCompletedTaskIds((prev) => [...new Set([...prev, task.id])]);
        await refreshEarnData();
        await refreshUser({ force: true });
        toast.success(`${task.title} completed! +${response.award.pointsAwarded} points`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start task");
    } finally {
      setSaving(false);
    }
  };

  const handleSurveyComplete = async () => {
    try {
      setSaving(true);
      const surveyTask = safeTasks.find((task) => task.id === activeSurveyTaskId) || {
        id: activeSurveyTaskId,
        title: "Customer Experience Survey",
        description: "Answer the quick survey to unlock bonus points.",
        points: 50,
      };
      const response = await submitTaskViaApi(surveyTask.id, {
        memberId: safeUser.memberId,
        email: safeUser.email,
        title: surveyTask.title,
        description: surveyTask.description,
        type: "survey",
        points: surveyTask.points,
        requiredFields: ["rating", "feedback"],
        answers: {
          rating: surveyRating,
          feedback: surveyFeedback.trim(),
        },
      });
      setCompletedTaskIds((prev) => [...new Set([...prev, surveyTask.id])]);
      setSurveyFeedback("");
      setSurveyRating("5");
      setSurveyOpen(false);
      await refreshEarnData();
      await refreshUser({ force: true });
      toast.success(`Survey submitted! +${response.award.pointsAwarded} points`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit survey");
    } finally {
      setSaving(false);
    }
  };

  const handlePurchase = async () => {
    const amount = parseFloat(purchaseAmount);
    if (!(amount > 0)) return;
    if (!receiptReference.trim()) {
      toast.error("Receipt/reference number is required.");
      return;
    }

    try {
      setSaving(true);
      const response = await createPurchaseViaApi({
        memberId: safeUser.memberId,
        email: safeUser.email,
        receiptReference: receiptReference.trim(),
        amount,
        date: purchaseDate,
        category: purchaseCategory,
        notes: purchaseNotes.trim(),
      });

      await refreshEarnData();
      await refreshUser({ force: true });
      toast.success(`Purchase recorded! +${response.award.pointsAwarded} points`, {
        description: `Earned from PHP ${amount.toFixed(2)} ${purchaseCategory} purchase using current tier rules.`,
      });
      setReceiptOpen(false);
      setPurchaseAmount("");
      setPurchaseCategory("beverage");
      setReceiptReference("");
      setPurchaseDate(new Date().toISOString().slice(0, 10));
      setPurchaseNotes("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Purchase failed");
    } finally {
      setSaving(false);
    }
  };

  const purchaseValue = parseFloat(purchaseAmount || "0");
  const [projectedPointsEarned, setProjectedPointsEarned] = useState(0);

  useEffect(() => {
    const multiplier = normalizeTierLabel(safeUser.tier) === "Gold" ? 1.5 : normalizeTierLabel(safeUser.tier) === "Silver" ? 1.25 : 1;
    setProjectedPointsEarned(purchaseValue > 0 ? Math.max(1, Math.floor((purchaseValue / 10) * multiplier)) : 0);
  }, [purchaseValue, safeUser.tier]);

  const safeTasks = ensureArray(tasks);
  const safeRecentPurchases = ensureArray(recentPurchases);
  const projectedPostPurchaseBalance = safeUser.points + projectedPointsEarned;

  const getIcon = (iconName: string) => {
    const icons: Record<string, any> = {
      user: User,
      smartphone: Smartphone,
      clipboard: Clipboard,
      users: Users,
      "share-2": Share2,
      star: Star,
    };
    return icons[iconName] || User;
  };

  return (
    <div className="space-y-6">
      <div className={customerPageHeroClass}>
        <div className={customerPageHeroInnerClass}>
          <div className={customerEyebrowClass}>Points Builder</div>
          <h1 className={customerPageTitleClass}>Earn Points</h1>
          <p className={customerPageDescriptionClass}>Complete tasks, log purchases, and pick up bonus opportunities with the same polished design language used across the portal.</p>
        </div>
      </div>

      <Card className="p-6 bg-gradient-to-br from-[#1A2B47] to-[#1A2B47] text-white border-0">
        <h2 className="text-xl font-bold mb-4">How to Earn Points</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-start gap-3"><div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0"><ShoppingCart className="w-5 h-5" /></div><div><h3 className="font-semibold mb-1">Make Purchases</h3><p className="text-[#d8fbff] text-sm">Earn 1 point for every $1 spent automatically</p></div></div>
          <div className="flex items-start gap-3"><div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0"><Clipboard className="w-5 h-5" /></div><div><h3 className="font-semibold mb-1">Complete Tasks</h3><p className="text-[#d8fbff] text-sm">Surveys, reviews, and more</p></div></div>
          <div className="flex items-start gap-3"><div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0"><Users className="w-5 h-5" /></div><div><h3 className="font-semibold mb-1">Refer Friends</h3><p className="text-[#d8fbff] text-sm">Both get 250 points</p></div></div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className={`${customerPanelSoftClass} cursor-pointer border-[#9ed8ff]/60 bg-[#f7fbff] transition-shadow hover:shadow-lg`} onClick={() => setReceiptOpen(true)}>
          <div className="flex items-center gap-4 mb-4"><div className="w-12 h-12 bg-[#dbeafe] rounded-xl flex items-center justify-center"><Receipt className="w-6 h-6 text-[#2563eb]" /></div><div><h3 className="font-semibold text-gray-900">Record Purchase</h3><p className="text-sm text-gray-500">Earn points instantly</p></div></div>
          <p className="text-sm text-gray-600">Record your purchase and points are saved to database + reflected in all pages.</p>
        </Card>

        <Card
          className={`${customerPanelSoftClass} cursor-pointer border-[#9ed8ff]/60 bg-[#f7fbff] transition-shadow hover:shadow-lg`}
          onClick={() => {
            setActiveSurveyTaskId(safeTasks.find((task) => task.type === "survey")?.id || "survey-feedback");
            setSurveyOpen(true);
          }}
        >
          <div className="flex items-center gap-4 mb-4"><div className="w-12 h-12 bg-[#dbeafe] rounded-xl flex items-center justify-center"><FileText className="w-6 h-6 text-[#2563eb]" /></div><div><h3 className="font-semibold text-gray-900">Complete Survey</h3><p className="text-sm text-gray-500">Quick feedback form</p></div></div>
          <p className="text-sm text-gray-600">Share your experience and earn 50 points.</p>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Available Tasks</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {safeTasks.map((opportunity) => {
            const Icon = getIcon(opportunity.icon);
            const completed = completedSet.has(opportunity.id) || opportunity.completed;
            return (
              <Card key={opportunity.id} className={completed ? "bg-gray-50/60" : "bg-white"}>
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-start gap-4 flex-1">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${completed ? "bg-gray-100" : "bg-[#dbeafe]"}`}>
                        {completed ? <Check className="w-6 h-6 text-gray-400" /> : <Icon className="w-6 h-6 text-[#1A2B47]" />}
                      </div>
                      <div className="flex-1"><h3 className="font-semibold text-gray-900 mb-1">{opportunity.title}</h3><p className="text-sm text-gray-600">{opportunity.description}</p></div>
                    </div>
                    <div className="text-right ml-4"><div className={`inline-flex items-center px-3 py-1 rounded-lg text-sm font-semibold ${completed ? "bg-gray-100 text-gray-600" : infoPillClass}`}>+{opportunity.points}</div></div>
                  </div>
                  {!completed && (
                    <Button
                      className={`w-full ${brandNavySolidClass} ${brandNavySolidHoverClass}`}
                      disabled={saving}
                      onClick={() => startTask(opportunity)}
                    >
                      {opportunity.type === "survey" ? "Open Survey" : "Start Task"}
                    </Button>
                  )}
                  {completed && <div className="flex items-center gap-2 text-sm text-gray-500"><Check className="w-4 h-4" /><span>Completed</span></div>}
                </div>
              </Card>
            );
          })}
        </div>
        {safeTasks.length === 0 && (
          <Card className={`${customerPanelSoftClass} border-dashed border-gray-300`}>
            <p className="text-sm text-gray-600">
              No earn tasks found in database. Add rows to <code>earn_tasks</code> to show task-based earning.
            </p>
          </Card>
        )}
      </div>

      <Card className={customerPanelClass}>
        <h3 className="font-semibold text-gray-900 mb-4">Recent Purchases</h3>
        <div className="space-y-3">
          {safeRecentPurchases.slice(0, 5).map((purchase) => (
            <div key={String(purchase.id || purchase.receiptReference)} className="flex items-center justify-between p-4 rounded-lg bg-gray-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#dbeafe] rounded-lg flex items-center justify-center"><Receipt className="w-5 h-5 text-[#2563eb]" /></div>
                <div>
                  <p className="font-medium text-gray-900">{String(purchase.category || "General")} purchase</p>
                  <p className="text-sm text-gray-500">
                    {new Date(String(purchase.date || purchase.createdAt || Date.now())).toLocaleDateString()} - {String(purchase.receiptReference || "Reference pending")}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold text-[#1A2B47]">+{Number(purchase.pointsAwarded || 0)}</p>
                <p className="text-sm text-gray-500">points earned</p>
              </div>
            </div>
          ))}
          {safeRecentPurchases.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-[#fbfdff] p-4 text-sm text-gray-500">
              No recorded purchases yet. Use Record Purchase to save a validated receipt/reference and earn points.
            </div>
          ) : null}
        </div>
      </Card>

      <Dialog open={surveyOpen} onOpenChange={setSurveyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Quick Feedback Survey</DialogTitle>
            <DialogDescription>Help us improve your experience and earn 50 points</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>How would you rate your recent experience?</Label>
              <div className="mt-2 flex gap-2">
                {[1, 2, 3, 4, 5].map((rating) => (
                  <button
                    key={rating}
                    type="button"
                    onClick={() => setSurveyRating(String(rating))}
                    className={`flex h-12 w-12 items-center justify-center rounded-lg border-2 font-semibold transition-colors ${
                      surveyRating === String(rating)
                        ? "border-[#1A2B47] bg-[#1A2B47] text-white"
                        : "border-gray-200 hover:border-[#1A2B47]"
                    }`}
                  >
                    {rating}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="feedback">What can we improve?</Label>
              <Textarea
                id="feedback"
                placeholder="Share your thoughts..."
                className="mt-2"
                rows={4}
                value={surveyFeedback}
                onChange={(event) => setSurveyFeedback(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSurveyOpen(false)}>Cancel</Button>
            <Button
              className={`${brandNavySolidClass} ${brandNavySolidHoverClass}`}
              onClick={handleSurveyComplete}
              disabled={saving || !surveyFeedback.trim()}
            >
              Submit Survey
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Purchase</DialogTitle>
            <DialogDescription>Enter your purchase amount to earn points automatically (1 point per $1)</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div><Label htmlFor="amount">Purchase Amount (PHP)</Label><Input id="amount" type="number" step="0.01" placeholder="0.00" value={purchaseAmount} onChange={(e) => setPurchaseAmount(e.target.value)} className="mt-2" /></div>
            <div><Label htmlFor="receipt-reference">Receipt / Reference Number</Label><Input id="receipt-reference" placeholder="POS-2026-0001" value={receiptReference} onChange={(e) => setReceiptReference(e.target.value)} className="mt-2" /></div>
            <div><Label htmlFor="purchase-date">Purchase Date</Label><Input id="purchase-date" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className="mt-2" /></div>
            <div>
              <Label htmlFor="purchase-category">Purchase Category</Label>
              <select
                id="purchase-category"
                value={purchaseCategory}
                onChange={(event) => setPurchaseCategory(event.target.value)}
                className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="beverage">Beverage</option>
                <option value="pastry">Pastry</option>
                <option value="food">Food</option>
                <option value="merchandise">Merchandise</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">Active campaigns can use this category to auto-apply bonus points.</p>
            </div>
            <div>
              <Label htmlFor="purchase-notes">Notes (optional)</Label>
              <Textarea id="purchase-notes" rows={3} value={purchaseNotes} onChange={(e) => setPurchaseNotes(e.target.value)} className="mt-2" placeholder="Store branch, cashier note, or manual review context" />
            </div>
            {projectedPointsEarned > 0 && (
              <div className="p-4 rounded-lg bg-[#f5f7fb] border border-[#1A2B47]/30">
                <div className="flex items-center justify-between mb-2"><span className="text-sm text-gray-600">Purchase Amount</span><span className="font-semibold text-gray-900">PHP {purchaseValue.toFixed(2)}</span></div>
                <div className="flex items-center justify-between"><span className="text-sm text-gray-600">Points to Earn</span><span className={`text-lg font-bold ${infoTextStrongClass}`}>+{projectedPointsEarned}</span></div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#1A2B47]/30"><span className="text-sm text-gray-600">Projected Point Balance</span><span className="font-semibold text-gray-900">{projectedPostPurchaseBalance.toLocaleString()}</span></div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiptOpen(false)}>Cancel</Button>
            <Button
              className={`${brandNavySolidClass} ${brandNavySolidHoverClass}`}
              onClick={handlePurchase}
              disabled={saving || !purchaseAmount || parseFloat(purchaseAmount) <= 0 || !receiptReference.trim()}
            >
              Record Purchase
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

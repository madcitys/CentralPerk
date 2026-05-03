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
import { calculateDynamicPurchasePoints, loadEarnTasks } from "../../lib/loyalty-supabase";
import { awardPointsViaApi } from "../../lib/api";
import type { EarnOpportunity } from "../../types/loyalty";
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
  const [tasks, setTasks] = useState<EarnOpportunity[]>([]);
  const [surveyOpen, setSurveyOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [purchaseAmount, setPurchaseAmount] = useState("");
  const [purchaseReference, setPurchaseReference] = useState("");
  const [purchaseCategory, setPurchaseCategory] = useState("beverage");
  const [surveyRating, setSurveyRating] = useState<number | null>(null);
  const [surveyFeedback, setSurveyFeedback] = useState("");
  const [activeTask, setActiveTask] = useState<EarnOpportunity | null>(null);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskRating, setTaskRating] = useState<number | null>(null);
  const [taskProof, setTaskProof] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadEarnTasks()
      .then((rows) => setTasks(rows))
      .catch(() => setTasks([]));
  }, []);

  const completedSet = useMemo(() => new Set(completedTaskIds), [completedTaskIds]);

  const completeTask = async (taskId: string, title: string, points: number, proof?: string) => {
    try {
      setSaving(true);
      await awardPointsViaApi({
        memberIdentifier: user.memberId,
        fallbackEmail: user.email,
        points,
        transactionType: "MANUAL_AWARD",
        reason: `Task completed (${taskId}): ${title}${proof ? ` - ${proof}` : ""}`,
        transactionReference: `TASK-${user.memberId}-${taskId}-${Date.now()}`,
      });

      setCompletedTaskIds((prev) => [...new Set([...prev, taskId])]);
      await refreshUser({ force: true });
      toast.success(`${title} completed! +${points} points`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to complete task");
    } finally {
      setSaving(false);
    }
  };

  const handleSurveyComplete = async () => {
    if (!surveyRating) {
      toast.error("Select a survey rating first.");
      return;
    }
    if (surveyFeedback.trim().length < 10) {
      toast.error("Add at least 10 characters of feedback.");
      return;
    }
    await completeTask("E003", "Survey Completion", 50, `Rating ${surveyRating}/5: ${surveyFeedback.trim()}`);
    setSurveyOpen(false);
    setSurveyRating(null);
    setSurveyFeedback("");
  };

  const handlePurchase = async () => {
    const amount = parseFloat(purchaseAmount);
    const reference = purchaseReference.trim().toUpperCase();
    if (!(amount > 0)) return;
    if (reference.length < 4) {
      toast.error("Enter a valid receipt or order reference before claiming points.");
      return;
    }
    const basePointsEarned = await calculateDynamicPurchasePoints({
      amountSpent: amount,
      tier: normalizeTierLabel(user.tier),
    });

    try {
      setSaving(true);
      const response = await awardPointsViaApi({
        memberIdentifier: user.memberId,
        fallbackEmail: user.email,
        points: basePointsEarned,
        transactionType: "PURCHASE",
        reason: `Verified purchase ${reference} - PHP ${amount.toFixed(2)}`,
        amountSpent: amount,
        productCode: reference,
        productCategory: purchaseCategory,
        transactionReference: reference,
      });

      await refreshUser({ force: true });
      toast.success(`Purchase recorded! +${response.result.pointsAdded} points`, {
        description:
          response.result.bonusPointsAdded > 0
            ? `${response.result.bonusPointsAdded} bonus points applied from active campaigns.`
            : `Earned from PHP ${amount.toFixed(2)} ${purchaseCategory} purchase.`,
      });
      setReceiptOpen(false);
      setPurchaseAmount("");
      setPurchaseReference("");
      setPurchaseCategory("beverage");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Purchase failed");
    } finally {
      setSaving(false);
    }
  };

  const purchaseValue = parseFloat(purchaseAmount || "0");
  const [projectedPointsEarned, setProjectedPointsEarned] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const compute = async () => {
      if (!(purchaseValue > 0)) {
        if (!cancelled) setProjectedPointsEarned(0);
        return;
      }
      try {
        const next = await calculateDynamicPurchasePoints({
          amountSpent: purchaseValue,
          tier: normalizeTierLabel(user.tier),
        });
        if (!cancelled) setProjectedPointsEarned(next);
      } catch {
        if (!cancelled) setProjectedPointsEarned(0);
      }
    };

    compute();
    return () => {
      cancelled = true;
    };
  }, [purchaseValue, user.tier]);

  const projectedPostPurchaseBalance = user.points + projectedPointsEarned;

  const startTask = (opportunity: EarnOpportunity) => {
    setActiveTask(opportunity);
    setTaskRating(null);
    setTaskProof("");
    setTaskDialogOpen(true);
  };

  const closeTaskDialog = () => {
    setTaskDialogOpen(false);
    setActiveTask(null);
    setTaskRating(null);
    setTaskProof("");
  };

  const activeTaskKind = useMemo(() => {
    const title = activeTask?.title.toLowerCase() || "";
    if (title.includes("review")) return "review";
    if (title.includes("survey")) return "survey";
    if (title.includes("social")) return "social";
    if (title.includes("refer")) return "referral";
    return "general";
  }, [activeTask]);

  const submitTaskProof = async () => {
    if (!activeTask) return;
    const proof = taskProof.trim();
    if ((activeTaskKind === "review" || activeTaskKind === "survey") && !taskRating) {
      toast.error("Select a 1-5 rating first.");
      return;
    }
    if ((activeTaskKind === "review" || activeTaskKind === "survey") && proof.length < 10) {
      toast.error("Add at least 10 characters of feedback.");
      return;
    }
    if ((activeTaskKind === "social" || activeTaskKind === "referral" || activeTaskKind === "general") && proof.length < 4) {
      toast.error("Add a short proof or reference before claiming this task.");
      return;
    }

    const proofText =
      activeTaskKind === "review" || activeTaskKind === "survey"
        ? `Rating ${taskRating}/5: ${proof}`
        : proof;
    await completeTask(activeTask.id, activeTask.title, activeTask.points, proofText);
    closeTaskDialog();
  };

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
          <div className="flex items-start gap-3"><div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0"><ShoppingCart className="w-5 h-5" /></div><div><h3 className="font-semibold mb-1">Make Purchases</h3><p className="text-[#d8fbff] text-sm">Earn points only with a valid receipt or order reference</p></div></div>
          <div className="flex items-start gap-3"><div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0"><Clipboard className="w-5 h-5" /></div><div><h3 className="font-semibold mb-1">Complete Tasks</h3><p className="text-[#d8fbff] text-sm">Surveys, reviews, and more</p></div></div>
          <div className="flex items-start gap-3"><div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0"><Users className="w-5 h-5" /></div><div><h3 className="font-semibold mb-1">Refer Friends</h3><p className="text-[#d8fbff] text-sm">Both get 250 points</p></div></div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className={`${customerPanelSoftClass} cursor-pointer border-[#9ed8ff]/60 bg-[#f7fbff] transition-shadow hover:shadow-lg`} onClick={() => setReceiptOpen(true)}>
          <div className="flex items-center gap-4 mb-4"><div className="w-12 h-12 bg-[#dbeafe] rounded-xl flex items-center justify-center"><Receipt className="w-6 h-6 text-[#2563eb]" /></div><div><h3 className="font-semibold text-gray-900">Record Purchase</h3><p className="text-sm text-gray-500">Requires receipt or order reference</p></div></div>
          <p className="text-sm text-gray-600">Claim purchase points only after a real POS order or receipt is available.</p>
        </Card>

        <Card className={`${customerPanelSoftClass} cursor-pointer border-[#9ed8ff]/60 bg-[#f7fbff] transition-shadow hover:shadow-lg`} onClick={() => setSurveyOpen(true)}>
          <div className="flex items-center gap-4 mb-4"><div className="w-12 h-12 bg-[#dbeafe] rounded-xl flex items-center justify-center"><FileText className="w-6 h-6 text-[#2563eb]" /></div><div><h3 className="font-semibold text-gray-900">Complete Survey</h3><p className="text-sm text-gray-500">Quick feedback form</p></div></div>
          <p className="text-sm text-gray-600">Share your experience and earn 50 points.</p>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Available Tasks</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tasks.map((opportunity) => {
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
                      Start Task
                    </Button>
                  )}
                  {completed && <div className="flex items-center gap-2 text-sm text-gray-500"><Check className="w-4 h-4" /><span>Completed</span></div>}
                </div>
              </Card>
            );
          })}
        </div>
        {tasks.length === 0 && (
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
          {user.transactions
            .filter((t) => t.type === "earned" && t.receiptId)
            .slice(0, 5)
            .map((transaction) => (
              <div key={transaction.id} className="flex items-center justify-between p-4 rounded-lg bg-gray-50">
                <div className="flex items-center gap-3"><div className="w-10 h-10 bg-[#dbeafe] rounded-lg flex items-center justify-center"><Receipt className="w-5 h-5 text-[#2563eb]" /></div><div><p className="font-medium text-gray-900">{transaction.description}</p><p className="text-sm text-gray-500">{new Date(transaction.date).toLocaleDateString()} - {transaction.receiptId}</p></div></div>
                <div className="text-right"><p className="font-semibold text-[#1A2B47]">+{transaction.points}</p><p className="text-sm text-gray-500">points earned</p></div>
              </div>
            ))}
        </div>
      </Card>

      <Dialog open={surveyOpen} onOpenChange={setSurveyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Quick Feedback Survey</DialogTitle>
            <DialogDescription>Help us improve your experience and earn 50 points</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div><Label>How would you rate your recent experience?</Label><div className="flex gap-2 mt-2">{[1, 2, 3, 4, 5].map((rating) => (<button key={rating} type="button" onClick={() => setSurveyRating(rating)} className={`w-12 h-12 rounded-lg border-2 transition-colors flex items-center justify-center font-semibold ${surveyRating === rating ? "border-[#1A2B47] bg-[#e9f2f8] text-[#1A2B47]" : "border-gray-200 hover:border-[#1A2B47]"}`}>{rating}</button>))}</div></div>
            <div><Label htmlFor="feedback">What can we improve?</Label><Textarea id="feedback" placeholder="Share your thoughts..." value={surveyFeedback} onChange={(e) => setSurveyFeedback(e.target.value)} className="mt-2" rows={4} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSurveyOpen(false)}>Cancel</Button>
            <Button className={`${brandNavySolidClass} ${brandNavySolidHoverClass}`} onClick={handleSurveyComplete} disabled={saving}>Submit & Earn 50 Points</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Purchase</DialogTitle>
            <DialogDescription>Enter the purchase amount and a receipt/order reference from a real transaction.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div><Label htmlFor="amount">Purchase Amount (PHP)</Label><Input id="amount" type="number" step="0.01" placeholder="0.00" value={purchaseAmount} onChange={(e) => setPurchaseAmount(e.target.value)} className="mt-2" /></div>
            <div><Label htmlFor="receipt-reference">Receipt / Order Reference</Label><Input id="receipt-reference" placeholder="POS-2026-0001" value={purchaseReference} onChange={(e) => setPurchaseReference(e.target.value)} className="mt-2" /><p className="mt-1 text-xs text-gray-500">Use the POS receipt number, order id, or counter claim reference.</p></div>
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
            <Button className={`${brandNavySolidClass} ${brandNavySolidHoverClass}`} onClick={handlePurchase} disabled={saving || !purchaseAmount || parseFloat(purchaseAmount) <= 0 || purchaseReference.trim().length < 4}>Record Purchase</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={taskDialogOpen} onOpenChange={(open) => (open ? setTaskDialogOpen(true) : closeTaskDialog())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{activeTask?.title || "Complete Task"}</DialogTitle>
            <DialogDescription>
              {activeTaskKind === "review"
                ? "Leave a rating and a short review before points are awarded."
                : activeTaskKind === "survey"
                  ? "Answer the task prompt before points are awarded."
                  : activeTaskKind === "social"
                    ? "Add the social handle or post/link you used as proof."
                    : activeTaskKind === "referral"
                      ? "Add the friend's email or referral reference before claiming."
                      : "Add proof or a short reference before points are awarded."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {(activeTaskKind === "review" || activeTaskKind === "survey") ? (
              <div>
                <Label>Rating</Label>
                <div className="mt-2 flex gap-2">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <button
                      key={`task-rating-${rating}`}
                      type="button"
                      onClick={() => setTaskRating(rating)}
                      className={`h-11 w-11 rounded-lg border-2 font-semibold transition-colors ${
                        taskRating === rating ? "border-[#1A2B47] bg-[#e9f2f8] text-[#1A2B47]" : "border-gray-200 hover:border-[#1A2B47]"
                      }`}
                    >
                      {rating}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div>
              <Label htmlFor="task-proof">
                {activeTaskKind === "review" || activeTaskKind === "survey" ? "Comment" : "Proof / Reference"}
              </Label>
              <Textarea
                id="task-proof"
                rows={4}
                value={taskProof}
                onChange={(event) => setTaskProof(event.target.value)}
                placeholder={
                  activeTaskKind === "social"
                    ? "Example: Instagram @yourhandle followed Central Perk"
                    : activeTaskKind === "referral"
                      ? "Example: friend@email.com"
                      : "Write the comment or proof here"
                }
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeTaskDialog}>Cancel</Button>
            <Button className={`${brandNavySolidClass} ${brandNavySolidHoverClass}`} onClick={submitTaskProof} disabled={saving}>
              Submit & Earn {activeTask ? activeTask.points : 0} Points
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Calendar,
  Clock,
  Download,
  Eye,
  FileText,
  Filter,
  Mail,
  QrCode,
  UserCircle,
  WalletCards,
} from "lucide-react";
import { useOutletContext } from "react-router-dom";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Badge } from "../../../components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { CalendarDatePicker } from "../../../components/calendar-date-picker";
import { cn } from "../../../components/ui/utils";
import type { AppOutletContext } from "../../types/app-context";
import type { RedemptionVoucher } from "../../types/voucher";
import { emailStatement, generateStatementData } from "../../lib/statement";
import { toast } from "sonner";
import { loadVoucherViaApi, loadVouchersViaApi } from "../../lib/api";
import { generateVoucherQrDataUrl } from "../../lib/voucher-qr";
import { ensureMemberNotification } from "../../lib/notifications";
import { normalizeRewardDisplayName, normalizeTransactionDescription } from "../../lib/reward-display";

function toLocalInputDate(value: Date): string {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function withVoucherQr(voucher: RedemptionVoucher) {
  const qrValue = voucher.qrValue || voucher.qrTargetUrl;
  if (voucher.qrImageUrl && qrValue) return voucher;
  if (!qrValue) return voucher;

  try {
    const qrImageUrl = await generateVoucherQrDataUrl(qrValue);
    return { ...voucher, qrValue, qrImageUrl };
  } catch {
    return voucher;
  }
}

function findVoucherForTransaction(transactionDescription: string, vouchers: RedemptionVoucher[]) {
  const normalizedDescription = normalizeTransactionDescription(transactionDescription).toLowerCase();
  return vouchers.find((voucher) => normalizedDescription.includes(normalizeRewardDisplayName(voucher.rewardName).toLowerCase())) ?? null;
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatSignedPoints(type: string, points: number) {
  const sign = type === "earned" || type === "pending" ? "+" : "-";
  return `${sign}${Math.abs(points).toLocaleString()}`;
}

function statusLabel(status: RedemptionVoucher["status"]) {
  if (status === "validated") return "Validated";
  if (status === "processing") return "Processing";
  return "Ready to Scan";
}

export default function PointsActivity() {
  const { user, notificationCount = 0, openNotifications } = useOutletContext<AppOutletContext>();
  const [filterType, setFilterType] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("date-desc");
  const [voucherWallet, setVoucherWallet] = useState<RedemptionVoucher[]>([]);
  const [selectedVoucher, setSelectedVoucher] = useState<RedemptionVoucher | null>(null);
  const [transactionsDialogOpen, setTransactionsDialogOpen] = useState(false);
  const [vouchersDialogOpen, setVouchersDialogOpen] = useState(false);
  const [startDate, setStartDate] = useState<string>(() => {
    const start = new Date();
    start.setMonth(start.getMonth() - 1);
    return toLocalInputDate(start);
  });
  const [endDate, setEndDate] = useState<string>(() => toLocalInputDate(new Date()));

  useEffect(() => {
    let active = true;

    const loadWallet = async () => {
      try {
        const response = await loadVouchersViaApi({
          memberId: user.memberId || undefined,
          email: user.email || undefined,
        });
        const hydrated = await Promise.all(response.vouchers.map((voucher) => withVoucherQr(voucher)));
        if (active) setVoucherWallet(hydrated);
      } catch (error) {
        if (!active) return;
        setVoucherWallet([]);
        const message = error instanceof Error ? error.message : "Unable to load vouchers.";
        toast.error(message);
      }
    };

    void loadWallet();

    return () => {
      active = false;
    };
  }, [user.email, user.memberId]);

  const filteredTransactions = useMemo(
    () =>
      [...user.transactions]
        .filter((transaction) => (filterType === "all" ? true : transaction.type === filterType))
        .filter((transaction) => {
          const txDate = new Date(transaction.date).getTime();
          const start = startDate ? new Date(`${startDate}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
          const end = endDate ? new Date(`${endDate}T23:59:59`).getTime() : Number.POSITIVE_INFINITY;
          return txDate >= start && txDate <= end;
        })
        .sort((a, b) => {
          if (sortBy === "date-desc") return new Date(b.date).getTime() - new Date(a.date).getTime();
          if (sortBy === "date-asc") return new Date(a.date).getTime() - new Date(b.date).getTime();
          if (sortBy === "points-desc") return b.points - a.points;
          if (sortBy === "points-asc") return a.points - b.points;
          return 0;
        }),
    [user.transactions, filterType, sortBy, startDate, endDate],
  );

  const totalEarned = user.transactions.filter((transaction) => transaction.type === "earned").reduce((sum, transaction) => sum + transaction.points, 0);
  const totalRedeemed = user.transactions
    .filter((transaction) => transaction.type === "redeemed")
    .reduce((sum, transaction) => sum + Math.abs(transaction.points), 0);
  const readyVouchers = voucherWallet.filter((voucher) => voucher.status !== "validated");
  const visibleVouchers = readyVouchers.slice(0, 4);
  const visibleTransactions = filteredTransactions.slice(0, 4);

  const notifyVoucherAlreadyClaimed = (voucher: RedemptionVoucher) => {
    const memberId = voucher.memberId || user.memberId;
    if (!memberId) return;

    const notificationKey = `voucher-claimed:${memberId}:${voucher.id}`;
    if (typeof window !== "undefined" && window.sessionStorage.getItem(notificationKey)) return;

    void ensureMemberNotification({
      memberId,
      channel: "push",
      subject: "Voucher already claimed",
      message: `${normalizeRewardDisplayName(voucher.rewardName)} has already been validated and marked as claimed.`,
      isTransactional: true,
    })
      .then((result) => {
        if (result.queued && typeof window !== "undefined") {
          window.sessionStorage.setItem(notificationKey, "1");
        }
      })
      .catch(() => undefined);
  };

  const openVoucherPopup = async (voucher: RedemptionVoucher) => {
    try {
      const latest = await loadVoucherViaApi(voucher.id)
        .then((response) => response.voucher)
        .catch(() => voucher);
      const hydrated = await withVoucherQr(latest);

      setVoucherWallet((current) => [hydrated, ...current.filter((item) => item.id !== hydrated.id)]);

      if (hydrated.status === "validated") {
        setSelectedVoucher(null);
        notifyVoucherAlreadyClaimed(hydrated);
        toast.info("Voucher already claimed.", {
          description: `${normalizeRewardDisplayName(hydrated.rewardName)} was already validated.`,
        });
        return;
      }

      setSelectedVoucher(hydrated);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to open voucher.");
    }
  };

  const downloadCsv = async () => {
    try {
      const statement = await generateStatementData({
        memberId: user.memberId,
        memberEmail: user.email,
        startDate,
        endDate,
      });
      const rows = [
        "Date,Type,Points,Reason,Expiry Date",
        ...statement.rows.map((item) => {
          const date = new Date(item.date).toLocaleDateString();
          const reason = `"${String(item.reason || "").replaceAll('"', '""')}"`;
          const expiry = item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : "";
          return `${date},${item.type},${item.points},${reason},${expiry}`;
        }),
      ];
      const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `points-statement-${user.memberId}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("CSV downloaded successfully.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to download CSV.");
    }
  };

  const buildStatementHtml = async () => {
    const statement = await generateStatementData({
      memberId: user.memberId,
      memberEmail: user.email,
      startDate,
      endDate,
    });
    const htmlRows = statement.rows
      .map((item) => {
        const date = new Date(item.date).toLocaleDateString();
        const expiry = item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : "-";
        return `<tr><td>${date}</td><td>${item.type}</td><td>${item.points}</td><td>${item.reason || ""}</td><td>${expiry}</td></tr>`;
      })
      .join("");

    return {
      statement,
      html: `
      <html>
        <head>
          <title>GREENOVATE Loyalty Statement</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
            .brand { display:flex; justify-content:space-between; align-items:center; background:#071b2f; color:#fff; padding:12px 16px; border-radius:8px; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 12px; }
            th { background: #f3f4f6; }
          </style>
        </head>
        <body>
          <div class="brand"><strong>GREENOVATE Loyalty</strong><span>Statement</span></div>
          <p>Member: ${user.fullName} (${user.memberId})</p>
          <p>Period: ${startDate} to ${endDate}</p>
          <p>Tier: ${statement.tier} | Opening Balance: ${statement.openingBalance} | Closing Balance: ${statement.closingBalance}</p>
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Type</th><th>Points</th><th>Reason</th><th>Expiry Date</th>
              </tr>
            </thead>
            <tbody>${htmlRows}</tbody>
          </table>
        </body>
      </html>
    `,
    };
  };

  const downloadPdf = async () => {
    try {
      const { html } = await buildStatementHtml();
      const win = window.open("", "_blank", "width=900,height=700");
      if (!win) throw new Error("Popup blocked. Allow popups to print your PDF.");
      win.document.write(html);
      win.document.close();
      win.focus();
      win.print();
      toast.success("PDF ready. Print dialog opened.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate PDF.");
    }
  };

  const handleEmailStatement = async () => {
    try {
      const { html } = await buildStatementHtml();
      const pdfBlob = new Blob([html], { type: "application/pdf" });
      await emailStatement(user.memberId, pdfBlob);
      toast.success("Statement queued for email delivery.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to email statement.");
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f2fbf8_0%,#f7fafc_48%,#edf8f4_100%)] px-4 py-5 text-[#0f172a] sm:px-5 lg:px-6">
      <div className="mx-auto max-w-[1180px] space-y-4">
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={openNotifications}
            aria-label="Notifications"
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#dde7f1] bg-white text-[#0f172a] shadow-[0_8px_20px_rgba(15,23,42,0.05)]"
          >
            <Bell className="h-4 w-4" />
            {notificationCount > 0 ? (
              <span className="absolute right-1.5 top-1.5 h-4 min-w-4 rounded-full bg-[#008c80] px-1 text-center text-[9px] font-black leading-4 text-white">
                {Math.min(notificationCount, 9)}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            aria-label="Profile"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#dde7f1] bg-white text-[#0f172a] shadow-[0_8px_20px_rgba(15,23,42,0.05)]"
          >
            <UserCircle className="h-4 w-4" />
          </button>
        </div>

        <Card className="gap-0 rounded-[16px] border border-[#bfe9e4] bg-[linear-gradient(135deg,#ffffff_0%,#f4fffb_100%)] p-5 shadow-[0_12px_28px_rgba(0,96,86,0.07)]">
          <span className="w-fit rounded-full border border-[#9ddbd4] bg-white/90 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-[#007f78]">
            Points Timeline
          </span>
          <h1 className="mt-3 text-[30px] font-black leading-tight tracking-normal text-[#071a35]">Points Activity</h1>
          <p className="mt-2 max-w-3xl text-[14px] font-medium leading-6 text-[#64748b]">
            View and track all your points transactions with the same softer, more cohesive layout used across the member portal.
          </p>
        </Card>

        <Card className="gap-0 rounded-[18px] border border-[#e2e8f0] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
          <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-end">
            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className="mb-2 block text-[12px] font-bold text-[#64748b]">Start Date</span>
                <CalendarDatePicker
                  id="points-activity-start-date"
                  value={startDate}
                  onChange={setStartDate}
                  triggerClassName="!h-11 rounded-xl border-[#d9e3ee] bg-white text-[13px] shadow-none"
                />
              </label>
              <label>
                <span className="mb-2 block text-[12px] font-bold text-[#64748b]">End Date</span>
                <CalendarDatePicker
                  id="points-activity-end-date"
                  value={endDate}
                  onChange={setEndDate}
                  triggerClassName="!h-11 rounded-xl border-[#d9e3ee] bg-white text-[13px] shadow-none"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={downloadCsv}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#d9e3ee] bg-white px-5 text-[13px] font-black text-[#0f172a] transition hover:border-[#b7c7d8] hover:bg-[#f8fafc]"
              >
                <Download className="h-4 w-4" />
                Download CSV
              </button>
              <button
                type="button"
                onClick={downloadPdf}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#008c80,#00756f)] px-5 text-[13px] font-black text-white shadow-[0_12px_24px_rgba(0,140,128,0.22)] transition hover:brightness-105"
              >
                <FileText className="h-4 w-4" />
                Download PDF
              </button>
              <button
                type="button"
                onClick={handleEmailStatement}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#d9e3ee] bg-white px-5 text-[13px] font-black text-[#0f172a] transition hover:border-[#b7c7d8] hover:bg-[#f8fafc]"
              >
                <Mail className="h-4 w-4" />
                Email Statement
              </button>
            </div>
          </div>
        </Card>

        <section className="grid gap-4 md:grid-cols-3">
          <Card className="gap-0 rounded-[18px] border border-[#e2e8f0] bg-white p-6 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <div className="flex items-center gap-5">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e7f8ef] text-[#16a34a]">
                <ArrowUpRight className="h-7 w-7" />
              </span>
              <div>
                <p className="text-[13px] font-bold text-[#64748b]">Total Earned</p>
                <p className="mt-1 text-[26px] font-black text-[#16a34a]">+{totalEarned.toLocaleString()}</p>
              </div>
            </div>
          </Card>
          <Card className="gap-0 rounded-[18px] border border-[#e2e8f0] bg-white p-6 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <div className="flex items-center gap-5">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff0e5] text-[#f15b2a]">
                <ArrowDownRight className="h-7 w-7" />
              </span>
              <div>
                <p className="text-[13px] font-bold text-[#64748b]">Total Redeemed</p>
                <p className="mt-1 text-[26px] font-black text-[#f15b2a]">-{totalRedeemed.toLocaleString()}</p>
              </div>
            </div>
          </Card>
          <Card className="gap-0 rounded-[18px] border border-[#e2e8f0] bg-white p-6 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <div className="flex items-center gap-5">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e9f2ff] text-[#2563eb]">
                <Clock className="h-7 w-7" />
              </span>
              <div>
                <p className="text-[13px] font-bold text-[#64748b]">Pending Points</p>
                <p className="mt-1 text-[26px] font-black text-[#2563eb]">{user.pendingPoints.toLocaleString()}</p>
              </div>
            </div>
          </Card>
        </section>

        <Card className="gap-0 rounded-[18px] border border-[#e2e8f0] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 flex items-center gap-2 text-[12px] font-bold text-[#64748b]">
                <Filter className="h-4 w-4 text-[#008c80]" />
                Filter by Type
              </label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="h-11 rounded-xl border-[#d9e3ee] bg-white text-[13px] font-bold text-[#0f172a] focus:border-[#008c80] focus:ring-[#008c80]/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Transactions</SelectItem>
                  <SelectItem value="earned">Earned Only</SelectItem>
                  <SelectItem value="redeemed">Redeemed Only</SelectItem>
                  <SelectItem value="pending">Pending Only</SelectItem>
                  <SelectItem value="gifted">Gifted Only</SelectItem>
                  <SelectItem value="expired">Expired Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-2 flex items-center gap-2 text-[12px] font-bold text-[#64748b]">
                <Calendar className="h-4 w-4 text-[#008c80]" />
                Sort by
              </label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="h-11 rounded-xl border-[#d9e3ee] bg-white text-[13px] font-bold text-[#0f172a] focus:border-[#008c80] focus:ring-[#008c80]/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date-desc">Newest First</SelectItem>
                  <SelectItem value="date-asc">Oldest First</SelectItem>
                  <SelectItem value="points-desc">Highest Points</SelectItem>
                  <SelectItem value="points-asc">Lowest Points</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        <Card className="gap-0 rounded-[18px] border border-[#e2e8f0] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <WalletCards className="h-5 w-5 text-[#008c80]" />
                <h2 className="text-[17px] font-black text-[#0f172a]">Reward Vouchers</h2>
              </div>
              <p className="mt-1 text-[13px] font-medium text-[#64748b]">Click a voucher to open its scannable QR. Newly redeemed rewards appear here.</p>
            </div>
            <div className="flex items-center gap-4">
              <Badge className="rounded-full bg-[#071b2f] px-3 py-1 text-[11px] font-black text-white">{voucherWallet.length} saved</Badge>
              <button
                type="button"
                onClick={() => setVouchersDialogOpen(true)}
                className="inline-flex items-center gap-2 text-[12px] font-black text-[#007f78]"
              >
                View all vouchers
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {visibleVouchers.length > 0 ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {visibleVouchers.map((voucher) => (
                <button
                  key={voucher.id}
                  type="button"
                  onClick={() => void openVoucherPopup(voucher)}
                  className="grid min-h-[66px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-xl border border-[#dce6f0] bg-white px-4 py-3 text-left transition hover:border-[#008c80]/55 hover:bg-[#f7fbfa]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-black text-[#10213a]">{normalizeRewardDisplayName(voucher.rewardName)}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-3">
                      <span className="font-mono text-[11px] font-bold text-[#64748b]">{voucher.voucherCode}</span>
                      <span className="rounded-full bg-[#dff6ed] px-2.5 py-0.5 text-[10px] font-black text-[#008c62]">{statusLabel(voucher.status)}</span>
                    </span>
                  </span>
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#071b2f] text-white">
                    <QrCode className="h-5 w-5" />
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-[#cbd8e5] bg-[#f8fafc] px-4 py-5 text-[13px] font-medium text-[#64748b]">
              No saved reward vouchers yet. Redeemed vouchers will appear here for QR scanning.
            </div>
          )}
        </Card>

        <Card className="gap-0 rounded-[18px] border border-[#e2e8f0] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-[#008c80]" />
              <h2 className="text-[17px] font-black text-[#0f172a]">Transaction History</h2>
            </div>
            <button
              type="button"
              onClick={() => setTransactionsDialogOpen(true)}
              className="hidden items-center gap-2 text-[12px] font-black text-[#007f78] sm:inline-flex"
            >
              View all {filteredTransactions.length} transactions
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[980px]">
              <div className="grid grid-cols-[minmax(320px,1.65fr)_120px_110px_100px_110px_170px] border-b border-[#e7edf4] px-4 pb-3 text-[10px] font-black uppercase tracking-[0.16em] text-[#64748b]">
                <span>Transaction</span>
                <span>Date</span>
                <span>Source</span>
                <span>QR</span>
                <span className="text-right">Amount</span>
                <span className="text-right">Status & Balance</span>
              </div>

              {visibleTransactions.length > 0 ? (
                visibleTransactions.map((transaction) => {
                  const isRedeem = transaction.type === "redeemed";
                  const linkedVoucher = isRedeem ? findVoucherForTransaction(transaction.description, voucherWallet) : null;
                  return (
                    <div
                      key={transaction.id}
                      className="grid min-h-[64px] grid-cols-[minmax(320px,1.65fr)_120px_110px_100px_110px_170px] items-center border-b border-[#edf1f5] px-4 py-3 text-[12px] last:border-b-0"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className={cn(
                            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                            isRedeem ? "bg-[#fff0e5] text-[#f15b2a]" : "bg-[#e7f8ef] text-[#16a34a]",
                          )}
                        >
                          {isRedeem ? <ArrowDownRight className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                        </span>
                        <span className="truncate font-black text-[#0f172a]">{normalizeTransactionDescription(transaction.description)}</span>
                      </div>
                      <span className="font-semibold text-[#64748b]">{formatDate(transaction.date)}</span>
                      <span>
                        <Badge variant="outline" className="rounded-full border-[#d9e3ee] bg-white px-3 text-[11px] font-black text-[#0f172a]">
                          {transaction.category || transaction.receiptId || "System"}
                        </Badge>
                      </span>
                      <span>
                        {linkedVoucher ? (
                          <button
                            type="button"
                            onClick={() => void openVoucherPopup(linkedVoucher)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-[#b9d9d4] bg-[#f1fbf9] px-3 py-1 text-[11px] font-black text-[#007f78] hover:bg-[#e5f7f4]"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View QR
                          </button>
                        ) : (
                          <span className="text-[12px] font-semibold text-[#94a3b8]">None</span>
                        )}
                      </span>
                      <span className={cn("text-right text-[14px] font-black", isRedeem ? "text-[#f15b2a]" : "text-[#059669]")}>
                        {formatSignedPoints(transaction.type, transaction.points)}
                      </span>
                      <span className="text-right">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black",
                            isRedeem ? "bg-[#fff0e5] text-[#f15b2a]" : "bg-[#e7f8ef] text-[#059669]",
                          )}
                        >
                          {isRedeem ? "Redeemed" : transaction.type === "earned" ? "Earned" : transaction.type}
                        </span>
                        <span className="mt-1 block text-[11px] font-medium text-[#64748b]">Balance after: {transaction.balance.toLocaleString()}</span>
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-xl border border-dashed border-[#cbd8e5] bg-[#f8fafc] px-4 py-8 text-center text-[13px] font-medium text-[#64748b]">
                  No transactions found for the selected filters.
                </div>
              )}
            </div>
          </div>

          {filteredTransactions.length > 4 ? (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setTransactionsDialogOpen(true)}
                className="inline-flex items-center gap-2 text-[13px] font-black text-[#007f78]"
              >
                View all {filteredTransactions.length} transactions
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </Card>
      </div>

      <Dialog open={vouchersDialogOpen} onOpenChange={setVouchersDialogOpen}>
        <DialogContent className="sm:max-w-[760px] rounded-2xl border border-[#dfe7f0] bg-white p-0 shadow-2xl">
          <DialogHeader className="border-b border-[#edf1f5] px-6 pb-4 pt-6">
            <DialogTitle className="text-xl font-black text-[#10213a]">Reward Vouchers</DialogTitle>
            <DialogDescription className="text-sm text-[#64748b]">Select a saved voucher to open its scannable QR code.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto p-6">
            {voucherWallet.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {voucherWallet.map((voucher) => (
                  <button
                    key={voucher.id}
                    type="button"
                    onClick={() => {
                      setVouchersDialogOpen(false);
                      void openVoucherPopup(voucher);
                    }}
                    className="grid min-h-[72px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-xl border border-[#dce6f0] bg-white px-4 py-3 text-left transition hover:border-[#008c80]/55 hover:bg-[#f7fbfa]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-black text-[#10213a]">{normalizeRewardDisplayName(voucher.rewardName)}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-3">
                        <span className="font-mono text-[11px] font-bold text-[#64748b]">{voucher.voucherCode}</span>
                        <span className="rounded-full bg-[#dff6ed] px-2.5 py-0.5 text-[10px] font-black text-[#008c62]">{statusLabel(voucher.status)}</span>
                      </span>
                    </span>
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#071b2f] text-white">
                      <QrCode className="h-5 w-5" />
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[#cbd8e5] bg-[#f8fafc] px-4 py-8 text-center text-[13px] font-medium text-[#64748b]">
                No saved reward vouchers yet.
              </div>
            )}
          </div>
          <DialogFooter className="border-t border-[#edf1f5] px-6 py-4">
            <Button variant="outline" onClick={() => setVouchersDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transactionsDialogOpen} onOpenChange={setTransactionsDialogOpen}>
        <DialogContent className="sm:max-w-[980px] rounded-2xl border border-[#dfe7f0] bg-white p-0 shadow-2xl">
          <DialogHeader className="border-b border-[#edf1f5] px-6 pb-4 pt-6">
            <DialogTitle className="text-xl font-black text-[#10213a]">All Transactions</DialogTitle>
            <DialogDescription className="text-sm text-[#64748b]">Review the full filtered transaction list without leaving this page.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[64vh] overflow-y-auto p-6">
            <div className="overflow-x-auto">
              <div className="min-w-[900px]">
                <div className="grid grid-cols-[minmax(320px,1.5fr)_120px_110px_100px_110px_170px] border-b border-[#e7edf4] px-4 pb-3 text-[10px] font-black uppercase tracking-[0.16em] text-[#64748b]">
                  <span>Transaction</span>
                  <span>Date</span>
                  <span>Source</span>
                  <span>QR</span>
                  <span className="text-right">Amount</span>
                  <span className="text-right">Status & Balance</span>
                </div>
                {filteredTransactions.map((transaction) => {
                  const isRedeem = transaction.type === "redeemed";
                  const linkedVoucher = isRedeem ? findVoucherForTransaction(transaction.description, voucherWallet) : null;
                  return (
                    <div
                      key={`modal-${transaction.id}`}
                      className="grid min-h-[62px] grid-cols-[minmax(320px,1.5fr)_120px_110px_100px_110px_170px] items-center border-b border-[#edf1f5] px-4 py-3 text-[12px] last:border-b-0"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", isRedeem ? "bg-[#fff0e5] text-[#f15b2a]" : "bg-[#e7f8ef] text-[#16a34a]")}>
                          {isRedeem ? <ArrowDownRight className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                        </span>
                        <span className="truncate font-black text-[#0f172a]">{normalizeTransactionDescription(transaction.description)}</span>
                      </div>
                      <span className="font-semibold text-[#64748b]">{formatDate(transaction.date)}</span>
                      <span>
                        <Badge variant="outline" className="rounded-full border-[#d9e3ee] bg-white px-3 text-[11px] font-black text-[#0f172a]">
                          {transaction.category || transaction.receiptId || "System"}
                        </Badge>
                      </span>
                      <span>
                        {linkedVoucher ? (
                          <button
                            type="button"
                            onClick={() => {
                              setTransactionsDialogOpen(false);
                              void openVoucherPopup(linkedVoucher);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-full border border-[#b9d9d4] bg-[#f1fbf9] px-3 py-1 text-[11px] font-black text-[#007f78] hover:bg-[#e5f7f4]"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View QR
                          </button>
                        ) : (
                          <span className="text-[12px] font-semibold text-[#94a3b8]">None</span>
                        )}
                      </span>
                      <span className={cn("text-right text-[14px] font-black", isRedeem ? "text-[#f15b2a]" : "text-[#059669]")}>
                        {formatSignedPoints(transaction.type, transaction.points)}
                      </span>
                      <span className="text-right">
                        <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black", isRedeem ? "bg-[#fff0e5] text-[#f15b2a]" : "bg-[#e7f8ef] text-[#059669]")}>
                          {isRedeem ? "Redeemed" : transaction.type === "earned" ? "Earned" : transaction.type}
                        </span>
                        <span className="mt-1 block text-[11px] font-medium text-[#64748b]">Balance after: {transaction.balance.toLocaleString()}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter className="border-t border-[#edf1f5] px-6 py-4">
            <Button variant="outline" onClick={() => setTransactionsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedVoucher)} onOpenChange={(open) => !open && setSelectedVoucher(null)}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-[720px] rounded-2xl border border-[#dfe7f0] bg-white p-0 shadow-2xl">
          <DialogHeader className="border-b border-[#edf1f5] px-6 pb-4 pt-6">
            <DialogTitle className="text-xl font-black text-[#10213a]">Scannable Reward Voucher</DialogTitle>
            <DialogDescription className="text-sm text-[#64748b]">Show this QR at the counter or open the validation page for staff review.</DialogDescription>
          </DialogHeader>
          {selectedVoucher ? (
            <div className="grid gap-5 p-6 md:grid-cols-[0.86fr_1.14fr]">
              <div className="rounded-2xl bg-[#10213a] p-5 text-center text-white">
                <div className="rounded-2xl bg-white p-4">
                  {selectedVoucher.qrImageUrl ? (
                    <img src={selectedVoucher.qrImageUrl} alt={`QR for ${normalizeRewardDisplayName(selectedVoucher.rewardName)}`} className="mx-auto h-56 w-56 object-contain" />
                  ) : (
                    <div className="mx-auto flex h-56 w-56 items-center justify-center text-[#10213a]">
                      <QrCode className="h-16 w-16" />
                    </div>
                  )}
                </div>
                <p className="mt-4 text-lg font-black">{selectedVoucher.voucherCode}</p>
                <p className="mt-1 text-xs text-white/70">Order {selectedVoucher.orderId}</p>
              </div>
              <div className="space-y-4">
                <div>
                  <Badge className="bg-[#e6f7f4] text-[#007f78]">Voucher details</Badge>
                  <h3 className="mt-3 text-2xl font-black text-[#10213a]">{normalizeRewardDisplayName(selectedVoucher.rewardName)}</h3>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-[#f7fafc] p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-[#64748b]">Method</p>
                    <p className="mt-2 font-semibold text-[#10213a]">{selectedVoucher.method === "in-store" ? "In-store pickup" : "Delivery"}</p>
                  </div>
                  <div className="rounded-2xl bg-[#f7fafc] p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-[#64748b]">Points</p>
                    <p className="mt-2 font-semibold text-[#10213a]">{selectedVoucher.pointsCost.toLocaleString()} pts</p>
                  </div>
                </div>
                {selectedVoucher.deliveryAddress ? (
                  <div className="rounded-2xl border border-[#dce7f2] p-4">
                    <p className="font-semibold text-[#10213a]">Delivery details</p>
                    <p className="mt-1 text-sm leading-6 text-[#64748b]">{selectedVoucher.deliveryAddress}</p>
                    {selectedVoucher.contactNumber ? <p className="mt-1 text-xs text-[#64748b]">Contact: {selectedVoucher.contactNumber}</p> : null}
                  </div>
                ) : null}
                <a
                  href={selectedVoucher.qrTargetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-[#10213a] px-5 text-sm font-bold text-white hover:bg-[#173555]"
                >
                  Open validation page
                </a>
              </div>
            </div>
          ) : null}
          <DialogFooter className="border-t border-[#edf1f5] px-6 py-4">
            <Button variant="outline" onClick={() => setSelectedVoucher(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

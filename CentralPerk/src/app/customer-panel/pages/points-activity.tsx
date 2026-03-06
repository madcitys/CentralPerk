import { useMemo, useState } from "react";
import { ArrowUpRight, ArrowDownRight, Clock, Gift, Filter, Calendar, XCircle, Download } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Badge } from "../../components/ui/badge";
import type { AppOutletContext } from "../../types/app-context";
import { loadMemberActivity } from "../../lib/loyalty-supabase";

export default function PointsActivity() {
  const { user } = useOutletContext<AppOutletContext>();
  const [filterType, setFilterType] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("date-desc");

  const filteredTransactions = useMemo(
    () =>
      [...user.transactions]
        .filter((t) => (filterType === "all" ? true : t.type === filterType))
        .sort((a, b) => {
          if (sortBy === "date-desc") return new Date(b.date).getTime() - new Date(a.date).getTime();
          if (sortBy === "date-asc") return new Date(a.date).getTime() - new Date(b.date).getTime();
          if (sortBy === "points-desc") return b.points - a.points;
          if (sortBy === "points-asc") return a.points - b.points;
          return 0;
        }),
    [user.transactions, filterType, sortBy]
  );

  const totalEarned = user.transactions.filter((t) => t.type === "earned").reduce((sum, t) => sum + t.points, 0);
  const totalRedeemed = user.transactions.filter((t) => t.type === "redeemed").reduce((sum, t) => sum + t.points, 0);

  const getTypeColor = (type: string) => {
    switch (type) {
      case "earned":
        return "bg-green-50 text-green-700 border-green-200";
      case "pending":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "redeemed":
        return "bg-orange-50 text-orange-700 border-orange-200";
      case "gifted":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "expired":
        return "bg-gray-100 text-gray-700 border-gray-200";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "earned":
        return <ArrowUpRight className="w-5 h-5" />;
      case "pending":
        return <Clock className="w-5 h-5" />;
      case "redeemed":
        return <ArrowDownRight className="w-5 h-5" />;
      case "gifted":
        return <Gift className="w-5 h-5" />;
      case "expired":
        return <XCircle className="w-5 h-5" />;
      default:
        return <ArrowUpRight className="w-5 h-5" />;
    }
  };

  const iconBgClass = (type: string) => {
    switch (type) {
      case "earned":
        return "bg-green-100 text-green-600";
      case "pending":
        return "bg-blue-100 text-blue-600";
      case "redeemed":
        return "bg-orange-100 text-orange-500";
      case "gifted":
        return "bg-purple-100 text-purple-600";
      case "expired":
        return "bg-gray-100 text-gray-500";
      default:
        return "bg-gray-100 text-gray-500";
    }
  };

  const pointsClass = (type: string) => {
    switch (type) {
      case "earned":
        return "text-green-600";
      case "pending":
        return "text-blue-600";
      case "redeemed":
        return "text-orange-600";
      case "gifted":
        return "text-purple-600";
      case "expired":
        return "text-gray-600";
      default:
        return "text-[#1A2B47]";
    }
  };

  const downloadCsv = async () => {
    const activity = await loadMemberActivity(user.memberId, user.email);
    const rows = [
      "Date,Type,Points,Reason,Expiry Date",
      ...activity.history.map((item) => {
        const date = new Date(item.date).toLocaleDateString();
        const reason = `"${String(item.reason || "").replaceAll('"', '""')}"`;
        const expiry = item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : "";
        return `${date},${item.type},${item.points},${reason},${expiry}`;
      }),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `points-statement-${user.memberId}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = async () => {
    const activity = await loadMemberActivity(user.memberId, user.email);
    const htmlRows = activity.history
      .map((item) => {
        const date = new Date(item.date).toLocaleDateString();
        const expiry = item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : "-";
        return `<tr><td>${date}</td><td>${item.type}</td><td>${item.points}</td><td>${item.reason || ""}</td><td>${expiry}</td></tr>`;
      })
      .join("");

    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>Points Statement</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
            h1 { margin: 0 0 8px; }
            p { margin: 4px 0 16px; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 12px; }
            th { background: #f3f4f6; }
          </style>
        </head>
        <body>
          <h1>Loyalty Points Statement</h1>
          <p>Member: ${user.fullName} (${user.memberId})</p>
          <p>Tier: ${activity.balance.tier} | Current Balance: ${activity.balance.points_balance}</p>
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
    `);
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Points Activity</h1>
        <p className="text-gray-500 mt-1">View and track all your points transactions</p>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" onClick={downloadCsv}>
            <Download className="w-4 h-4 mr-2" />
            Download CSV
          </Button>
          <Button className="bg-[#1A2B47] hover:bg-[#23385a] text-white" onClick={downloadPdf}>
            <Download className="w-4 h-4 mr-2" />
            Download PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Earned</p>
              <p className="text-2xl font-bold text-green-600 mt-1">+{totalEarned.toLocaleString()}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <ArrowUpRight className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Redeemed</p>
              <p className="text-2xl font-bold text-orange-600 mt-1">-{totalRedeemed.toLocaleString()}</p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
              <ArrowDownRight className="w-6 h-6 text-orange-500" />
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pending Points</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{user.pendingPoints.toLocaleString()}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <Clock className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Filter by Type
            </label>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full border-[#00A3AD]/60 focus-visible:border-[#00A3AD] focus-visible:ring-[#00A3AD]/25">
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
          <div className="flex-1">
            <label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Sort by
            </label>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full border-[#00A3AD]/60 focus-visible:border-[#00A3AD] focus-visible:ring-[#00A3AD]/25">
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

        {filterType !== "all" && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <Button variant="ghost" size="sm" onClick={() => setFilterType("all")} className="text-[#1A2B47]">
              Clear Filters
            </Button>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center justify-between">
          <span>Transaction History</span>
          <Badge variant="secondary">{filteredTransactions.length} transactions</Badge>
        </h3>
        <div className="space-y-3">
          {filteredTransactions.map((transaction) => (
            <div key={transaction.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-200 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4 flex-1">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${iconBgClass(transaction.type)}`}>
                  {getTypeIcon(transaction.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{transaction.description}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-sm text-gray-500">
                      {new Date(transaction.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                    {transaction.category && (
                      <>
                        <span className="text-gray-400">•</span>
                        <Badge variant="outline" className="text-xs">{transaction.category}</Badge>
                      </>
                    )}
                    {transaction.receiptId && (
                      <>
                        <span className="text-gray-400">•</span>
                        <span className="text-xs text-gray-500 font-mono">{transaction.receiptId}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right ml-4">
                <p className={`text-lg font-bold ${pointsClass(transaction.type)}`}>
                  {transaction.type === "earned" || transaction.type === "pending" ? "+" : "-"}
                  {transaction.points}
                </p>
                <Badge className={getTypeColor(transaction.type)} variant="outline">
                  {transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)}
                </Badge>
              </div>
            </div>
          ))}
        </div>

        {filteredTransactions.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Filter className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">No transactions found</h3>
            <p className="text-gray-500 text-sm">Try adjusting your filters to see more results</p>
          </div>
        )}
      </Card>
    </div>
  );
}

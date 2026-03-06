import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useAdminData } from "../hooks/use-admin-data";

export default function AdminRewardsPage() {
  const { loading, error, metrics } = useAdminData();

  if (loading) return <p className="text-base text-gray-700">Loading rewards data...</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  const total =
    metrics.tierDistribution.gold +
    metrics.tierDistribution.silver +
    metrics.tierDistribution.bronze;
  const chartData = [
    { name: "Gold", value: metrics.tierDistribution.gold, color: "#f59e0b" },
    { name: "Silver", value: metrics.tierDistribution.silver, color: "#64748b" },
    { name: "Bronze", value: metrics.tierDistribution.bronze, color: "#f97316" },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Rewards & Tier Distribution</h1>
        <p className="text-gray-500 mt-1">Monitor reward liabilities and member tiers</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-[#e6f8fa] to-white rounded-xl p-6 border border-[#7fd7de]">
          <h3 className="text-gray-600 text-sm font-medium mb-1">Points Liability</h3>
          <p className="text-3xl font-bold text-gray-800">{metrics.pointsLiability.toLocaleString()}</p>
        </div>
        <div className="bg-gradient-to-br from-[#fff7ed] to-white rounded-xl p-6 border border-[#f7c58b]">
          <h3 className="text-gray-600 text-sm font-medium mb-1">Total Points Redeemed</h3>
          <p className="text-3xl font-bold text-gray-800">{metrics.totalPointsRedeemed.toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 border border-[#d7c2ff]">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Tier Breakdown</h2>
        {total === 0 ? (
          <p className="text-gray-500">No members yet.</p>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="value" cx="50%" cy="50%" outerRadius={100}>
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [`${value} members`, ""]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}


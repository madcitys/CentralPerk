import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAdminData } from "../hooks/use-admin-data";
import { MemberLookup } from "../../../components/member-lookup";
import { awardMemberPoints } from "../../lib/loyalty-supabase";
import { toast } from "sonner";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import {
  buildSegmentStats,
  createCustomSegment,
  deleteCustomSegment,
  exportMembersCsv,
  fetchAllSegments,
  fetchSegmentAssignments,
  saveManualSegment,
  SYSTEM_MEMBER_SEGMENTS,
  updateCustomSegment,
  assignMembersToSegment,
} from "../../lib/member-lifecycle";
import {
  adminDangerOutlineButtonClass,
  adminDarkButtonClass,
  adminEyebrowClass,
  adminMetricPanelClass,
  adminMetricVariantClass,
  adminOutlineButtonClass,
  adminPageDescriptionClass,
  adminPageHeroClass,
  adminPageHeroInnerClass,
  adminPageShellClass,
  adminPageTitleClass,
  adminPanelClass,
  adminPrimaryButtonClass,
  adminSelectClass,
} from "../lib/page-theme";

export default function AdminMembersPage() {
  const { members, transactions, loading, error, refetch } = useAdminData();
  const [query, setQuery] = useState("");
  const [awardingMember, setAwardingMember] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<(typeof members)[number] | null>(null);
  const [manualAwardMember, setManualAwardMember] = useState<(typeof members)[number] | null>(null);
  const [awardPoints, setAwardPoints] = useState("");
  const [awardReason, setAwardReason] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<string>("All");
  const [segments, setSegments] = useState<Array<{ id: string; name: string; description: string | null; is_system: boolean }>>([]);
  const [memberSegmentMap, setMemberSegmentMap] = useState<Record<string, string[]>>({});
  const [selectedMemberKeys, setSelectedMemberKeys] = useState<Record<string, boolean>>({});
  const [segmentName, setSegmentName] = useState("");
  const [segmentDescription, setSegmentDescription] = useState("");
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [segmentDialogOpen, setSegmentDialogOpen] = useState(false);
  const [bulkSegmentId, setBulkSegmentId] = useState<string>("");

  const loadManualSegments = async () => {
    const [allSegments, assignments] = await Promise.all([fetchAllSegments(), fetchSegmentAssignments()]);
    setSegments(allSegments);
    const nextMap: Record<string, string[]> = {};
    for (const row of assignments as Array<{ member_id?: string | number; member_segments?: { name?: string } }>) {
      const key = String(row.member_id ?? "");
      const segmentNameValue = row.member_segments?.name;
      if (!key || !segmentNameValue) continue;
      nextMap[key] = nextMap[key] ? [...nextMap[key], segmentNameValue] : [segmentNameValue];
    }
    setMemberSegmentMap(nextMap);
  };

  useEffect(() => {
    loadManualSegments().catch((err) => {
      console.error(err);
      toast.error("Unable to load member segments.");
    });
  }, []);

  const closeManualAwardDialog = () => {
    setManualAwardMember(null);
    setAwardPoints("");
    setAwardReason("");
  };

  const handleManualAward = async () => {
    if (!manualAwardMember?.member_number) return;

    const points = Number(awardPoints);
    if (!Number.isFinite(points) || points <= 0) {
      toast.error("Please enter a valid positive number of points.");
      return;
    }

    const reason = awardReason.trim();
    if (!reason) {
      toast.error("Reason is required to award points.");
      return;
    }

    try {
      setAwardingMember(manualAwardMember.member_number);
      await awardMemberPoints({
        memberIdentifier: manualAwardMember.member_number,
        points,
        transactionType: "MANUAL_AWARD",
        reason,
      });
      await refetch();
      closeManualAwardDialog();
      toast.success(`Awarded ${points} points to ${manualAwardMember.member_number}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to award points.");
    } finally {
      setAwardingMember(null);
    }
  };

  const segmentedMembers = useMemo(() => {
    const byMember = members.map((member) => {
      const effectiveSegment = member.effective_segment || member.auto_segment || "Inactive";
      const memberKey = String(member.id ?? member.member_id ?? "");
      const assignedSegments = memberSegmentMap[memberKey] || [];
      const customSegments = assignedSegments.filter((name) => !SYSTEM_MEMBER_SEGMENTS.includes(name as (typeof SYSTEM_MEMBER_SEGMENTS)[number]));
      return {
        ...member,
        segment: effectiveSegment,
        isManual: Boolean(member.manual_segment),
        customSegments,
        allSegments: Array.from(new Set([effectiveSegment, ...customSegments])),
      };
    });

    return byMember;
  }, [members, memberSegmentMap]);

  const segmentFilterOptions = useMemo(() => {
    const custom = segments.filter((segment) => !segment.is_system).map((segment) => segment.name);
    return ["Manual", ...SYSTEM_MEMBER_SEGMENTS, ...custom];
  }, [segments]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return segmentedMembers.filter((m) => {
      const fullName = `${m.first_name} ${m.last_name}`.toLowerCase();
      const memberNumber = String(m.member_number || "").toLowerCase();
      const phone = String(m.phone || "").toLowerCase();
      const email = String(m.email || "").toLowerCase();
      const matchesSearch = !q || memberNumber.includes(q) || phone.includes(q) || email.includes(q) || fullName.includes(q);
      const matchesSegment =
        segmentFilter === "All"
          ? true
          : segmentFilter === "Manual"
          ? m.isManual || m.customSegments.length > 0
          : m.segment === segmentFilter || m.customSegments.includes(segmentFilter);
      return matchesSearch && matchesSegment;
    });
  }, [segmentedMembers, query, segmentFilter]);

  const stats = useMemo(
    () => buildSegmentStats(segmentedMembers.length, segmentedMembers.flatMap((m) => (m.customSegments.length ? m.allSegments : [m.segment]))),
    [segmentedMembers]
  );
  const segmentAnalytics = useMemo(() => {
    const now = Date.now();
    const recentWindowMs = 30 * 24 * 60 * 60 * 1000;

    return stats.map((item) => {
      const membersInSegment = segmentedMembers.filter((member) =>
        member.customSegments.length ? member.allSegments.includes(item.segment) : member.segment === item.segment
      );
      const memberIds = new Set(membersInSegment.map((member) => String(member.member_id ?? member.id ?? "")));
      const segmentTransactions = transactions.filter((transaction) => memberIds.has(String(transaction.member_id)));
      const spendTransactions = segmentTransactions.filter((transaction) => Number(transaction.amount_spent || 0) > 0);
      const totalSpend = spendTransactions.reduce((sum, transaction) => sum + Number(transaction.amount_spent || 0), 0);
      const activeMembers = membersInSegment.filter((member) => {
        const lastActivity = member.last_activity_at ? new Date(member.last_activity_at).getTime() : NaN;
        return Number.isFinite(lastActivity) && now - lastActivity <= recentWindowMs;
      }).length;

      return {
        segment: item.segment,
        count: membersInSegment.length,
        avgSpend: membersInSegment.length ? totalSpend / membersInSegment.length : 0,
        activityRate: membersInSegment.length ? (activeMembers / membersInSegment.length) * 100 : 0,
      };
    });
  }, [segmentedMembers, stats, transactions]);
  const segmentDistributionChart = useMemo(
    () =>
      stats.map((item) => ({
        label: item.segment,
        members: item.count,
        share: Number(item.share.toFixed(1)),
      })),
    [stats]
  );
  const segmentValueChart = useMemo(
    () =>
      segmentAnalytics.map((item) => ({
        label: item.segment,
        avgSpend: Number(item.avgSpend.toFixed(2)),
        activityRate: Number(item.activityRate.toFixed(0)),
      })),
    [segmentAnalytics]
  );
  const segmentChartPalette = ["#1A2B47", "#0b7f88", "#6d4ce6", "#f08a24"];
  const totalSegmentMembers = useMemo(
    () => segmentDistributionChart.reduce((sum, item) => sum + item.members, 0),
    [segmentDistributionChart]
  );

  const selectedMemberIds = useMemo(
    () =>
      filtered
        .filter((member) => selectedMemberKeys[String(member.member_id ?? member.id ?? member.member_number)])
        .map((member) => member.member_id ?? member.id),
    [filtered, selectedMemberKeys]
  );

  const handleCreateOrUpdateSegment = async () => {
    try {
      if (editingSegmentId) {
        await updateCustomSegment(editingSegmentId, { name: segmentName, description: segmentDescription });
        toast.success("Segment updated.");
      } else {
        await createCustomSegment({ name: segmentName, description: segmentDescription });
        toast.success("Segment created.");
      }
      setSegmentDialogOpen(false);
      setSegmentName("");
      setSegmentDescription("");
      setEditingSegmentId(null);
      await loadManualSegments();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to save segment.");
    }
  };

  const handleDeleteSegment = async (segmentId: string) => {
    try {
      await deleteCustomSegment(segmentId);
      toast.success("Segment deleted.");
      await loadManualSegments();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to delete segment.");
    }
  };

  const handleBulkAssign = async () => {
    if (!bulkSegmentId) return toast.error("Select a segment.");
    if (!selectedMemberIds.length) return toast.error("Select at least one member.");
    try {
      await assignMembersToSegment(selectedMemberIds, bulkSegmentId);
      toast.success("Members assigned to segment.");
      setSelectedMemberKeys({});
      await loadManualSegments();
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to assign members.");
    }
  };

  const handleMemberSegmentChange = async (memberNumber: string, value: string) => {
    try {
      await saveManualSegment(memberNumber, value);
      await refetch();
      await loadManualSegments();
      toast.success("Member segment updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update member segment.");
    }
  };

  const handleExport = () => {
    const exportedSegmentContextForMember = (member: (typeof filtered)[number]) => {
      if (segmentFilter === "All") return "All Segments";
      if (segmentFilter === "Manual") {
        const manualContexts: string[] = [];
        if (member.isManual) manualContexts.push(`System Manual: ${member.segment}`);
        if (member.customSegments.length) manualContexts.push(`Custom: ${member.customSegments.join(" | ")}`);
        return manualContexts.length ? manualContexts.join(" ; ") : "Manual";
      }
      if (member.customSegments.includes(segmentFilter)) return segmentFilter;
      return member.segment;
    };

    exportMembersCsv(
      filtered.map((m) => ({
        memberNumber: m.member_number,
        name: `${m.first_name} ${m.last_name}`,
        email: m.email,
        phone: m.phone || "",
        effectiveSegment: m.segment,
        customSegments: m.customSegments,
        exportedSegmentContext: exportedSegmentContextForMember(m),
      }))
    );
    toast.success("Segment list exported.");
  };

  if (loading) return <p className="text-base text-gray-700">Loading members...</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div className={adminPageShellClass}>
      <div className={adminPageHeroClass}>
        <div className={adminPageHeroInnerClass}>
          <div className={adminEyebrowClass}>Member Intelligence</div>
          <h1 className={adminPageTitleClass}>Member Segmentation & Lookup</h1>
          <p className={adminPageDescriptionClass}>Auto-segment members, manage manual segments, and export target lists with the same calmer analytics-style presentation.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {stats.map((item, index) => (
          <div key={item.segment} className={`${adminMetricPanelClass} ${adminMetricVariantClass(index)}`}>
            <p className="text-xs uppercase tracking-wide text-[#1A2B47]">{item.segment}</p>
            <p className="mt-2 text-2xl font-bold text-[#10213a]">{item.count}</p>
            <p className="text-xs text-gray-600">{item.share.toFixed(1)}% of members</p>
          </div>
        ))}
      </div>

      <div className={adminPanelClass}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Segment Analytics</h2>
            <p className="text-sm text-gray-500">Count, average spend, and 30-day activity rate by segment.</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {segmentAnalytics.map((item) => (
            <div key={`analytics-${item.segment}`} className="rounded-xl border border-gray-200 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">{item.segment}</p>
              <p className="mt-2 text-2xl font-bold text-[#10213a]">{item.count}</p>
              <p className="mt-2 text-sm text-gray-600">Avg spend: PHP {item.avgSpend.toFixed(2)}</p>
              <p className="text-sm text-gray-600">Activity rate: {item.activityRate.toFixed(0)}%</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className={adminPanelClass}>
          <h2 className="text-lg font-semibold text-gray-900">Segment Distribution</h2>
          <p className="mt-1 text-sm text-gray-500">Current member mix across the core lifecycle segments.</p>
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={segmentDistributionChart}
                    dataKey="members"
                    nameKey="label"
                    innerRadius={68}
                    outerRadius={102}
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {segmentDistributionChart.map((entry, index) => (
                      <Cell key={`segment-slice-${entry.label}`} fill={segmentChartPalette[index % segmentChartPalette.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: 16, borderColor: "#dbe8f6" }}
                    formatter={(value: number, _name, payload) => [`${value} members`, `${payload?.payload?.share ?? 0}% of members`]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3">
              <div className="rounded-2xl border border-[#dbe8f6] bg-[#f8fbff] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[#5b6475]">Total Members</p>
                <p className="mt-2 text-3xl font-bold text-[#10213a]">{totalSegmentMembers}</p>
                <p className="mt-1 text-sm text-[#5b6475]">Across active lifecycle segments</p>
              </div>
              {segmentDistributionChart.map((item, index) => (
                <div key={`segment-stat-${item.label}`} className="flex items-center justify-between rounded-2xl border border-[#e2ebf8] bg-white px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: segmentChartPalette[index % segmentChartPalette.length] }}
                    />
                    <div>
                      <p className="text-sm font-semibold text-[#10213a]">{item.label}</p>
                      <p className="text-xs text-[#6b7b93]">{item.members} members</p>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-[#1A2B47]">{item.share}%</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={adminPanelClass}>
          <h2 className="text-lg font-semibold text-gray-900">Segment Value Snapshot</h2>
          <p className="mt-1 text-sm text-gray-500">Two focused views work better here than forcing spend and activity into one scale.</p>
          <div className="mt-5 space-y-6">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#10213a]">Average Spend</h3>
                <span className="rounded-full bg-[#eef8f8] px-3 py-1 text-xs font-semibold text-[#0f5f65]">PHP</span>
              </div>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={segmentValueChart} layout="vertical" margin={{ top: 0, right: 12, left: 12, bottom: 0 }}>
                    <CartesianGrid stroke="#dbe8f6" strokeDasharray="4 4" horizontal={false} />
                    <XAxis type="number" tick={{ fill: "#5b6475", fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="label" tick={{ fill: "#5b6475", fontSize: 12 }} tickLine={false} axisLine={false} width={78} />
                    <Tooltip
                      contentStyle={{ borderRadius: 16, borderColor: "#dbe8f6" }}
                      formatter={(value: number) => [`PHP ${value.toFixed(2)}`, "Avg Spend"]}
                    />
                    <Bar dataKey="avgSpend" name="Avg Spend" radius={[0, 10, 10, 0]} fill="#0b7f88" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#10213a]">30-Day Activity Rate</h3>
                <span className="rounded-full bg-[#f2edff] px-3 py-1 text-xs font-semibold text-[#5d3fd3]">Percent</span>
              </div>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={segmentValueChart} layout="vertical" margin={{ top: 0, right: 12, left: 12, bottom: 0 }}>
                    <CartesianGrid stroke="#dbe8f6" strokeDasharray="4 4" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fill: "#5b6475", fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="label" tick={{ fill: "#5b6475", fontSize: 12 }} tickLine={false} axisLine={false} width={78} />
                    <Tooltip
                      contentStyle={{ borderRadius: 16, borderColor: "#dbe8f6" }}
                      formatter={(value: number) => [`${value}%`, "Activity Rate"]}
                    />
                    <Bar dataKey="activityRate" name="Activity Rate" radius={[0, 10, 10, 0]} fill="#6d4ce6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#9ed8ff] bg-gradient-to-br from-white via-[#fbfdff] to-[#f3f9ff] p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch">
          <MemberLookup onSearch={setQuery} isLoading={loading} className="min-w-0 flex-1 xl:max-w-2xl" />

          <div className="flex min-w-0 flex-1 flex-col justify-between rounded-2xl border border-[#dbe8f6] bg-white p-4">
            <div>
              <p className="text-sm font-semibold text-[#10213a]">Segment Controls</p>
              <p className="mt-1 text-sm text-gray-500">Filter the current list, create reusable custom groups, or export the visible members.</p>
            </div>

            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0 flex-1">
                <Label htmlFor="segment-filter" className="text-sm font-medium text-[#1A2B47]">Filter by segment</Label>
                <select
                  id="segment-filter"
                  className={`mt-2 ${adminSelectClass}`}
                  value={segmentFilter}
                  onChange={(e) => setSegmentFilter(e.target.value)}
                >
                  <option value="All">All segments</option>
                  {segmentFilterOptions.map((segment) => (
                    <option key={segment} value={segment}>{segment}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  className={adminOutlineButtonClass}
                  onClick={() => {
                    setEditingSegmentId(null);
                    setSegmentName("");
                    setSegmentDescription("");
                    setSegmentDialogOpen(true);
                  }}
                >
                  Create Segment
                </Button>
                <Button className={adminDarkButtonClass} onClick={handleExport}>
                  Export Segment List
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={segmentDialogOpen} onOpenChange={setSegmentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSegmentId ? "Edit Custom Segment" : "Create Custom Segment"}</DialogTitle>
            <DialogDescription>Define a custom member segment for manual assignment.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="segment-name">Segment name</Label>
              <Input id="segment-name" value={segmentName} onChange={(e) => setSegmentName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="segment-description">Description</Label>
              <Input id="segment-description" value={segmentDescription} onChange={(e) => setSegmentDescription(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSegmentDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateOrUpdateSegment}>{editingSegmentId ? "Save Changes" : "Create Segment"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="bg-white rounded-2xl p-6 border border-[#9ed8ff] space-y-4 shadow-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Custom Segments</h2>
            <p className="text-sm text-gray-500">Manage hand-crafted member groups for special targeting and manual campaigns.</p>
          </div>
          <div className="rounded-full bg-[#eef7ff] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#1A2B47]">
            {segments.filter((segment) => !segment.is_system).length} active
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {segments.filter((segment) => !segment.is_system).map((segment) => (
            <div key={segment.id} className="flex flex-col gap-3 rounded-2xl border border-[#dbe8f6] bg-gradient-to-r from-white to-[#f8fbff] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{segment.name}</p>
                <p className="mt-1 text-sm text-gray-500">{segment.description || "No description added yet."}</p>
              </div>
              <div className="flex gap-2 self-start sm:self-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className={adminOutlineButtonClass}
                  onClick={() => {
                    setEditingSegmentId(segment.id);
                    setSegmentName(segment.name);
                    setSegmentDescription(segment.description || "");
                    setSegmentDialogOpen(true);
                  }}
                >
                  Edit
                </Button>
                <Button variant="outline" size="sm" className={adminDangerOutlineButtonClass} onClick={() => handleDeleteSegment(segment.id)}>Delete</Button>
              </div>
            </div>
          ))}
          {segments.filter((segment) => !segment.is_system).length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#c9d8eb] bg-[#f9fbfe] px-5 py-8 text-center">
              <p className="text-sm font-medium text-[#1A2B47]">No custom segments yet.</p>
              <p className="mt-1 text-sm text-gray-500">Create one to group members beyond the built-in system segments.</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#9ed8ff] p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Bulk Segment Assignment</h2>
            <p className="mt-1 text-sm text-gray-500">Assign the currently selected members to a segment in one step.</p>
          </div>
          <div className="rounded-full bg-[#eef7ff] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#1A2B47]">
            {selectedMemberIds.length} selected
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end">
          <div className="min-w-0 flex-1">
            <Label htmlFor="bulk-segment" className="text-sm font-medium text-[#1A2B47]">Assign selected to segment</Label>
            <select
              id="bulk-segment"
              className={`mt-2 ${adminSelectClass}`}
              value={bulkSegmentId}
              onChange={(e) => setBulkSegmentId(e.target.value)}
            >
              <option value="">Select segment</option>
              {segments.map((segment) => (
                <option key={segment.id} value={segment.id}>{segment.name}</option>
              ))}
            </select>
          </div>
          <Button className={adminDarkButtonClass} onClick={handleBulkAssign}>Assign Members</Button>
        </div>
      </div>

      {selectedMember ? (
        <div className="bg-[#f8fcff] rounded-xl p-5 border border-[#9ed8ff]">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Member Profile</h2>
            <button type="button" onClick={() => setSelectedMember(null)} className="text-sm text-[#1A2B47]">Close</button>
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <p><span className="font-semibold">Member ID:</span> {selectedMember.member_number}</p>
            <p><span className="font-semibold">Name:</span> {selectedMember.first_name} {selectedMember.last_name}</p>
            <p><span className="font-semibold">Mobile:</span> {selectedMember.phone || "-"}</p>
            <p><span className="font-semibold">Email:</span> {selectedMember.email || "-"}</p>
            <p><span className="font-semibold">Points:</span> {(selectedMember.points_balance || 0).toLocaleString()}</p>
            <p><span className="font-semibold">Tier:</span> {selectedMember.tier || "Bronze"}</p>
          </div>
        </div>
      ) : null}

      <Dialog open={Boolean(manualAwardMember)} onOpenChange={(open) => {
        if (!open) closeManualAwardDialog();
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manual Award</DialogTitle>
            <DialogDescription>
              Award points to {manualAwardMember?.first_name} {manualAwardMember?.last_name} ({manualAwardMember?.member_number}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="award-points">Points to Award</Label>
              <Input id="award-points" type="number" min="1" step="1" value={awardPoints} onChange={(e) => setAwardPoints(e.target.value)} placeholder="Enter points" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="award-reason">Reason</Label>
              <Input id="award-reason" value={awardReason} onChange={(e) => setAwardReason(e.target.value)} placeholder="Enter reason for manual award" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeManualAwardDialog}>Cancel</Button>
            <Button onClick={handleManualAward} disabled={awardingMember === manualAwardMember?.member_number}>
              {awardingMember === manualAwardMember?.member_number ? "Awarding..." : "Confirm Award"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className={adminPanelClass}>
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Members</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="w-16 py-3 pl-4 pr-2 text-left text-sm font-semibold text-gray-600">Select</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Member #</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Name</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Email</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Mobile</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Points</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Segment</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((member) => {
                const key = String(member.member_id || member.id || member.member_number);
                const selectedKey = String(member.member_id ?? member.id ?? member.member_number);
                return (
                  <tr key={key} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-4 pl-4 pr-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedMemberKeys[selectedKey])}
                        onChange={(e) =>
                          setSelectedMemberKeys((prev) => ({
                            ...prev,
                            [selectedKey]: e.target.checked,
                          }))
                        }
                        className="h-5 w-5 cursor-pointer accent-[#1A2B47]"
                        aria-label={`Select ${member.member_number}`}
                      />
                    </td>
                    <td className="py-4 px-4 text-sm font-medium text-gray-800">{member.member_number}</td>
                    <td className="py-4 px-4 text-sm text-gray-700">{member.first_name} {member.last_name}</td>
                    <td className="py-4 px-4 text-sm text-gray-600">{member.email}</td>
                    <td className="py-4 px-4 text-sm text-gray-600">{member.phone || "-"}</td>
                    <td className="py-4 px-4 text-sm font-semibold text-gray-800">{(member.points_balance || 0).toLocaleString()}</td>
                    <td className="py-4 px-4 text-sm text-gray-600">
                      <select
                        value={member.segment}
                        onChange={(e) => handleMemberSegmentChange(member.member_number, e.target.value)}
                        className={`${adminSelectClass} min-w-[170px]`}
                      >
                        {SYSTEM_MEMBER_SEGMENTS.map((segment) => (
                          <option key={`${key}-${segment}`} value={segment}>
                            {segment}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setSelectedMember(member)} className="inline-flex items-center justify-center rounded-lg border border-[#c9d8eb] bg-white px-3 py-1.5 text-xs font-semibold text-[#1A2B47] transition hover:border-[#9eb8da] hover:bg-[#eef5ff] hover:text-[#10213a]">View</button>
                        <button
                          type="button"
                          onClick={() => {
                            setManualAwardMember(member);
                            setAwardPoints("");
                            setAwardReason("");
                          }}
                          disabled={awardingMember === member.member_number}
                          className="inline-flex items-center justify-center rounded-lg bg-[#0fa7b4] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0c96a2] hover:text-white disabled:opacity-60"
                        >
                          {awardingMember === member.member_number ? "Awarding..." : "Award"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 ? <p className="py-6 text-gray-500">No matching members found.</p> : null}
        </div>
      </div>
    </div>
  );
}

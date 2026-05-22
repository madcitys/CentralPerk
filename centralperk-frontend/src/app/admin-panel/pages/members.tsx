import React, { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Bell } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import { useAdminData } from "../hooks/use-admin-data";
import { MemberLookup } from "../../../components/member-lookup";
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
import { cn } from "../../../components/ui/utils";
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
import { awardPointsViaApi, previewSegmentViaApi, saveSegmentViaApi } from "../../lib/api";
import {
  adminDangerOutlineButtonClass,
  adminDarkButtonClass,
  adminEyebrowClass,
  adminInputClass,
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

const builderFieldOptions = ["Tier", "Last Activity", "Points Balance"];
const builderOperatorOptions: Record<string, string[]> = {
  Tier: ["is", "is not"],
  "Last Activity": ["is within", "is older than"],
  "Points Balance": ["is", "is above", "is below"],
};

type BuilderCondition = {
  id: string;
  field: "Tier" | "Last Activity" | "Points Balance";
  operator: string;
  value: string;
};

function formatBuilderChip(field: string, operator: string, value: string) {
  if (field === "Last Activity" && operator === "is within") {
    return `${field} ${operator} ${value} days`;
  }
  return `${field} ${operator} ${value}`;
}

function compactPageItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const validPages = [...pages]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);

  return validPages.reduce<Array<number | "ellipsis">>((items, page, index) => {
    const previous = validPages[index - 1];
    if (previous !== undefined && page - previous > 1) items.push("ellipsis");
    items.push(page);
    return items;
  }, []);
}

type AdminDashboardOutletContext = {
  notificationCount?: number;
  openNotifications?: () => void;
};

export default function AdminMembersPage() {
  const { notificationCount = 0, openNotifications } = useOutletContext<AdminDashboardOutletContext>();
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
  const [builderSegmentName, setBuilderSegmentName] = useState("High-spend lapsed members");
  const [builderDescription, setBuilderDescription] = useState("Win-back audience for April outreach");
  const [builderLogicMode, setBuilderLogicMode] = useState<"AND" | "OR">("AND");
  const [livePreviewCount, setLivePreviewCount] = useState(1);
  const [lastRecalculated, setLastRecalculated] = useState(() => new Date().toLocaleString());
  const [savingBuilder, setSavingBuilder] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 7;
  const [builderConditions, setBuilderConditions] = useState<BuilderCondition[]>([
    { id: "tier", field: "Tier", operator: "is", value: "Gold" },
    { id: "activity", field: "Last Activity", operator: "is within", value: "30" },
  ]);

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

  useEffect(() => {
    const validConditions = builderConditions
      .map((condition) => ({
        ...condition,
        value: condition.value.trim(),
      }))
      .filter((condition) => condition.value);

    const handle = window.setTimeout(() => {
      if (validConditions.length === 0) {
        setLivePreviewCount(0);
        setLastRecalculated(new Date().toLocaleString());
        return;
      }

      void previewSegmentViaApi({
        logicMode: builderLogicMode,
        conditions: validConditions,
      })
        .then((response) => {
          setLivePreviewCount(response.preview.count);
          setLastRecalculated(new Date().toLocaleString());
        })
        .catch(() => {
          setLivePreviewCount(0);
          setLastRecalculated(new Date().toLocaleString());
        });
    }, 350);

    return () => window.clearTimeout(handle);
  }, [builderConditions, builderLogicMode, builderSegmentName, builderDescription]);

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
      await awardPointsViaApi({
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
  const duplicateBuilderName = useMemo(() => {
    const normalized = builderSegmentName.trim().toLowerCase();
    if (!normalized) return false;
    return segments.some((segment) => !segment.is_system && segment.name.trim().toLowerCase() === normalized);
  }, [builderSegmentName, segments]);
  const builderConditionChips = useMemo(
    () => builderConditions.map((condition) => formatBuilderChip(condition.field, condition.operator, condition.value)),
    [builderConditions]
  );

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

  const handleSaveBuilderSegment = async () => {
    const normalizedName = builderSegmentName.trim();
    if (!normalizedName) {
      toast.error("Segment name is required.");
      return;
    }

    const validConditions = builderConditions
      .map((condition) => ({
        ...condition,
        value: condition.value.trim(),
      }))
      .filter((condition) => condition.value);

    if (validConditions.length === 0) {
      toast.error("Add at least one valid segment condition.");
      return;
    }

    try {
      setSavingBuilder(true);
      const response = await saveSegmentViaApi({
        name: normalizedName,
        description: builderDescription,
        logicMode: builderLogicMode,
        conditions: validConditions,
      });
      setLivePreviewCount(response.preview?.count ?? livePreviewCount);
      await loadManualSegments();
      toast.success("Builder segment saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save builder segment.");
    } finally {
      setSavingBuilder(false);
    }
  };

  if (loading) return <p className="text-base text-gray-700">Loading members...</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const paginatedMembers = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const pageItems = compactPageItems(currentPage, totalPages);

  const getStat = (name: string) => stats.find(s => s.segment === name) || { count: 0, share: 0 };
  const inactiveStat = getStat("Inactive");
  const activeStat = getStat("Active");
  const atRiskStat = getStat("At Risk");
  const highValueStat = getStat("High Value");

  return (
    <div className="flex h-full flex-col gap-5 p-6 bg-[#f3f6f9] overflow-auto">
      {/* Header */}
      <header className="rounded-[16px] border border-[#d9e8f6] bg-[linear-gradient(135deg,#ffffff_0%,#f3fbff_48%,#eef8ff_100%)] px-5 py-5 shadow-[0_14px_32px_rgba(17,38,60,0.07)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-[#cbe4f6] bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#0b7f88]">
              Member Intelligence
            </div>
            <h1 className="mt-3 text-[28px] font-extrabold leading-none tracking-normal text-[#132036] sm:text-[30px]">Member Segmentation & Lookup</h1>
            <p className="mt-2 text-[13px] font-medium text-[#5f6f86]">Manage member profiles, analyze behavior, and build custom audiences.</p>
          </div>

          <div className="flex shrink-0 items-center gap-2.5 self-start">
            <button
              type="button"
              onClick={() => openNotifications?.()}
              aria-label="Notifications"
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d4e5f4] bg-white/80 text-[#132036] shadow-[0_8px_18px_rgba(17,38,60,0.06)] transition hover:bg-white hover:shadow-sm"
            >
              <Bell className="h-5 w-5" />
              {notificationCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-white bg-[#0b8b95] px-1 text-[10px] font-bold text-white">
                  {notificationCount > 99 ? "99+" : notificationCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-end">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={handleExport} className="h-10 rounded-md border-[#dfe7f1] bg-white px-4 text-[12px] font-bold text-[#24364f] shadow-[0_4px_12px_rgba(17,38,60,0.04)] transition hover:border-[#bfd0e6] hover:bg-[#f9fbff]">Export Report</Button>
            <Button className={cn(adminPrimaryButtonClass, "h-10 rounded-md px-4 shadow-[0_8px_18px_rgba(11,127,136,0.18)]")} onClick={() => setSegmentDialogOpen(true)}>+ Create Segment</Button>
          </div>
        </div>
      </header>

      {/* Metrics Row */}
      <div className="grid grid-cols-4 gap-5">
        {[
          { label: "INACTIVE", stat: inactiveStat },
          { label: "ACTIVE", stat: activeStat },
          { label: "AT RISK", stat: atRiskStat },
          { label: "HIGH VALUE", stat: highValueStat },
        ].map((metric) => (
          <div key={metric.label} className="bg-white rounded-[16px] border border-[#e4ecf4] p-5 shadow-[0_4px_12px_rgba(17,38,60,0.02)]">
            <p className="text-xs font-semibold text-[#5a6a7e] mb-1">{metric.label}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-[28px] font-extrabold text-[#15243a] leading-none">{metric.stat.count}</span>
              <span className="text-xs font-medium text-[#8f9eb2]">{metric.stat.share.toFixed(1)}% of members</span>
            </div>
          </div>
        ))}
      </div>

      {/* Middle Row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Distribution */}
        <div className="bg-white rounded-[16px] border border-[#e4ecf4] p-5 shadow-[0_4px_12px_rgba(17,38,60,0.02)] flex flex-col xl:col-span-1">
          <h3 className="text-sm font-bold text-[#15243a]">Distribution</h3>
          <p className="text-xs text-[#5a6a7e] mb-4">Current member mix.</p>
          <div className="flex-1 relative min-h-[160px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={segmentDistributionChart}
                  dataKey="members"
                  nameKey="label"
                  innerRadius={54}
                  outerRadius={76}
                  strokeWidth={0}
                >
                  {segmentDistributionChart.map((entry, index) => (
                    <Cell key={`segment-slice-${entry.label}`} fill={segmentChartPalette[index % segmentChartPalette.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: 12, borderColor: "#dbe8f6" }}
                  formatter={(value: number, _name, payload) => [`${value} members`, `${payload?.payload?.share ?? 0}% of members`]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xl font-bold text-[#15243a]">{totalSegmentMembers}</span>
              <span className="text-[10px] font-semibold text-[#5a6a7e]">TOTAL</span>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-4">
            {segmentDistributionChart.map((item, index) => (
              <div key={item.label} className="flex items-center gap-1.5 text-xs text-[#15243a] font-medium">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: segmentChartPalette[index % segmentChartPalette.length] }} />
                {item.label} ({item.share}%)
              </div>
            ))}
          </div>
        </div>

        {/* Segment Value Snapshot */}
        <div className="bg-white rounded-[16px] border border-[#e4ecf4] p-5 shadow-[0_4px_12px_rgba(17,38,60,0.02)] xl:col-span-1 flex flex-col">
          <h3 className="text-sm font-bold text-[#15243a] mb-4">Segment Value Snapshot</h3>
          <div className="flex gap-4 h-full">
            <div className="flex-1 flex flex-col">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold text-[#5a6a7e]">Avg Spend</span>
                <span className="text-[10px] font-bold text-[#0b8b95] bg-[#e7fbfb] px-2 py-0.5 rounded-full">PHP</span>
              </div>
              <div className="flex-1 min-h-[140px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={segmentValueChart} layout="vertical" margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="label" tick={{ fill: "#5a6a7e", fontSize: 10 }} tickLine={false} axisLine={false} width={60} />
                    <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#dbe8f6" }} formatter={(value: number) => [`PHP ${value.toFixed(2)}`, "Avg Spend"]} />
                    <Bar dataKey="avgSpend" radius={[0, 4, 4, 0]} barSize={8}>
                      {segmentValueChart.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={segmentChartPalette[index % segmentChartPalette.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-between text-[10px] text-[#8f9eb2] mt-1 border-t border-[#e4ecf4] pt-1">
                <span>0</span>
                <span>2</span>
                <span>4</span>
              </div>
            </div>
            <div className="flex-1 flex flex-col border-l border-[#e4ecf4] pl-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold text-[#5a6a7e]">Activity Rate (30d)</span>
                <span className="text-[10px] font-bold text-[#7c3aed] bg-[#f3efff] px-2 py-0.5 rounded-full">%</span>
              </div>
              <div className="flex-1 min-h-[140px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={segmentValueChart} layout="vertical" margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis type="number" domain={[0, 100]} hide />
                    <YAxis type="category" dataKey="label" tick={{ fill: "#5a6a7e", fontSize: 10 }} tickLine={false} axisLine={false} width={60} />
                    <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#dbe8f6" }} formatter={(value: number) => [`${value}%`, "Activity Rate"]} />
                    <Bar dataKey="activityRate" radius={[0, 4, 4, 0]} barSize={8}>
                      {segmentValueChart.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={segmentChartPalette[index % segmentChartPalette.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-between text-[10px] text-[#8f9eb2] mt-1 border-t border-[#e4ecf4] pt-1">
                <span>0</span>
                <span>50</span>
                <span>100</span>
              </div>
            </div>
          </div>
        </div>

        {/* Lookup & Bulk */}
        <div className="bg-white rounded-[16px] border border-[#e4ecf4] p-5 shadow-[0_4px_12px_rgba(17,38,60,0.02)] flex flex-col gap-6 xl:col-span-1">
          <div>
            <h3 className="text-sm font-bold text-[#15243a] mb-2 flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-[#5a6a7e]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
              Lookup & Filter
            </h3>
            <div className="relative mb-3">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-4 w-4 text-[#8f9eb2]" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg>
              </div>
              <input type="text" className="block w-full pl-9 pr-3 py-2 border border-[#dce6f2] rounded-lg text-sm bg-[#f9fbfe] focus:outline-none focus:ring-1 focus:ring-[#0b8b95]" placeholder="Search MEM001, John..." value={query} onChange={(e) => {setQuery(e.target.value); setCurrentPage(1);}} />
            </div>
            <select className="block w-full px-3 py-2 border border-[#dce6f2] rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#0b8b95]" value={segmentFilter} onChange={(e) => {setSegmentFilter(e.target.value); setCurrentPage(1);}}>
              <option value="All">All segments</option>
              {segmentFilterOptions.map((segment) => (
                <option key={segment} value={segment}>{segment}</option>
              ))}
            </select>
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#15243a] mb-2">Bulk Actions</h3>
            <select className="block w-full px-3 py-2 border border-[#dce6f2] rounded-lg text-sm bg-white mb-3 focus:outline-none focus:ring-1 focus:ring-[#0b8b95]" value={bulkSegmentId} onChange={(e) => setBulkSegmentId(e.target.value)}>
              <option value="">Select segment...</option>
              {segments.map((segment) => (
                <option key={segment.id} value={segment.id}>{segment.name}</option>
              ))}
            </select>
            <Button className="w-full bg-[#15243a] hover:bg-[#1a2d47] text-white rounded-lg font-semibold shadow-none py-2" onClick={handleBulkAssign}>Assign Selected</Button>
          </div>
        </div>
      </div>

      {/* Directory Table */}
      <div className="bg-white rounded-[16px] border border-[#e4ecf4] shadow-[0_4px_12px_rgba(17,38,60,0.02)] flex-1 flex flex-col min-h-[400px]">
        <div className="flex items-center justify-between p-5 pb-3">
          <h3 className="text-[15px] font-bold text-[#15243a]">Member Directory</h3>
          <span className="text-xs text-[#8f9eb2]">{totalItems} total members</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#e4ecf4]">
                <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-[#8f9eb2] w-12 text-center">
                  <input type="checkbox" className="h-4 w-4 rounded border-[#dce6f2] text-[#0b8b95] focus:ring-[#0b8b95]" onChange={(e) => {
                    const checked = e.target.checked;
                    const next = { ...selectedMemberKeys };
                    paginatedMembers.forEach(m => next[String(m.member_id ?? m.id ?? m.member_number)] = checked);
                    setSelectedMemberKeys(next);
                  }}/>
                </th>
                <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-[#8f9eb2]">MEMBER #</th>
                <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-[#8f9eb2]">NAME</th>
                <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-[#8f9eb2]">EMAIL</th>
                <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-[#8f9eb2]">MOBILE</th>
                <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-[#8f9eb2]">POINTS</th>
                <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-[#8f9eb2]">SEGMENT</th>
                <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-[#8f9eb2]">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f7]">
              {paginatedMembers.map((member) => {
                const selectedKey = String(member.member_id ?? member.id ?? member.member_number);
                return (
                  <tr key={selectedKey} className="hover:bg-[#fbfdff] transition-colors group">
                    <td className="px-5 py-3.5 text-center">
                      <input type="checkbox" className="h-4 w-4 rounded border-[#dce6f2] text-[#0b8b95] focus:ring-[#0b8b95]" checked={Boolean(selectedMemberKeys[selectedKey])} onChange={(e) => setSelectedMemberKeys(prev => ({...prev, [selectedKey]: e.target.checked}))} />
                    </td>
                    <td className="px-5 py-3.5 text-xs font-semibold text-[#15243a]">{member.member_number}</td>
                    <td className="px-5 py-3.5 text-xs text-[#5a6a7e]">{member.first_name} {member.last_name}</td>
                    <td className="px-5 py-3.5 text-xs text-[#5a6a7e]">{member.email}</td>
                    <td className="px-5 py-3.5 text-xs text-[#5a6a7e]">{member.phone || "-"}</td>
                    <td className="px-5 py-3.5 text-xs font-bold text-[#15243a]">{(member.points_balance || 0).toLocaleString()}</td>
                    <td className="px-5 py-3.5">
                      <select
                        value={member.segment}
                        onChange={(e) => handleMemberSegmentChange(member.member_number, e.target.value)}
                        className="block w-[120px] py-1.5 pl-3 pr-8 border border-[#dce6f2] rounded-md text-xs bg-white text-[#5a6a7e] focus:outline-none focus:ring-1 focus:ring-[#0b8b95]"
                      >
                        {SYSTEM_MEMBER_SEGMENTS.map((segment) => (
                          <option key={`${selectedKey}-${segment}`} value={segment}>{segment}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-3.5">
                      <button className="text-[11px] font-semibold text-[#15243a] border border-[#dce6f2] rounded-md px-3 py-1.5 bg-white hover:bg-[#f3f6f9] transition-colors" onClick={() => setSelectedMember(member)}>View</button>
                    </td>
                  </tr>
                );
              })}
              {paginatedMembers.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-sm text-[#8f9eb2]">No members found matching your criteria.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="mt-auto flex items-center justify-between px-5 py-4 border-t border-[#e4ecf4] bg-white rounded-b-[16px]">
          <p className="text-xs text-[#8f9eb2]">
            Showing {totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems} entries
          </p>
          <div className="flex flex-wrap justify-end gap-1.5">
            <button 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 border border-[#dce6f2] rounded-md text-xs font-medium bg-white text-[#5a6a7e] disabled:opacity-50 hover:bg-[#f9fbfe]"
            >Prev</button>
            
            {pageItems.map((page, index) =>
              page === "ellipsis" ? (
                <span key={`ellipsis-${index}`} className="flex h-7 w-7 items-center justify-center text-xs font-semibold text-[#8f9eb2]">...</span>
              ) : (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={cn("w-7 h-7 rounded-md text-xs font-semibold flex items-center justify-center transition-colors", currentPage === page ? "bg-[#15243a] text-white" : "border border-[#dce6f2] bg-white text-[#5a6a7e] hover:bg-[#f9fbfe]")}
                >
                  {page}
                </button>
              )
            )}

            <button 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="px-3 py-1.5 border border-[#dce6f2] rounded-md text-xs font-medium bg-white text-[#5a6a7e] disabled:opacity-50 hover:bg-[#f9fbfe]"
            >Next</button>
          </div>
        </div>
      </div>

      {/* View Member Dialog */}
      {selectedMember && (
        <Dialog open={Boolean(selectedMember)} onOpenChange={(open) => !open && setSelectedMember(null)}>
          <DialogContent className="sm:max-w-md p-6 bg-white rounded-2xl border-0 shadow-xl">
            <DialogHeader className="mb-4">
              <DialogTitle className="text-lg font-bold text-[#15243a]">Member Profile</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
              <div>
                <p className="text-[10px] font-bold text-[#8f9eb2] uppercase mb-1">Member ID</p>
                <p className="font-semibold text-[#15243a]">{selectedMember.member_number}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-[#8f9eb2] uppercase mb-1">Name</p>
                <p className="font-semibold text-[#15243a]">{selectedMember.first_name} {selectedMember.last_name}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-[#8f9eb2] uppercase mb-1">Mobile</p>
                <p className="font-semibold text-[#15243a]">{selectedMember.phone || "-"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-[#8f9eb2] uppercase mb-1">Email</p>
                <p className="font-semibold text-[#15243a]">{selectedMember.email || "-"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-[#8f9eb2] uppercase mb-1">Points Balance</p>
                <p className="font-semibold text-[#15243a]">{(selectedMember.points_balance || 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-[#8f9eb2] uppercase mb-1">Tier</p>
                <p className="font-semibold text-[#15243a]">{selectedMember.tier || "Bronze"}</p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-[#e4ecf4]">
              <Button variant="outline" className="border-[#dce6f2] rounded-full px-6 text-[#15243a]" onClick={() => setSelectedMember(null)}>Close</Button>
              <Button className="bg-[#0b8b95] hover:bg-[#097c85] rounded-full px-6 text-white" onClick={() => { setManualAwardMember(selectedMember); setAwardPoints(""); setAwardReason(""); }}>Award Points</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Manual Award Dialog */}
      <Dialog open={Boolean(manualAwardMember)} onOpenChange={(open) => !open && closeManualAwardDialog()}>
        <DialogContent className="sm:max-w-md p-6 bg-white rounded-2xl border-0 shadow-xl">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-lg font-bold text-[#15243a]">Manual Award</DialogTitle>
            <DialogDescription className="text-xs text-[#5a6a7e]">
              Award points to {manualAwardMember?.first_name} {manualAwardMember?.last_name} ({manualAwardMember?.member_number}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="award-points" className="text-xs font-bold text-[#15243a] mb-1.5 block">Points to Award</Label>
              <Input id="award-points" type="number" min="1" step="1" value={awardPoints} onChange={(e) => setAwardPoints(e.target.value)} placeholder="Enter points" className="border-[#dce6f2] focus-visible:ring-[#0b8b95]" />
            </div>

            <div>
              <Label htmlFor="award-reason" className="text-xs font-bold text-[#15243a] mb-1.5 block">Reason</Label>
              <Input id="award-reason" value={awardReason} onChange={(e) => setAwardReason(e.target.value)} placeholder="Enter reason for manual award" className="border-[#dce6f2] focus-visible:ring-[#0b8b95]" />
            </div>
          </div>

          <DialogFooter className="mt-6 pt-4 border-t border-[#e4ecf4] sm:justify-end gap-2">
            <Button variant="outline" className="border-[#dce6f2] rounded-full px-6 text-[#15243a]" onClick={closeManualAwardDialog}>Cancel</Button>
            <Button className="bg-[#0b8b95] hover:bg-[#097c85] rounded-full px-6 text-white" onClick={handleManualAward} disabled={awardingMember === manualAwardMember?.member_number}>
              {awardingMember === manualAwardMember?.member_number ? "Awarding..." : "Confirm Award"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Member Segmentation Builder Modal */}
      <Dialog open={segmentDialogOpen} onOpenChange={setSegmentDialogOpen}>
        <DialogContent className="sm:max-w-[960px] p-8 overflow-hidden border-0 bg-white rounded-[24px] shadow-2xl">
          {/* Header Area */}
          <div className="flex justify-between items-start mb-8">
            <div className="pr-8">
              <DialogTitle className="text-[24px] font-bold text-[#1f2937] leading-tight mb-2">Member Segmentation Builder</DialogTitle>
              <DialogDescription className="text-[14px] text-[#6b7280] m-0 font-medium">A builder shell for live preview, logic selection, readable chips, timestamp, and duplicate-name validation.</DialogDescription>
            </div>
            <div className="bg-[#f9fafb] rounded-[12px] px-4 py-2.5 border border-[#e5e7eb] text-right flex-shrink-0">
              <div className="text-[10px] font-bold text-[#6b7280] mb-0.5">Last recalculated</div>
              <div className="text-[12px] font-medium text-[#4b5563]">{lastRecalculated}</div>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-8">
            {/* Left Column */}
            <div className="flex-1 flex flex-col gap-6">
              {/* Top Controls */}
              <div className="flex gap-6 items-start">
                <div className="flex-1">
                  <label className="text-[13px] font-bold text-[#374151] block mb-2">Segment name</label>
                  <input type="text" className={cn("w-full border rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0f766e]", duplicateBuilderName ? "border-red-500 focus:ring-red-500" : "border-[#e5e7eb]")} placeholder="Gold reactivation test" value={builderSegmentName} onChange={(e) => setBuilderSegmentName(e.target.value)} />
                  {duplicateBuilderName && <p className="text-[12px] text-red-500 mt-2 font-medium">A segment with this name already exists.</p>}
                </div>
                <div>
                  <label className="text-[13px] font-bold text-[#374151] block mb-2">Logic mode</label>
                  <div className="flex rounded-full border border-[#e5e7eb] bg-white p-1">
                    <button className={cn("px-5 py-1.5 text-[13px] font-bold rounded-full transition-colors", builderLogicMode === "AND" ? "bg-[#0d9488] text-white" : "text-[#4b5563] hover:text-[#1f2937]")} onClick={() => setBuilderLogicMode("AND")}>AND</button>
                    <button className={cn("px-5 py-1.5 text-[13px] font-bold rounded-full transition-colors", builderLogicMode === "OR" ? "bg-[#0d9488] text-white" : "text-[#4b5563] hover:text-[#1f2937]")} onClick={() => setBuilderLogicMode("OR")}>OR</button>
                  </div>
                </div>
              </div>

              {/* Conditions */}
              <div className="space-y-4">
                {builderConditions.map((condition, index) => (
                  <div key={condition.id} className="bg-white rounded-[20px] p-5 border border-[#e5e7eb] relative group">
                    <div className="flex gap-4 items-end mb-5">
                      <div className="flex-1">
                        <label className="text-[13px] font-bold text-[#374151] block mb-2">Field</label>
                        <select className="w-full border border-[#e5e7eb] rounded-[10px] px-3 py-2.5 text-[14px] bg-[#fdfdfd] focus:outline-none focus:ring-2 focus:ring-[#0f766e] font-medium" value={condition.field} onChange={(e) => setBuilderConditions((prev) => prev.map((item) => item.id === condition.id ? { ...item, field: e.target.value as BuilderCondition["field"], operator: builderOperatorOptions[e.target.value]?.[0] ?? item.operator } : item))}>
                          {builderFieldOptions.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="text-[13px] font-bold text-[#374151] block mb-2">Operator</label>
                        <select className="w-full border border-[#e5e7eb] rounded-[10px] px-3 py-2.5 text-[14px] bg-[#fdfdfd] focus:outline-none focus:ring-2 focus:ring-[#0f766e] font-medium" value={condition.operator} onChange={(e) => setBuilderConditions((prev) => prev.map((item) => item.id === condition.id ? { ...item, operator: e.target.value } : item))}>
                          {(builderOperatorOptions[condition.field] ?? [condition.operator]).map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="text-[13px] font-bold text-[#374151] block mb-2">Value</label>
                        <div className="flex gap-2 items-center bg-[#fdfdfd] border border-[#e5e7eb] rounded-[10px] px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#0f766e]">
                          <input type="text" className="w-full bg-transparent text-[14px] focus:outline-none font-medium" value={condition.value} onChange={(e) => setBuilderConditions((prev) => prev.map((item) => item.id === condition.id ? { ...item, value: e.target.value } : item))} />
                          {condition.field === "Last Activity" && <span className="text-[13px] font-medium text-[#6b7280]">days</span>}
                        </div>
                      </div>
                      <button onClick={() => setBuilderConditions(prev => prev.length > 1 ? prev.filter(i => i.id !== condition.id) : prev)} className="p-2 text-[#9ca3af] hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 absolute top-3 right-3">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                      </button>
                    </div>
                    <div>
                      <span className="inline-flex rounded-full bg-[#1f2937] text-white text-[13px] font-bold px-4 py-1.5 shadow-sm">{formatBuilderChip(condition.field, condition.operator, condition.value)}</span>
                    </div>
                  </div>
                ))}

                <button className="text-[#0d9488] text-[14px] font-bold flex items-center gap-1.5 hover:text-[#0f766e] px-2 py-1 transition-colors mt-2" onClick={() => setBuilderConditions(prev => [...prev, { id: Math.random().toString(), field: "Tier", operator: "is", value: "" }])}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                  Add Condition
                </button>
              </div>
            </div>

            {/* Right Column */}
            <div className="w-full lg:w-[320px] flex flex-col gap-6">
              <div className="bg-[#eefcf6] rounded-[24px] p-6 border border-[#d1fae5]">
                <h3 className="text-[18px] font-bold text-[#065f46] mb-2">Live member count preview</h3>
                <p className="text-[14px] font-medium text-[#059669] mb-8 leading-relaxed">Debounced preview updates within the builder shell.</p>
                <div className="text-[72px] font-extrabold text-[#1f2937] leading-none mb-3 tracking-tight">{livePreviewCount}</div>
                <p className="text-[13px] font-medium text-[#059669]">Members currently matching this rule set</p>
              </div>

              <div className="bg-white rounded-[24px] p-6 border border-[#e5e7eb] shadow-sm">
                <h3 className="text-[15px] font-bold text-[#1f2937] mb-4">Condition chips</h3>
                <div className="flex flex-col gap-2.5">
                  {builderConditionChips.map((chip, idx) => (
                    <div key={idx} className="bg-[#f9fafb] border border-[#f3f4f6] rounded-[16px] px-5 py-3 text-[13px] font-medium text-[#4b5563] w-max max-w-[200px] text-left leading-snug break-words">{chip}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center mt-8">
            <button className="text-[14px] font-bold text-red-500 hover:text-red-600 transition-colors" onClick={() => setSegmentDialogOpen(false)}>Delete Segment</button>
            <div className="flex gap-3">
              <Button variant="outline" className="border-[#e5e7eb] text-[#374151] bg-[#f9fafb] rounded-[10px] font-bold px-6 hover:bg-[#f3f4f6] h-10" onClick={() => setSegmentDialogOpen(false)}>Cancel</Button>
              <Button className="bg-[#0d9488] hover:bg-[#0f766e] text-white rounded-[10px] font-bold px-6 h-10 shadow-sm" disabled={savingBuilder || duplicateBuilderName} onClick={handleSaveBuilderSegment}>Save Changes</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

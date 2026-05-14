import { createServerSupabaseClient } from "./supabase-admin";

export type SegmentPreviewCondition = {
  id: string;
  field: "Tier" | "Last Activity" | "Points Balance";
  operator: string;
  value: string;
};

type MemberPreviewRow = {
  id: string;
  memberNumber: string;
  fullName: string;
  email: string;
  tier: string;
  pointsBalance: number;
  lastActivityAt: string | null;
};

type RawMemberRow = {
  id?: string | number | null;
  member_number?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  tier?: string | null;
  points_balance?: number | null;
  last_activity_at?: string | null;
  effective_segment?: string | null;
};

type MemberSegmentRow = {
  member_id?: string | number | null;
  member_number?: string | null;
  effective_segment?: string | null;
  last_activity_at?: string | null;
};

async function fetchMemberRows() {
  const supabase = createServerSupabaseClient();
  const membersResult = await supabase
    .from("loyalty_members")
    .select("id,member_number,first_name,last_name,email,tier,points_balance")
    .limit(1000);

  if (membersResult.error) throw membersResult.error;

  const segmentsResult = await supabase.rpc("loyalty_member_segments");
  if (segmentsResult.error) throw segmentsResult.error;

  const segmentById = new Map<string, MemberSegmentRow>();
  const segmentByNumber = new Map<string, MemberSegmentRow>();
  for (const row of (segmentsResult.data || []) as MemberSegmentRow[]) {
    const memberId = String(row.member_id ?? "").trim();
    const memberNumber = String(row.member_number ?? "").trim();
    if (memberId) segmentById.set(memberId, row);
    if (memberNumber) segmentByNumber.set(memberNumber, row);
  }

  return ((membersResult.data || []) as RawMemberRow[]).map((row) => {
    const segmentRow =
      segmentById.get(String(row.id ?? "").trim()) ||
      segmentByNumber.get(String(row.member_number ?? "").trim());

    return {
      ...row,
      last_activity_at: segmentRow?.last_activity_at ?? null,
      effective_segment: segmentRow?.effective_segment ?? null,
    };
  });
}

function daysSince(value?: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((Date.now() - parsed) / (1000 * 60 * 60 * 24)));
}

function matchesCondition(member: RawMemberRow, condition: SegmentPreviewCondition) {
  const normalizedValue = condition.value.trim();

  if (condition.field === "Tier") {
    const memberTier = String(member.tier || "").trim().toLowerCase();
    const expectedTier = normalizedValue.toLowerCase();
    if (condition.operator === "is not") {
      return memberTier !== expectedTier;
    }
    return memberTier === expectedTier;
  }

  if (condition.field === "Last Activity") {
    const threshold = Math.max(0, Number(normalizedValue) || 0);
    const inactiveDays = daysSince(member.last_activity_at);
    if (condition.operator === "is older than") {
      return inactiveDays > threshold;
    }
    return inactiveDays <= threshold;
  }

  const pointsBalance = Math.max(0, Number(member.points_balance || 0));
  const threshold = Math.max(0, Number(normalizedValue) || 0);

  if (condition.operator === "is above") return pointsBalance > threshold;
  if (condition.operator === "is below") return pointsBalance < threshold;
  return pointsBalance === threshold;
}

export async function previewSegmentAudience(input: {
  logicMode: "AND" | "OR";
  conditions: SegmentPreviewCondition[];
}) {
  const rows = (await fetchMemberRows()).filter((row) => row.id !== undefined && row.member_number);
  const filtered = rows.filter((member) => {
    const results = input.conditions.map((condition) => matchesCondition(member, condition));
    return input.logicMode === "AND" ? results.every(Boolean) : results.some(Boolean);
  });

  return {
    count: filtered.length,
    members: filtered.slice(0, 25).map(
      (row) =>
        ({
          id: String(row.id),
          memberNumber: String(row.member_number || ""),
          fullName: `${String(row.first_name || "")} ${String(row.last_name || "")}`.trim() || "Member",
          email: String(row.email || ""),
          tier: String(row.tier || "Bronze"),
          pointsBalance: Math.max(0, Number(row.points_balance || 0)),
          lastActivityAt: row.last_activity_at ? String(row.last_activity_at) : null,
        }) satisfies MemberPreviewRow,
    ),
  };
}

export async function resolveAudienceMembers(input: {
  segment?: string;
  memberId?: string;
  email?: string;
}) {
  let rows = (await fetchMemberRows()).filter((row) => row.member_number);
  if (input.memberId) {
    rows = rows.filter((row) => String(row.member_number || "").trim() === input.memberId?.trim());
  } else if (input.email) {
    const expectedEmail = input.email.trim().toLowerCase();
    rows = rows.filter((row) => String(row.email || "").trim().toLowerCase() === expectedEmail);
  }
  const normalizedSegment = String(input.segment || "").trim().toLowerCase();

  if (normalizedSegment && !input.memberId && !input.email) {
    rows = rows.filter((row) => {
      if (normalizedSegment === "all members") return true;
      if (normalizedSegment === "inactive 60+ days") return daysSince(row.last_activity_at) >= 60;
      if (normalizedSegment === "high value") return Number(row.points_balance || 0) >= 1000;
      if (normalizedSegment === "active" || normalizedSegment === "at risk" || normalizedSegment === "inactive") {
        return String(row.effective_segment || "").trim().toLowerCase() === normalizedSegment;
      }
      return String(row.tier || "Bronze").trim().toLowerCase() === normalizedSegment;
    });
  }

  return rows.map((row) => ({
    id: String(row.id ?? ""),
    memberNumber: String(row.member_number || ""),
    email: row.email ? String(row.email) : "",
    fullName: `${String(row.first_name || "")} ${String(row.last_name || "")}`.trim() || "Member",
    tier: String(row.tier || "Bronze"),
  }));
}

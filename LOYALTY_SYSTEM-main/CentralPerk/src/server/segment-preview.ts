import { createServerSupabaseClient } from "./supabase-admin";
import { readApiState } from "./local-store";

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
};

function daysSince(value?: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((Date.now() - parsed) / (1000 * 60 * 60 * 24)));
}

function useLocalRuntimeFirst() {
  return (
    process.env.USE_REMOTE_LOYALTY_API !== "true" &&
    (process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH === "true" || process.env.USE_LOCAL_LOYALTY_API === "true")
  );
}

function nameFromMember(memberNumber: string, email: string) {
  if (memberNumber === "MEM-000011" || email.toLowerCase() === "soundwave@example.com") return "Sound Wave";
  const local = email.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  if (!local) return "Demo Member";
  return local.replace(/\b\w/g, (value) => value.toUpperCase());
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

async function previewLocalSegmentAudience(input: {
  logicMode: "AND" | "OR";
  conditions: SegmentPreviewCondition[];
}) {
  const state = await readApiState();
  const rows: RawMemberRow[] = Object.values(state.pointMembers)
    .filter((member) => !member.memberId.includes("{{") && !member.memberId.includes("}}"))
    .map((member) => {
      const email = member.email?.includes("{{") || member.email?.includes("}}") ? "" : member.email || "";
      return {
        id: member.memberId,
        member_number: member.memberId,
        first_name: nameFromMember(member.memberId, email).split(" ")[0] || "Demo",
        last_name: nameFromMember(member.memberId, email).split(" ").slice(1).join(" "),
        email,
        tier: member.tier,
        points_balance: member.pointsBalance,
        last_activity_at: member.history[0]?.date ?? null,
      };
    });

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

export async function previewSegmentAudience(input: {
  logicMode: "AND" | "OR";
  conditions: SegmentPreviewCondition[];
}) {
  if (useLocalRuntimeFirst()) return previewLocalSegmentAudience(input);

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("loyalty_members")
    .select("id,member_number,first_name,last_name,email,tier,points_balance,last_activity_at")
    .limit(1000);

  if (error) return previewLocalSegmentAudience(input);

  const rows = ((data || []) as RawMemberRow[]).filter((row) => row.id !== undefined && row.member_number);
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
  if (useLocalRuntimeFirst()) {
    const state = await readApiState();
    let rows = Object.values(state.pointMembers)
      .filter((member) => !member.memberId.includes("{{") && !member.memberId.includes("}}"))
      .map((member) => {
        const email = member.email?.includes("{{") || member.email?.includes("}}") ? "" : member.email || "";
        return {
          id: member.memberId,
          memberNumber: member.memberId,
          email,
          fullName: nameFromMember(member.memberId, email),
          tier: member.tier,
          pointsBalance: member.pointsBalance,
          lastActivityAt: member.history[0]?.date ?? null,
        };
      });

    if (input.memberId) {
      rows = rows.filter((row) => row.memberNumber === input.memberId?.trim());
    } else if (input.email) {
      rows = rows.filter((row) => row.email.toLowerCase() === input.email?.trim().toLowerCase());
    }

    const normalizedSegment = String(input.segment || "").trim().toLowerCase();
    if (normalizedSegment && !input.memberId && !input.email) {
      rows = rows.filter((row) => {
        if (normalizedSegment === "all members") return true;
        if (normalizedSegment === "inactive 60+ days") return daysSince(row.lastActivityAt) >= 60;
        if (normalizedSegment === "high value") return row.pointsBalance >= 1000;
        return row.tier.toLowerCase() === normalizedSegment;
      });
    }

    return rows.map((row) => ({
      id: row.id,
      memberNumber: row.memberNumber,
      email: row.email,
      fullName: row.fullName,
      tier: row.tier,
    }));
  }

  const supabase = createServerSupabaseClient();
  let query = supabase
    .from("loyalty_members")
    .select("id,member_number,email,first_name,last_name,tier,points_balance,last_activity_at");

  if (input.memberId) {
    query = query.eq("member_number", input.memberId.trim());
  } else if (input.email) {
    query = query.ilike("email", input.email.trim());
  }

  const { data, error } = await query.limit(1000);
  if (error) throw error;

  let rows = ((data || []) as RawMemberRow[]).filter((row) => row.member_number);
  const normalizedSegment = String(input.segment || "").trim().toLowerCase();

  if (normalizedSegment && !input.memberId && !input.email) {
    rows = rows.filter((row) => {
      if (normalizedSegment === "all members") return true;
      if (normalizedSegment === "inactive 60+ days") return daysSince(row.last_activity_at) >= 60;
      if (normalizedSegment === "high value") return Number(row.points_balance || 0) >= 1000;
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

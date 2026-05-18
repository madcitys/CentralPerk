import { serviceBaseUrl } from "./service-proxy";

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
  memberId?: string | number | null;
  member_id?: string | number | null;
  memberNumber?: string | null;
  member_number?: string | null;
  firstName?: string | null;
  first_name?: string | null;
  lastName?: string | null;
  last_name?: string | null;
  email?: string | null;
  tier?: string | null;
  pointsBalance?: number | null;
  points_balance?: number | null;
  lastActivityAt?: string | null;
  last_activity_at?: string | null;
};

function daysSince(value?: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((Date.now() - parsed) / (1000 * 60 * 60 * 24)));
}

function memberNumber(row: RawMemberRow) {
  return String(row.memberNumber ?? row.member_number ?? row.memberId ?? row.member_id ?? row.id ?? "");
}

function firstName(row: RawMemberRow) {
  return String(row.firstName ?? row.first_name ?? "");
}

function lastName(row: RawMemberRow) {
  return String(row.lastName ?? row.last_name ?? "");
}

function pointsBalance(row: RawMemberRow) {
  return Math.max(0, Number(row.pointsBalance ?? row.points_balance ?? 0));
}

function lastActivityAt(row: RawMemberRow) {
  return row.lastActivityAt || row.last_activity_at ? String(row.lastActivityAt ?? row.last_activity_at) : null;
}

function matchesCondition(member: RawMemberRow, condition: SegmentPreviewCondition) {
  const normalizedValue = condition.value.trim();

  if (condition.field === "Tier") {
    const memberTier = String(member.tier || "").trim().toLowerCase();
    const expectedTier = normalizedValue.toLowerCase();
    if (condition.operator === "is not") return memberTier !== expectedTier;
    return memberTier === expectedTier;
  }

  if (condition.field === "Last Activity") {
    const threshold = Math.max(0, Number(normalizedValue) || 0);
    const inactiveDays = daysSince(lastActivityAt(member));
    if (condition.operator === "is older than") return inactiveDays > threshold;
    return inactiveDays <= threshold;
  }

  const threshold = Math.max(0, Number(normalizedValue) || 0);
  const balance = pointsBalance(member);
  if (condition.operator === "is above") return balance > threshold;
  if (condition.operator === "is below") return balance < threshold;
  return balance === threshold;
}

async function loadMembers() {
  const response = await fetch(`${serviceBaseUrl("MEMBER_SERVICE_URL", "http://127.0.0.1:4003")}/members?limit=5000`, {
    headers: { accept: "application/json" },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload?.error === "string"
        ? payload.error
        : typeof payload?.error?.message === "string"
          ? payload.error.message
          : `Member service failed (${response.status}).`;
    throw new Error(message);
  }
  return (Array.isArray(payload?.members) ? payload.members : []) as RawMemberRow[];
}

function toPreviewRow(row: RawMemberRow): MemberPreviewRow {
  const number = memberNumber(row);
  return {
    id: String(row.id ?? row.memberId ?? row.member_id ?? ""),
    memberNumber: number,
    fullName: `${firstName(row)} ${lastName(row)}`.trim() || number || "Member",
    email: String(row.email ?? ""),
    tier: String(row.tier || "Bronze"),
    pointsBalance: pointsBalance(row),
    lastActivityAt: lastActivityAt(row),
  };
}

export async function previewSegmentAudience(input: {
  logicMode: "AND" | "OR";
  conditions: SegmentPreviewCondition[];
}) {
  const rows = (await loadMembers()).filter((row) => row.id !== undefined && memberNumber(row));
  const filtered = rows.filter((member) => {
    const results = input.conditions.map((condition) => matchesCondition(member, condition));
    return input.logicMode === "AND" ? results.every(Boolean) : results.some(Boolean);
  });

  return {
    count: filtered.length,
    members: filtered.slice(0, 25).map(toPreviewRow),
  };
}

export async function resolveAudienceMembers(input: {
  segment?: string;
  memberId?: string;
  email?: string;
}) {
  let rows = (await loadMembers()).filter((row) => memberNumber(row));
  const targetMemberId = input.memberId?.trim().toLowerCase();
  const targetEmail = input.email?.trim().toLowerCase();

  if (targetMemberId) {
    rows = rows.filter((row) => memberNumber(row).toLowerCase() === targetMemberId);
  } else if (targetEmail) {
    rows = rows.filter((row) => String(row.email || "").trim().toLowerCase() === targetEmail);
  }

  const normalizedSegment = String(input.segment || "").trim().toLowerCase();
  if (normalizedSegment && !input.memberId && !input.email) {
    rows = rows.filter((row) => {
      if (normalizedSegment === "all members") return true;
      if (normalizedSegment === "inactive 60+ days") return daysSince(lastActivityAt(row)) >= 60;
      if (normalizedSegment === "high value") return pointsBalance(row) >= 1000;
      return String(row.tier || "Bronze").trim().toLowerCase() === normalizedSegment;
    });
  }

  return rows.map((row) => {
    const preview = toPreviewRow(row);
    return {
      id: preview.id,
      memberNumber: preview.memberNumber,
      email: preview.email,
      fullName: preview.fullName,
      tier: preview.tier,
    };
  });
}

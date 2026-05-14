import { config } from "./config.js";
import type { Member, SupportedTier } from "./core/types.js";

function memberServiceUrl(path: string) {
  return `${config.memberServiceUrl.replace(/\/+$/, "")}${path}`;
}

function mapMember(row: any): Member {
  const tier = String(row.tier || "Bronze");
  return {
    id: Number(row.id ?? row.memberId ?? row.member_id),
    member_number: String(row.memberNumber ?? row.member_number ?? row.memberIdentifier ?? ""),
    email: row.email ? String(row.email) : null,
    points_balance: Math.max(0, Math.floor(Number(row.pointsBalance ?? row.points_balance ?? 0))),
    tier: ["Bronze", "Silver", "Gold"].includes(tier) ? (tier as SupportedTier) : "Bronze",
  };
}

export async function findMemberViaMemberService(identifier: string, fallbackEmail?: string): Promise<Member | null> {
  const params = new URLSearchParams({ identifier });
  if (fallbackEmail) params.set("fallbackEmail", fallbackEmail);

  const response = await fetch(memberServiceUrl(`/members/resolve?${params.toString()}`), {
    headers: { Accept: "application/json" },
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`member-service lookup failed with status ${response.status}`);
  }

  const payload = await response.json();
  const member = payload?.member ?? payload;
  if (!member) return null;
  return mapMember(member);
}

export async function updateMemberBalanceViaMemberService(memberId: number, pointsBalance: number, tier: string) {
  const response = await fetch(memberServiceUrl(`/members/${encodeURIComponent(String(memberId))}/points-balance`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ pointsBalance, tier }),
  });

  if (!response.ok) {
    throw new Error(`member-service balance update failed with status ${response.status}`);
  }
}

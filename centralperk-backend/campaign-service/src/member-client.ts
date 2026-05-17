import { config } from "./config.js";

function memberServiceUrl(path: string) {
  return `${config.memberServiceUrl.replace(/\/+$/, "")}${path}`;
}

export async function findMemberIdViaMemberService(memberIdentifier: string, fallbackEmail?: string): Promise<number | null> {
  const params = new URLSearchParams({ identifier: memberIdentifier });
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
  const id = Number(member?.id ?? member?.memberId ?? member?.member_id);
  return Number.isFinite(id) ? id : null;
}

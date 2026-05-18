import { HttpError } from "./http-error";
import { serviceBaseUrl } from "./service-proxy";
import type { VoucherRecord } from "./voucher-types";

function rewardServiceUrl(path: string) {
  return `${serviceBaseUrl("REWARD_SERVICE_URL", "http://127.0.0.1:4006")}${path}`;
}

function messageFromPayload(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === "string") return error;
    if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") {
      return (error as { message: string }).message;
    }
    if (typeof (payload as { message?: unknown }).message === "string") return (payload as { message: string }).message;
  }
  return fallback;
}

async function requestRewardService<T>(path: string, init?: RequestInit) {
  const response = await fetch(rewardServiceUrl(path), {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new HttpError(response.status, messageFromPayload(payload, `Reward service failed (${response.status}).`));
  }
  return payload as T;
}

export async function listVoucherRecords(input: {
  memberId?: string;
  memberEmail?: string;
}) {
  const params = new URLSearchParams();
  if (input.memberId?.trim()) params.set("memberId", input.memberId.trim());
  if (input.memberEmail?.trim()) params.set("email", input.memberEmail.trim());

  const payload = await requestRewardService<{ ok: true; vouchers: VoucherRecord[] }>(
    `/vouchers${params.toString() ? `?${params.toString()}` : ""}`,
  );
  return payload.vouchers ?? [];
}

export async function createVoucherRecord(input: VoucherRecord) {
  const payload = await requestRewardService<{ ok: true; voucher: VoucherRecord }>("/vouchers", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return payload.voucher;
}

export async function getVoucherRecord(voucherId: string) {
  try {
    const payload = await requestRewardService<{ ok: true; voucher: VoucherRecord }>(`/vouchers/${encodeURIComponent(voucherId)}`);
    return payload.voucher;
  } catch (error) {
    if (error instanceof HttpError && error.statusCode === 404) return null;
    throw error;
  }
}

export async function validateVoucherRecord(input: {
  voucherId: string;
  voucherCode: string;
}) {
  const payload = await requestRewardService<{ ok: true; voucher: VoucherRecord }>(`/vouchers/${encodeURIComponent(input.voucherId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      action: "validate",
      voucherCode: input.voucherCode,
    }),
  });
  return payload.voucher;
}

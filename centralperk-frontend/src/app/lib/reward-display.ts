const TEST_REWARD_PATTERN = /\bapi\s*test\s*reward\b/i;
const SYNTHETIC_COPY_PATTERN = /synthetic reward|contract and load testing/i;

export const PHARMACY_FALLBACK_IMAGE =
  "/assets/rewards/mercury-med-voucher.svg";

export function isTestRewardName(value?: string | null) {
  return TEST_REWARD_PATTERN.test(String(value || ""));
}

export function normalizeRewardDisplayName(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "Medicine Voucher";
  return isTestRewardName(raw) ? "Mercury Med Voucher" : raw;
}

export function normalizeRewardDescription(name?: string | null, description?: string | null) {
  const rawDescription = String(description || "").trim();
  if (isTestRewardName(name) || SYNTHETIC_COPY_PATTERN.test(rawDescription)) {
    return "Redeem this voucher for eligible pharmacy medicine purchases, counter pickup, or same-day delivery.";
  }
  return rawDescription;
}

export function normalizeRewardImageUrl(name?: string | null, imageUrl?: string | null) {
  const rawImageUrl = String(imageUrl || "").trim();
  if (rawImageUrl) return rawImageUrl;
  return isTestRewardName(name) ? PHARMACY_FALLBACK_IMAGE : undefined;
}

export function normalizeTransactionDescription(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "Reward transaction";
  return raw.replace(TEST_REWARD_PATTERN, "Mercury Med Voucher").replace(/\s+/g, " ").trim();
}

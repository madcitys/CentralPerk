import * as repo from "./repo.js";
import type {
  Campaign,
  CampaignInput,
  MultiplierLookupInput,
  MultiplierLookupResult,
  VariantAssignment,
} from "./types.js";

type Repo = typeof repo;
let currentRepo: Repo = repo;

export function setRepo(r: Repo) {
  currentRepo = r;
}

export async function saveCampaign(input: CampaignInput): Promise<Campaign> {
  return currentRepo.upsertCampaign(input);
}

export async function getCampaigns(): Promise<Campaign[]> {
  return currentRepo.listCampaigns();
}

export async function getCampaign(campaignId: string): Promise<Campaign | null> {
  return currentRepo.getCampaignById(campaignId);
}

export async function getActive(): Promise<Campaign[]> {
  return currentRepo.getActiveCampaigns();
}

export async function publishCampaign(campaignId: string): Promise<Campaign> {
  return currentRepo.publishCampaign(campaignId);
}

export async function assignMemberVariant(
  campaignId: string,
  memberIdentifier: string,
  fallbackEmail?: string
): Promise<VariantAssignment> {
  const memberId = await currentRepo.findMemberId(memberIdentifier, fallbackEmail);
  if (!memberId) throw new Error("Member not found for variant assignment.");
  return currentRepo.assignVariant(campaignId, memberId);
}

export async function lookupActiveMultiplier(input: MultiplierLookupInput): Promise<MultiplierLookupResult> {
  const result = await currentRepo.lookupMultiplier(input);
  if (result.active && result.campaignId) {
    await currentRepo.trackBudgetConsumption(result.campaignId, result.bonusPoints);
  }
  return result;
}

export async function queueCampaignNotifications(campaignId: string) {
  return currentRepo.queueCampaignNotifications(campaignId);
}

export async function loadPerformance() {
  return currentRepo.loadCampaignPerformance();
}

export async function getBudgetStatus(campaignId: string) {
  return currentRepo.getCampaignBudgetStatus(campaignId);
}

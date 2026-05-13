import * as repo from "./repo.js";
let currentRepo = repo;
export function setRepo(r) {
    currentRepo = r;
}
export async function saveCampaign(input) {
    return currentRepo.upsertCampaign(input);
}
export async function getCampaigns() {
    return currentRepo.listCampaigns();
}
export async function getCampaign(campaignId) {
    return currentRepo.getCampaignById(campaignId);
}
export async function getActive() {
    return currentRepo.getActiveCampaigns();
}
export async function publishCampaign(campaignId) {
    return currentRepo.publishCampaign(campaignId);
}
export async function pauseCampaign(campaignId) {
    return currentRepo.pauseCampaign(campaignId);
}
export async function assignMemberVariant(campaignId, memberIdentifier, fallbackEmail) {
    const memberId = await currentRepo.findMemberId(memberIdentifier, fallbackEmail);
    if (!memberId)
        throw new Error("Member not found for variant assignment.");
    return currentRepo.assignVariant(campaignId, memberId);
}
export async function lookupActiveMultiplier(input) {
    const result = await currentRepo.lookupMultiplier(input);
    if (result.active && result.campaignId) {
        await currentRepo.trackBudgetConsumption(result.campaignId, result.bonusPoints);
    }
    return result;
}
export async function queueCampaignNotifications(campaignId) {
    return currentRepo.queueCampaignNotifications(campaignId);
}
export async function loadPerformance() {
    return currentRepo.loadCampaignPerformance();
}
export async function getBudgetStatus(campaignId) {
    return currentRepo.getCampaignBudgetStatus(campaignId);
}
export async function declareCampaignWinner(campaignId, scores) {
    return currentRepo.declareWinner(campaignId, scores);
}

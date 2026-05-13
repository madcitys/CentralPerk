import { resolveTier } from "./core/utils.js";
const defaultTierRules = [
    { tier_label: "Gold", min_points: 750, is_active: true },
    { tier_label: "Silver", min_points: 250, is_active: true },
    { tier_label: "Bronze", min_points: 0, is_active: true },
];
const membersById = new Map();
const memberKeys = new Map();
const ledgerEntries = [];
let activeTierRules = defaultTierRules.map((rule) => ({ ...rule }));
let nextMemberId = 1;
let nextLedgerId = 1;
function normalizeKey(value) {
    return String(value || "").trim().toLowerCase();
}
function linkMemberKeys(member) {
    const candidates = [member.member_number, member.email, String(member.id)];
    for (const candidate of candidates) {
        const key = normalizeKey(candidate);
        if (key)
            memberKeys.set(key, member.id);
    }
}
function createMember(identifier, fallbackEmail, pointsBalance = 0, tier = "Bronze") {
    const member = {
        id: nextMemberId++,
        member_number: identifier.trim() || `LOCAL-${nextMemberId}`,
        email: fallbackEmail ?? null,
        points_balance: Math.max(0, Math.floor(pointsBalance)),
        tier,
    };
    membersById.set(member.id, member);
    linkMemberKeys(member);
    return member;
}
function getOrCreateMember(identifier, fallbackEmail) {
    const keys = [normalizeKey(identifier), normalizeKey(fallbackEmail)];
    for (const key of keys) {
        if (!key)
            continue;
        const memberId = memberKeys.get(key);
        if (memberId) {
            const member = membersById.get(memberId);
            if (member)
                return member;
        }
    }
    return createMember(identifier, fallbackEmail);
}
function updateMember(member, balance, tier) {
    member.points_balance = Math.max(0, Math.floor(balance));
    member.tier = tier;
    membersById.set(member.id, member);
    linkMemberKeys(member);
}
function createLedgerEntry(member, changeType, pointsDelta, reason, expiryDate) {
    const entry = {
        id: nextLedgerId++,
        member_id: member.id,
        change_type: changeType,
        points_delta: pointsDelta,
        balance_after: member.points_balance,
        reason,
        expiry_date: expiryDate ?? null,
        created_at: new Date().toISOString(),
        remaining_points: pointsDelta > 0 ? pointsDelta : undefined,
        expired: false,
    };
    ledgerEntries.push(entry);
    return entry;
}
function cloneLedgerEntry(entry) {
    const { remaining_points: _remaining, expired: _expired, ...rest } = entry;
    return { ...rest };
}
export const memoryRepo = {
    async findMember(identifier, fallbackEmail) {
        return getOrCreateMember(identifier, fallbackEmail);
    },
    async fetchTierRules() {
        return activeTierRules.map((rule) => ({ ...rule }));
    },
    async saveTierRules(rules) {
        activeTierRules = rules.map((rule) => ({ ...rule }));
    },
    async insertAward(member, input, newBalance, newTier) {
        updateMember(member, newBalance, newTier);
        const entry = createLedgerEntry(member, input.transactionType, Math.max(0, Math.floor(input.points)), input.reason, input.transactionType === "PURCHASE"
            ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
            : null);
        return cloneLedgerEntry(entry);
    },
    async insertRedemption(member, input, newBalance, newTier) {
        updateMember(member, newBalance, newTier);
        const entry = createLedgerEntry(member, input.transactionType ?? "REDEEM", -Math.abs(Math.floor(input.points)), input.reason, null);
        return cloneLedgerEntry(entry);
    },
    async runExpiryJob() {
        const now = Date.now();
        let pointsExpired = 0;
        let membersProcessed = 0;
        const processed = new Set();
        for (const entry of ledgerEntries) {
            const remaining = Number(entry.remaining_points ?? 0);
            if (remaining <= 0 || entry.expired || !entry.expiry_date)
                continue;
            if (new Date(entry.expiry_date).getTime() > now)
                continue;
            const member = membersById.get(entry.member_id);
            if (!member)
                continue;
            const expiringPoints = Math.min(remaining, member.points_balance);
            if (expiringPoints <= 0) {
                entry.expired = true;
                entry.remaining_points = 0;
                continue;
            }
            processed.add(member.id);
            pointsExpired += expiringPoints;
            entry.expired = true;
            entry.remaining_points = Math.max(0, remaining - expiringPoints);
            const newBalance = Math.max(0, member.points_balance - expiringPoints);
            const newTier = resolveTier(newBalance, activeTierRules);
            updateMember(member, newBalance, newTier);
            createLedgerEntry(member, "EXPIRY_DEDUCTION", -expiringPoints, "Nightly expiry run", null);
        }
        membersProcessed = processed.size;
        return { membersProcessed, pointsExpired };
    },
};
export function resetMemoryStore() {
    membersById.clear();
    memberKeys.clear();
    ledgerEntries.length = 0;
    activeTierRules = defaultTierRules.map((rule) => ({ ...rule }));
    nextMemberId = 1;
    nextLedgerId = 1;
}
export function seedMemoryMember(input) {
    const member = createMember(input.memberIdentifier, input.fallbackEmail, input.pointsBalance ?? 0, input.tier ?? resolveTier(input.pointsBalance ?? 0, activeTierRules));
    return { ...member };
}
export function seedMemoryLedgerEntry(input) {
    const member = getOrCreateMember(input.memberIdentifier, input.fallbackEmail);
    const nextBalance = Math.max(0, member.points_balance + input.pointsDelta);
    updateMember(member, nextBalance, resolveTier(nextBalance, activeTierRules));
    const entry = createLedgerEntry(member, input.changeType, Math.trunc(input.pointsDelta), input.reason, input.expiryDate ?? null);
    if (input.createdAt)
        entry.created_at = input.createdAt;
    if (input.pointsDelta > 0) {
        entry.remaining_points = Math.trunc(input.pointsDelta);
    }
    return cloneLedgerEntry(entry);
}
export function setMemoryTierRules(rules) {
    activeTierRules = rules.map((rule) => ({ ...rule }));
}
export function getMemoryMember(identifier, fallbackEmail) {
    const keys = [normalizeKey(identifier), normalizeKey(fallbackEmail)];
    for (const key of keys) {
        if (!key)
            continue;
        const memberId = memberKeys.get(key);
        if (!memberId)
            continue;
        const member = membersById.get(memberId);
        if (member)
            return { ...member };
    }
    return null;
}
export function listMemoryMembers() {
    return Array.from(membersById.values()).map((member) => ({ ...member }));
}
export function listMemoryLedger() {
    return ledgerEntries.map((entry) => cloneLedgerEntry(entry));
}
export function memoryTierFor(points) {
    return resolveTier(points, activeTierRules);
}

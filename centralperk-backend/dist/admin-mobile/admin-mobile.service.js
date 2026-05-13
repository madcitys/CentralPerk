"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminMobileService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const utils_1 = require("../common/utils");
const local_runtime_service_1 = require("../local-runtime/local-runtime.service");
const SUPPORTED_TIERS = ["Bronze", "Silver", "Gold"];
const DAY_MS = 86_400_000;
const DEFAULT_SETTINGS = {
    tiers: [
        { tier_label: "Bronze", min_points: 0, is_active: true },
        { tier_label: "Silver", min_points: 250, is_active: true },
        { tier_label: "Gold", min_points: 750, is_active: true },
    ],
    earningRules: [
        { tier_label: "Bronze", peso_per_point: 10, multiplier: 1, is_active: true },
        { tier_label: "Silver", peso_per_point: 10, multiplier: 1.25, is_active: true },
        { tier_label: "Gold", peso_per_point: 10, multiplier: 1.5, is_active: true },
    ],
    birthdaySettings: {
        amounts: {
            Bronze: 100,
            Silver: 500,
            Gold: 1000,
        },
        releaseTiming: "first_day_of_birthday_month",
        fulfillmentMode: "auto_credit",
        claimWindow: "birthday_month_only",
    },
};
const DEFAULT_NOTIFICATION_TEMPLATES = [
    { id: "tmpl-birthday", name: "Birthday Reward", trigger: "Birthday", message: "Your birthday health reward voucher is ready." },
    { id: "tmpl-winback", name: "Win-back Offer", trigger: "Inactivity", message: "We miss you. A return offer is waiting in your app." },
    { id: "tmpl-tier", name: "Tier Upgrade", trigger: "Tier Upgrade", message: "You unlocked a new membership tier." },
];
function monthKey(value) {
    const date = value ? new Date(value) : new Date();
    if (!Number.isFinite(date.getTime()))
        return "";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabels(count = 6) {
    const now = new Date();
    return Array.from({ length: count }).map((_, index) => {
        const date = new Date(now.getFullYear(), now.getMonth() - (count - index - 1), 1);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        return {
            key,
            label: date.toLocaleDateString("en-PH", { month: "short" }),
        };
    });
}
function historyDate(row) {
    return new Date(String(row.date || (0, utils_1.nowIso)()));
}
function lastActivity(member) {
    return (member.history || [])
        .map(historyDate)
        .filter((value) => Number.isFinite(value.getTime()))
        .sort((left, right) => right.getTime() - left.getTime())[0] || null;
}
function daysSince(date) {
    if (!date)
        return 999;
    return Math.max(0, Math.floor((Date.now() - date.getTime()) / DAY_MS));
}
function activeRateFor(members) {
    if (!members.length)
        return 0;
    const active = members.filter((member) => daysSince(lastActivity(member)) <= 30).length;
    return Number(((active / members.length) * 100).toFixed(1));
}
function arrayFromState(state, key) {
    return Array.isArray(state[key]) ? [...state[key]] : [];
}
function defaultChallenges() {
    return [
        {
            id: "challenge-streak",
            name: "Seven-Day Wellness Check-in",
            description: "Complete seven pharmacy rewards check-ins to unlock a bonus perk.",
            participants: 84,
            completions: 27,
            reward: "120 bonus points",
            status: "live",
            createdAt: (0, utils_1.nowIso)(),
        },
    ];
}
let AdminMobileService = class AdminMobileService {
    runtime;
    constructor(runtime) {
        this.runtime = runtime;
    }
    memberDisplayName(member) {
        const first = (0, utils_1.cleanString)(member.firstName);
        const last = (0, utils_1.cleanString)(member.lastName);
        const full = `${first} ${last}`.trim();
        if (full)
            return full;
        return (0, utils_1.cleanString)(member.email).split("@")[0] || member.memberNumber || member.memberId;
    }
    settingsFromState(state) {
        const current = state.adminSettings || {};
        return {
            ...DEFAULT_SETTINGS,
            ...current,
            tiers: Array.isArray(current.tiers) && current.tiers.length ? current.tiers : DEFAULT_SETTINGS.tiers,
            earningRules: Array.isArray(current.earningRules) && current.earningRules.length
                ? current.earningRules
                : DEFAULT_SETTINGS.earningRules,
            birthdaySettings: {
                ...DEFAULT_SETTINGS.birthdaySettings,
                ...(current.birthdaySettings || {}),
                amounts: {
                    ...DEFAULT_SETTINGS.birthdaySettings.amounts,
                    ...((current.birthdaySettings?.amounts || {})),
                },
            },
            source: "local_runtime",
        };
    }
    buildShareEvents(members) {
        if (!members.length)
            return [];
        return members.slice(0, 6).map((member, index) => ({
            id: `share-${member.memberId}-${index}`,
            memberId: member.memberId,
            memberName: this.memberDisplayName(member),
            channel: index % 2 === 0 ? "facebook" : "instagram",
            achievement: index % 2 === 0 ? "Tier unlock shared" : "Reward redeemed shared",
            conversions: Math.max(0, 3 - index),
            tier: member.tier,
            createdAt: new Date(Date.now() - index * DAY_MS).toISOString(),
        }));
    }
    buildReferrals(members) {
        return members.slice(0, 8).map((member, index) => ({
            id: `ref-${member.memberId}-${index}`,
            memberId: member.memberId,
            memberName: this.memberDisplayName(member),
            referralCode: `CP-${String(index + 1).padStart(4, "0")}`,
            referralsCount: 2 + (index % 3),
            conversions: 1 + (index % 2),
            createdAt: new Date(Date.now() - index * DAY_MS * 2).toISOString(),
        }));
    }
    buildFeedback(members) {
        return members.slice(0, 8).map((member, index) => ({
            id: `feedback-${member.memberId}-${index}`,
            memberId: member.memberId,
            memberName: this.memberDisplayName(member),
            rating: 5 - (index % 3),
            summary: index % 2 === 0 ? "Likes flash sales and instant redemptions." : "Wants more food rewards.",
            createdAt: new Date(Date.now() - index * DAY_MS * 3).toISOString(),
        }));
    }
    buildLeaderboard(members) {
        return [...members]
            .sort((left, right) => (0, utils_1.numberValue)(right.pointsBalance) - (0, utils_1.numberValue)(left.pointsBalance))
            .slice(0, 5)
            .map((member, index) => ({
            id: `leader-${member.memberId}`,
            rank: index + 1,
            memberId: member.memberId,
            memberName: this.memberDisplayName(member),
            points: member.pointsBalance,
            tier: member.tier,
        }));
    }
    async pointsSnapshot() {
        return {
            ok: true,
            snapshot: {
                members: await this.runtime.snapshotPoints(),
            },
            source: "local_runtime",
        };
    }
    async mobileSummary(from, to) {
        const members = await this.runtime.snapshotPoints();
        const rangeFrom = from ? new Date(from) : new Date(Date.now() - 180 * DAY_MS);
        const rangeTo = to ? new Date(to) : new Date();
        rangeTo.setHours(23, 59, 59, 999);
        const allHistory = members.flatMap((member) => member.history || []);
        const ranged = allHistory.filter((row) => {
            const date = historyDate(row);
            return date.getTime() >= rangeFrom.getTime() && date.getTime() <= rangeTo.getTime();
        });
        const earnedPoints = ranged.filter((row) => (0, utils_1.numberValue)(row.points) > 0).reduce((sum, row) => sum + (0, utils_1.numberValue)(row.points), 0);
        const redeemedPoints = Math.abs(ranged.filter((row) => (0, utils_1.numberValue)(row.points) < 0).reduce((sum, row) => sum + (0, utils_1.numberValue)(row.points), 0));
        const totalPoints = members.reduce((sum, member) => sum + (0, utils_1.numberValue)(member.pointsBalance), 0);
        const clvTotal = members.reduce((sum, member) => {
            const earned = (member.history || [])
                .filter((row) => (0, utils_1.numberValue)(row.points) > 0)
                .reduce((inner, row) => inner + (0, utils_1.numberValue)(row.points), 0);
            return sum + earned * 0.75 + (0, utils_1.numberValue)(member.pointsBalance) * 0.35;
        }, 0);
        const activeRate = activeRateFor(members);
        const score = Math.round(Math.min(100, activeRate * 0.5 + (members.length ? 50 : 0)));
        const clvTrend = monthLabels().map(({ key, label }) => {
            const value = members.reduce((sum, member) => {
                const monthlyEarned = (member.history || [])
                    .filter((row) => (0, utils_1.numberValue)(row.points) > 0 && monthKey(row.date) === key)
                    .reduce((inner, row) => inner + (0, utils_1.numberValue)(row.points), 0);
                return sum + monthlyEarned * 0.75;
            }, 0);
            return { label, value: Math.round(value) };
        });
        const liabilityTrend = monthLabels().map(({ key, label }) => ({
            label,
            points: Math.round(members.reduce((sum, member) => {
                const net = (member.history || [])
                    .filter((row) => monthKey(row.date) === key)
                    .reduce((inner, row) => inner + (0, utils_1.numberValue)(row.points), 0);
                return sum + Math.max(0, net);
            }, 0)),
        }));
        const churn = members.reduce((acc, member) => {
            const inactiveDays = daysSince(lastActivity(member));
            if (inactiveDays > 90)
                acc.highRiskMembers += 1;
            else if (inactiveDays > 60)
                acc.mediumRiskMembers += 1;
            else
                acc.lowRiskMembers += 1;
            return acc;
        }, { highRiskMembers: 0, mediumRiskMembers: 0, lowRiskMembers: 0 });
        return {
            ok: true,
            source: "local_runtime",
            summary: {
                programHealth: {
                    totalMembers: members.length,
                    activeRate,
                    score,
                    earnedPoints,
                    redeemedPoints,
                },
                clv: {
                    total: Number(clvTotal.toFixed(2)),
                    average: members.length ? Number((clvTotal / members.length).toFixed(2)) : 0,
                    projectedAverage: members.length ? Number(((clvTotal / members.length) * 1.1).toFixed(2)) : 0,
                    trend: clvTrend,
                },
                churnRisk: {
                    ...churn,
                    segments: [
                        { label: "High", value: churn.highRiskMembers },
                        { label: "Medium", value: churn.mediumRiskMembers },
                        { label: "Low", value: churn.lowRiskMembers },
                    ],
                },
                pointsLiability: {
                    points: totalPoints,
                    monetary: Number((totalPoints * 0.12).toFixed(2)),
                    trend: liabilityTrend,
                },
            },
        };
    }
    async engagementSummary() {
        const state = await this.runtime.read();
        const members = await this.runtime.snapshotPoints();
        const notificationCampaigns = arrayFromState(state, "notificationCampaigns");
        const surveys = arrayFromState(state, "surveys");
        const winBackCampaigns = arrayFromState(state, "winBackCampaigns");
        const challenges = arrayFromState(state, "challenges");
        const shareEvents = arrayFromState(state, "shareEvents");
        const referrals = arrayFromState(state, "referrals");
        const feedback = arrayFromState(state, "feedback");
        const leaderboard = arrayFromState(state, "challengeLeaderboard");
        return {
            ok: true,
            source: "local_runtime",
            notificationCampaigns: notificationCampaigns.length ? notificationCampaigns : [
                {
                    id: "notif-birthday-push",
                    name: "Birthday Loyalty Push",
                    segment: "All Members",
                    trigger: "Birthday",
                    scheduledFor: new Date(Date.now() + DAY_MS).toISOString(),
                    sentCount: 0,
                    deliveredCount: 0,
                    openedCount: 0,
                    status: "scheduled",
                    variantA: "Celebrate your day with a birthday reward waiting in the app.",
                    variantB: "Birthday perk unlocked. Redeem your member surprise today.",
                    createdAt: (0, utils_1.nowIso)(),
                },
            ],
            notificationTemplates: DEFAULT_NOTIFICATION_TEMPLATES,
            challenges: challenges.length ? challenges : defaultChallenges(),
            challengeLeaderboard: leaderboard.length ? leaderboard : this.buildLeaderboard(members),
            shareEvents: shareEvents.length ? shareEvents : this.buildShareEvents(members),
            surveys,
            winBackCampaigns,
            referrals: referrals.length ? referrals : this.buildReferrals(members),
            feedback: feedback.length ? feedback : this.buildFeedback(members),
        };
    }
    async notificationCampaigns() {
        const summary = await this.engagementSummary();
        return { ok: true, notificationCampaigns: summary.notificationCampaigns };
    }
    async createNotificationCampaign(input) {
        const created = await this.runtime.update((state) => {
            const campaigns = arrayFromState(state, "notificationCampaigns");
            const row = {
                id: (0, utils_1.cleanString)(input.id) || `notif-cmp-${(0, crypto_1.randomUUID)()}`,
                name: (0, utils_1.cleanString)(input.name) || "Notification Campaign",
                segment: (0, utils_1.cleanString)(input.segment) || "All Members",
                trigger: (0, utils_1.cleanString)(input.trigger) || "Manual",
                scheduledFor: (0, utils_1.cleanString)(input.scheduledFor) || new Date(Date.now() + DAY_MS).toISOString(),
                sentCount: Math.max(0, Math.floor((0, utils_1.numberValue)(input.sentCount, 0))),
                deliveredCount: Math.max(0, Math.floor((0, utils_1.numberValue)(input.deliveredCount, 0))),
                openedCount: Math.max(0, Math.floor((0, utils_1.numberValue)(input.openedCount, 0))),
                audienceSize: Math.max(0, Math.floor((0, utils_1.numberValue)(input.audienceSize, 0))),
                status: (0, utils_1.cleanString)(input.status) || "scheduled",
                variantA: (0, utils_1.cleanString)(input.variantA) || "",
                variantB: (0, utils_1.cleanString)(input.variantB) || "",
                createdAt: (0, utils_1.nowIso)(),
            };
            state.notificationCampaigns = [row, ...campaigns];
            return row;
        });
        return { ok: true, campaign: created };
    }
    async launchNotificationCampaign(id) {
        const campaign = await this.runtime.update((state) => {
            const campaigns = arrayFromState(state, "notificationCampaigns");
            const row = campaigns.find((entry) => (0, utils_1.cleanString)(entry.id) === (0, utils_1.cleanString)(id));
            if (!row)
                throw new common_1.NotFoundException("Notification campaign not found.");
            row.status = "live";
            row.launchedAt = (0, utils_1.nowIso)();
            row.sentCount = Math.max((0, utils_1.numberValue)(row.sentCount, 0), (0, utils_1.numberValue)(row.audienceSize, 0));
            row.deliveredCount = Math.max((0, utils_1.numberValue)(row.deliveredCount, 0), Math.round((0, utils_1.numberValue)(row.sentCount, 0) * 0.92));
            row.openedCount = Math.max((0, utils_1.numberValue)(row.openedCount, 0), Math.round((0, utils_1.numberValue)(row.deliveredCount, 0) * 0.48));
            state.notificationCampaigns = campaigns;
            return row;
        });
        return { ok: true, campaign };
    }
    async surveys() {
        const state = await this.runtime.read();
        return { ok: true, surveys: arrayFromState(state, "surveys") };
    }
    async createSurvey(input) {
        const survey = await this.runtime.update((state) => {
            const surveys = arrayFromState(state, "surveys");
            const row = {
                id: (0, utils_1.cleanString)(input.id) || `survey-${(0, crypto_1.randomUUID)()}`,
                title: (0, utils_1.cleanString)(input.title) || "Member Survey",
                description: (0, utils_1.cleanString)(input.description) || "",
                segment: (0, utils_1.cleanString)(input.segment) || "All Members",
                bonusPoints: Math.max(0, Math.floor((0, utils_1.numberValue)(input.bonusPoints, 0))),
                status: (0, utils_1.cleanString)(input.status) || "draft",
                questions: Array.isArray(input.questions) ? input.questions : [],
                responses: [],
                createdAt: (0, utils_1.nowIso)(),
            };
            state.surveys = [row, ...surveys];
            return row;
        });
        return { ok: true, survey };
    }
    async winBackCampaigns() {
        const state = await this.runtime.read();
        return { ok: true, winBackCampaigns: arrayFromState(state, "winBackCampaigns") };
    }
    async createWinBackCampaign(input) {
        const campaign = await this.runtime.update((state) => {
            const campaigns = arrayFromState(state, "winBackCampaigns");
            const row = {
                id: (0, utils_1.cleanString)(input.id) || `winback-${(0, crypto_1.randomUUID)()}`,
                name: (0, utils_1.cleanString)(input.name) || "Win-back Campaign",
                offerType: (0, utils_1.cleanString)(input.offerType) || "2x Points",
                offerValue: (0, utils_1.cleanString)(input.offerValue) || "",
                targetedMembers: Math.max(0, Math.floor((0, utils_1.numberValue)(input.targetedMembers, 0))),
                responses: Math.max(0, Math.floor((0, utils_1.numberValue)(input.responses, 0))),
                reengagedMembers: Math.max(0, Math.floor((0, utils_1.numberValue)(input.reengagedMembers, 0))),
                estimatedRevenue: (0, utils_1.numberValue)(input.estimatedRevenue, 0),
                offerCost: (0, utils_1.numberValue)(input.offerCost, 0),
                status: (0, utils_1.cleanString)(input.status) || "running",
                launchDate: (0, utils_1.nowIso)(),
            };
            state.winBackCampaigns = [row, ...campaigns];
            return row;
        });
        return { ok: true, campaign };
    }
    async settings() {
        const state = await this.runtime.read();
        return this.settingsFromState(state);
    }
    async updateSettings(input) {
        const next = await this.runtime.update((state) => {
            const merged = {
                ...this.settingsFromState(state),
                ...input,
                tiers: Array.isArray(input.tiers) ? input.tiers : this.settingsFromState(state).tiers,
                earningRules: Array.isArray(input.earningRules) ? input.earningRules : this.settingsFromState(state).earningRules,
                birthdaySettings: {
                    ...this.settingsFromState(state).birthdaySettings,
                    ...(input.birthdaySettings || {}),
                    amounts: {
                        ...this.settingsFromState(state).birthdaySettings.amounts,
                        ...((input.birthdaySettings?.amounts || {})),
                    },
                },
                updatedAt: (0, utils_1.nowIso)(),
            };
            state.adminSettings = merged;
            return merged;
        });
        return { ...next, source: "local_runtime" };
    }
};
exports.AdminMobileService = AdminMobileService;
exports.AdminMobileService = AdminMobileService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [local_runtime_service_1.LocalRuntimeService])
], AdminMobileService);
//# sourceMappingURL=admin-mobile.service.js.map
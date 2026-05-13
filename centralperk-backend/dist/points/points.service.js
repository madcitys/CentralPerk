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
exports.PointsService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const local_runtime_service_1 = require("../local-runtime/local-runtime.service");
const tiers_service_1 = require("../tiers/tiers.service");
const utils_1 = require("../common/utils");
let PointsService = class PointsService {
    runtime;
    tiers;
    constructor(runtime, tiers) {
        this.runtime = runtime;
        this.tiers = tiers;
    }
    normalizeIdentifier(value) {
        return String(value || "").trim();
    }
    matchMember(member, identifier, fallbackEmail) {
        const needle = this.normalizeIdentifier(identifier).toLowerCase();
        const email = this.normalizeIdentifier(fallbackEmail).toLowerCase();
        if (!needle && !email)
            return false;
        const memberId = this.normalizeIdentifier(member.memberId).toLowerCase();
        const memberNumber = this.normalizeIdentifier(member.memberNumber || member.memberId).toLowerCase();
        const memberEmail = this.normalizeIdentifier(member.email || "").toLowerCase();
        return Boolean((needle && (needle === memberId || needle === memberNumber || needle === memberEmail)) ||
            (email && email === memberEmail));
    }
    findExistingMember(state, identifier, fallbackEmail) {
        const direct = this.normalizeIdentifier(identifier);
        if (direct && state.pointMembers[direct])
            return state.pointMembers[direct];
        return Object.values(state.pointMembers).find((member) => this.matchMember(member, identifier, fallbackEmail)) ?? null;
    }
    createMember(memberIdentifier, email) {
        return {
            memberId: memberIdentifier,
            memberNumber: memberIdentifier,
            email: email || null,
            firstName: "Local",
            lastName: "Member",
            phone: null,
            birthdate: null,
            enrollmentDate: (0, utils_1.nowIso)(),
            profileImage: null,
            status: "Active",
            pointsBalance: 0,
            tier: "Bronze",
            history: [],
        };
    }
    async getMemberRecord(identifier, fallbackEmail) {
        const state = await this.runtime.read();
        const existing = this.findExistingMember(state, identifier, fallbackEmail);
        if (existing) {
            return { memberId: existing.memberId, member: existing };
        }
        const resolvedIdentifier = this.normalizeIdentifier(identifier || fallbackEmail);
        if (!resolvedIdentifier) {
            throw new common_1.BadRequestException("memberIdentifier or email is required.");
        }
        const member = this.createMember(resolvedIdentifier, fallbackEmail || identifier || null);
        return { memberId: member.memberId, member };
    }
    awardAmount(input) {
        const explicit = (0, utils_1.numberValue)(input.points, 0);
        if (explicit > 0)
            return Math.floor(explicit);
        const amountSpent = (0, utils_1.numberValue)(input.amountSpent, 0);
        return amountSpent > 0 ? Math.floor(amountSpent / 10) : 0;
    }
    async award(input, idempotencyKey) {
        const memberIdentifier = this.normalizeIdentifier(input.memberIdentifier || input.fallbackEmail);
        if (!memberIdentifier)
            throw new common_1.BadRequestException("memberIdentifier is required.");
        const points = this.awardAmount(input);
        const reference = input.transactionRef || idempotencyKey || `award-${(0, crypto_1.randomUUID)()}`;
        return this.runtime.update(async (state) => {
            const existing = this.findExistingMember(state, memberIdentifier, input.fallbackEmail) ?? this.createMember(memberIdentifier, input.fallbackEmail);
            const memberId = existing.memberId;
            const newBalance = existing.pointsBalance + points;
            const tier = await this.tiers.resolveTier(newBalance);
            const transaction = {
                id: reference,
                type: input.transactionType || "PURCHASE",
                points,
                reason: input.reason || "Points awarded",
                date: (0, utils_1.nowIso)(),
                expiry_date: null,
                reference,
            };
            state.pointMembers[memberId] = {
                ...existing,
                email: input.fallbackEmail || existing.email,
                pointsBalance: newBalance,
                tier,
                history: [transaction, ...(existing.history || [])],
            };
            return {
                memberId,
                pointsAwarded: points,
                newBalance,
                tier,
                transaction,
                source: "local_runtime",
            };
        });
    }
    async redeem(input) {
        const memberIdentifier = this.normalizeIdentifier(input.memberIdentifier || input.fallbackEmail);
        if (!memberIdentifier)
            throw new common_1.BadRequestException("memberIdentifier is required.");
        const points = Math.floor((0, utils_1.numberValue)(input.points, 100));
        if (points <= 0)
            throw new common_1.BadRequestException("points must be greater than zero.");
        return this.runtime.update(async (state) => {
            const existing = this.findExistingMember(state, memberIdentifier, input.fallbackEmail) ?? this.createMember(memberIdentifier, input.fallbackEmail);
            if (existing.pointsBalance < points) {
                throw new common_1.BadRequestException("Insufficient points balance.");
            }
            const memberId = existing.memberId;
            const newBalance = existing.pointsBalance - points;
            const tier = await this.tiers.resolveTier(newBalance);
            const transaction = {
                id: `redeem-${(0, crypto_1.randomUUID)()}`,
                type: input.transactionType || "REDEEM",
                points: -Math.abs(points),
                reason: input.reason || "Reward redemption",
                date: (0, utils_1.nowIso)(),
                expiry_date: null,
                reference: input.rewardCatalogId || null,
            };
            state.pointMembers[memberId] = {
                ...existing,
                email: input.fallbackEmail || existing.email,
                pointsBalance: newBalance,
                tier,
                history: [transaction, ...(existing.history || [])],
            };
            return {
                memberId,
                pointsRedeemed: points,
                newBalance,
                tier,
                transaction,
                source: "local_runtime",
            };
        });
    }
    async activity(memberIdentifier, fallbackEmail) {
        const { memberId, member } = await this.getMemberRecord(memberIdentifier, fallbackEmail);
        return {
            balance: {
                member_id: memberId,
                points_balance: member.pointsBalance,
                tier: member.tier,
            },
            history: member.history || [],
            profile: {
                id: memberId,
                member_id: memberId,
                member_number: member.memberNumber || memberId,
                first_name: member.firstName || "Local",
                last_name: member.lastName || "Member",
                email: fallbackEmail || member.email || "local-member@example.test",
                phone: member.phone || null,
                birthdate: member.birthdate || null,
                points_balance: member.pointsBalance,
                tier: member.tier,
                enrollment_date: member.enrollmentDate || (0, utils_1.nowIso)(),
                profile_photo_url: member.profileImage || null,
                status: member.status || "Active",
            },
        };
    }
    async lookupByEmail(email) {
        const normalizedEmail = this.normalizeIdentifier(email).toLowerCase();
        if (!normalizedEmail)
            throw new common_1.BadRequestException("email is required.");
        const state = await this.runtime.read();
        const member = Object.values(state.pointMembers).find((entry) => this.normalizeIdentifier(entry.email || "").toLowerCase() === normalizedEmail);
        if (!member) {
            return this.activity(normalizedEmail, normalizedEmail);
        }
        return this.activity(member.memberId, member.email || normalizedEmail);
    }
    async snapshot() {
        return this.runtime.snapshotPoints();
    }
};
exports.PointsService = PointsService;
exports.PointsService = PointsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [local_runtime_service_1.LocalRuntimeService,
        tiers_service_1.TiersService])
], PointsService);
//# sourceMappingURL=points.service.js.map
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
exports.SegmentsService = void 0;
const common_1 = require("@nestjs/common");
const local_runtime_service_1 = require("../local-runtime/local-runtime.service");
const points_service_1 = require("../points/points.service");
const utils_1 = require("../common/utils");
let SegmentsService = class SegmentsService {
    runtime;
    points;
    constructor(runtime, points) {
        this.runtime = runtime;
        this.points = points;
    }
    slug(name) {
        return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
    }
    normalizeCondition(condition, index) {
        const field = String(condition.field || "Tier").trim();
        const operator = String(condition.operator || "is").trim();
        const value = String(condition.value || "").trim();
        return {
            id: String(condition.id || `${field}-${operator}-${value || index}`).toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            field,
            operator,
            value,
        };
    }
    normalize(input) {
        const name = String(input.name || "Segment").trim();
        const conditions = Array.isArray(input.conditions)
            ? input.conditions.map((condition, index) => this.normalizeCondition(condition, index))
            : [];
        return {
            id: String(input.id || `SEG-${this.slug(name) || "segment"}-${Date.now()}`),
            name,
            description: input.description ? String(input.description) : null,
            is_system: Boolean(input.is_system ?? false),
            created_at: String(input.created_at || (0, utils_1.nowIso)()),
            updated_at: String(input.updated_at || (0, utils_1.nowIso)()),
            logicMode: String(input.logicMode || input.logic_mode || "AND").toUpperCase() === "OR" ? "OR" : "AND",
            conditions,
            memberIds: Array.isArray(input.memberIds) ? input.memberIds.map(String) : [],
        };
    }
    matches(member, condition) {
        const field = condition.field.toLowerCase();
        const operator = condition.operator.toLowerCase();
        const value = condition.value.toLowerCase();
        if (field.includes("tier")) {
            return operator.includes("not")
                ? member.tier.toLowerCase() !== value
                : member.tier.toLowerCase() === value;
        }
        if (field.includes("point") || field.includes("spend")) {
            const target = (0, utils_1.numberValue)(condition.value, 0);
            if (operator.includes("greater") || operator.includes("above") || operator === ">=")
                return member.pointsBalance >= target;
            if (operator.includes("less") || operator.includes("below") || operator === "<=")
                return member.pointsBalance <= target;
            return member.pointsBalance === target;
        }
        return true;
    }
    async preview(input) {
        const conditions = Array.isArray(input.conditions)
            ? input.conditions.map((condition, index) => this.normalizeCondition(condition, index))
            : [];
        const logicMode = String(input.logicMode || "AND").toUpperCase() === "OR" ? "OR" : "AND";
        const members = await this.points.snapshot();
        const matched = members.filter((member) => {
            if (conditions.length === 0)
                return true;
            const checks = conditions.map((condition) => this.matches(member, condition));
            return logicMode === "OR" ? checks.some(Boolean) : checks.every(Boolean);
        });
        return {
            count: matched.length,
            memberIds: matched.map((member) => member.memberId),
            sampleMembers: matched.slice(0, 10),
            logicMode,
            conditions,
        };
    }
    async create(input) {
        const name = String(input.name || "").trim();
        if (!name)
            throw new common_1.BadRequestException("Segment name is required.");
        const preview = await this.preview(input);
        return this.runtime.update((state) => {
            const existing = Object.values(state.segments).find((segment) => String(segment.name || "").toLowerCase() === name.toLowerCase());
            const segment = this.normalize({
                ...existing,
                ...input,
                id: existing?.id || input.id,
                memberIds: preview.memberIds,
            });
            state.segments[String(segment.id)] = segment;
            return segment;
        });
    }
    async list() {
        const state = await this.runtime.read();
        return Object.values(state.segments)
            .filter((segment) => !(0, utils_1.hasTemplateToken)(segment.id))
            .map((segment) => this.normalize(segment))
            .sort((left, right) => left.name.localeCompare(right.name));
    }
    async update(id, patch) {
        return this.runtime.update((state) => {
            const existing = state.segments[id];
            if (!existing)
                throw new common_1.NotFoundException("Segment not found.");
            const segment = this.normalize({ ...existing, ...patch, id, updated_at: (0, utils_1.nowIso)() });
            state.segments[id] = segment;
            return segment;
        });
    }
    async remove(id) {
        return this.runtime.update((state) => {
            if (!state.segments[id])
                throw new common_1.NotFoundException("Segment not found.");
            delete state.segments[id];
            return { deleted: true };
        });
    }
};
exports.SegmentsService = SegmentsService;
exports.SegmentsService = SegmentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [local_runtime_service_1.LocalRuntimeService,
        points_service_1.PointsService])
], SegmentsService);
//# sourceMappingURL=segments.service.js.map
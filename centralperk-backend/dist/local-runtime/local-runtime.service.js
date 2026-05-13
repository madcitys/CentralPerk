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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalRuntimeService = void 0;
const common_1 = require("@nestjs/common");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const url_1 = require("url");
const api_config_service_1 = require("../config/api-config.service");
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
function mergeById(seeded, current, sortField = "createdAt") {
    const byId = new Map();
    for (const row of seeded) {
        const id = String(row.id || "");
        if (!id)
            continue;
        byId.set(id, clone(row));
    }
    for (const row of current) {
        const id = String(row.id || "");
        if (!id)
            continue;
        byId.set(id, { ...(byId.get(id) || {}), ...row });
    }
    return Array.from(byId.values()).sort((left, right) => String(right[sortField] || right.updatedAt || "").localeCompare(String(left[sortField] || left.updatedAt || "")));
}
function mergeSeedState(value, seed) {
    const next = {
        ...clone(seed),
        ...(value ?? {}),
        idempotency: value?.idempotency ?? {},
        partners: { ...clone(seed.partners), ...(value?.partners ?? {}) },
        rewards: { ...clone(seed.rewards), ...(value?.rewards ?? {}) },
        partnerTransactions: mergeById(seed.partnerTransactions, Array.isArray(value?.partnerTransactions) ? value.partnerTransactions : []),
        partnerSettlements: mergeById(seed.partnerSettlements, Array.isArray(value?.partnerSettlements) ? value.partnerSettlements : [], "updatedAt"),
        pointMembers: { ...clone(seed.pointMembers), ...(value?.pointMembers ?? {}) },
        campaigns: { ...clone(seed.campaigns), ...(value?.campaigns ?? {}) },
        segments: { ...clone(seed.segments), ...(value?.segments ?? {}) },
        notifications: mergeById(seed.notifications, Array.isArray(value?.notifications) ? value.notifications : []),
        communicationPreferences: {
            ...clone(seed.communicationPreferences),
            ...(value?.communicationPreferences ?? {}),
        },
    };
    for (const member of Object.values(next.pointMembers)) {
        member.history = Array.isArray(member.history) ? member.history.slice(0, 300) : [];
    }
    return next;
}
let LocalRuntimeService = class LocalRuntimeService {
    config;
    cache = null;
    seedCache = null;
    writeChain = Promise.resolve();
    constructor(config) {
        this.config = config;
    }
    get storePath() {
        return this.config.localRuntimeStorePath;
    }
    get seedModulePath() {
        const candidates = [
            path_1.default.resolve(process.cwd(), "../../scripts/local-runtime-seed-data.mjs"),
            path_1.default.resolve(process.cwd(), "../scripts/local-runtime-seed-data.mjs"),
            path_1.default.resolve(process.cwd(), "scripts/local-runtime-seed-data.mjs"),
        ];
        return candidates[0];
    }
    async ensureDir() {
        await fs_1.promises.mkdir(path_1.default.dirname(this.storePath), { recursive: true });
    }
    async loadSeedState() {
        if (this.seedCache)
            return clone(this.seedCache);
        let seedPath = this.seedModulePath;
        for (const candidate of [
            path_1.default.resolve(process.cwd(), "../../scripts/local-runtime-seed-data.mjs"),
            path_1.default.resolve(process.cwd(), "../scripts/local-runtime-seed-data.mjs"),
            path_1.default.resolve(process.cwd(), "scripts/local-runtime-seed-data.mjs"),
        ]) {
            try {
                await fs_1.promises.access(candidate);
                seedPath = candidate;
                break;
            }
            catch {
            }
        }
        const module = (await new Function("specifier", "return import(specifier)")((0, url_1.pathToFileURL)(seedPath).href));
        const value = module.createSeedState();
        this.seedCache = clone(value);
        return clone(value);
    }
    async read() {
        if (this.cache && Date.now() - this.cache.loadedAt < 5000) {
            return this.cache.value;
        }
        await this.ensureDir();
        const seed = await this.loadSeedState();
        try {
            const parsed = JSON.parse(await fs_1.promises.readFile(this.storePath, "utf8"));
            const value = mergeSeedState(parsed, seed);
            this.cache = { loadedAt: Date.now(), value };
            return value;
        }
        catch {
            const value = clone(seed);
            this.cache = { loadedAt: Date.now(), value };
            return value;
        }
    }
    async snapshotPoints() {
        const state = await this.read();
        return Object.values(state.pointMembers || {}).sort((left, right) => String(left.memberId || "").localeCompare(String(right.memberId || "")));
    }
    async writeSeedFile() {
        const value = await this.loadSeedState();
        await this.ensureDir();
        await fs_1.promises.writeFile(this.storePath, JSON.stringify(value, null, 2), "utf8");
        this.cache = { loadedAt: Date.now(), value };
        return value;
    }
    async update(updater) {
        let result;
        this.writeChain = this.writeChain.then(async () => {
            const state = await this.read();
            result = await updater(state);
            for (const member of Object.values(state.pointMembers)) {
                member.history = (member.history || []).slice(0, 300);
            }
            await this.ensureDir();
            await fs_1.promises.writeFile(this.storePath, JSON.stringify(state, null, 2), "utf8");
            this.cache = { loadedAt: Date.now(), value: state };
        });
        await this.writeChain;
        return result;
    }
};
exports.LocalRuntimeService = LocalRuntimeService;
exports.LocalRuntimeService = LocalRuntimeService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [api_config_service_1.ApiConfigService])
], LocalRuntimeService);
//# sourceMappingURL=local-runtime.service.js.map
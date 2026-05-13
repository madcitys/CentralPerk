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
exports.ApiConfigService = void 0;
const common_1 = require("@nestjs/common");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
let ApiConfigService = class ApiConfigService {
    constructor() {
        dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), ".env"), quiet: true });
        dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), "../.env"), quiet: true });
        dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), "../../.env.local"), quiet: true });
        dotenv_1.default.config({ quiet: true });
    }
    get port() {
        return Number(process.env.PORT || 4000);
    }
    get localRuntimeStorePath() {
        const raw = process.env.LOCAL_RUNTIME_STORE_PATH || "../../.runtime/api-store.json";
        return path_1.default.resolve(process.cwd(), raw);
    }
    get useLocalFallback() {
        if (process.env.USE_LOCAL_LOYALTY_API === "false") {
            return !this.supabaseUrl || !this.supabaseServiceRoleKey;
        }
        return true;
    }
    get supabaseUrl() {
        return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    }
    get supabaseAnonKey() {
        return process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    }
    get supabaseServiceRoleKey() {
        return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    }
    get emailProvider() {
        return process.env.EMAIL_PROVIDER || "demo";
    }
    get smsProvider() {
        return process.env.SMS_PROVIDER || "demo";
    }
};
exports.ApiConfigService = ApiConfigService;
exports.ApiConfigService = ApiConfigService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], ApiConfigService);
//# sourceMappingURL=api-config.service.js.map
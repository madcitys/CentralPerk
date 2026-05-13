export declare class ApiConfigService {
    constructor();
    get port(): number;
    get localRuntimeStorePath(): string;
    get useLocalFallback(): boolean;
    get supabaseUrl(): string;
    get supabaseAnonKey(): string;
    get supabaseServiceRoleKey(): string;
    get emailProvider(): string;
    get smsProvider(): string;
}

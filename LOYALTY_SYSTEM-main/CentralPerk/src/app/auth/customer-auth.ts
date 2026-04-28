import { supabase } from "../../utils/supabase/client";
import { clearStoredAuth, setStoredAdminSession, setStoredCustomerSession } from "./auth";

const DEMO_ACCOUNTS_KEY = "loyaltyhub-demo-accounts-v1";
const DEMO_ADMIN_ACCOUNTS_KEY = "loyaltyhub-demo-admin-accounts-v1";
const DEMO_MEMBER_PROFILES_KEY = "loyaltyhub-demo-member-profiles-v1";
const DEMO_AUTH_ENABLED = process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH === "true" || process.env.NODE_ENV !== "production";
const FORCE_CUSTOMER_DEMO_AUTH = process.env.NEXT_PUBLIC_FORCE_CUSTOMER_DEMO_AUTH === "true";
const DEMO_PROFILE_BOOTSTRAP_ENABLED = process.env.NODE_ENV !== "production";
const MIN_PASSWORD_LENGTH = 8;
const DEMO_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const PENDING_EMAIL_ALIASES_KEY = "centralperk-pending-email-aliases-v1";

const DEMO_LOCAL_PART_HINTS = [
  "demo",
  "test",
  "fake",
  "sample",
  "qa",
  "dev",
  "staging",
  "dummy",
  "mock",
];

const DEMO_ADMIN_ID_HINTS = ["admin", "demo", "dev", "test", "qa"];

const DEMO_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "test.local",
  "local.test",
  "localhost",
  "invalid",
  "mailinator.com",
  "tempmail.com",
  "fake.com",
  "fake.local",
  "dummy.com",
  "noemail.com",
]);

const MEMBER_SELECT_COLUMNS = "id,member_id,member_number,first_name,last_name,email,phone,birthdate,points_balance,enrollment_date";
const AUTH_RATE_LIMIT_HINTS = ["over_email_send_rate_limit", "rate limit", "too many requests"];
const AUTH_ALREADY_EXISTS_HINTS = ["user already registered", "already registered", "already exists", "user exists"];
const PROFILE_CONSTRAINT_HINTS = ["duplicate key", "already exists", "violates unique constraint"];

export type RegisterCustomerInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthdate: string;
  password: string;
};

type DemoAccount = {
  email: string;
  passwordHash: string;
  memberId: string;
  fullName: string;
  phone: string;
  createdAt: string;
};

type DemoAdminAccount = {
  adminId: string;
  passwordHash: string;
  fullName: string;
  createdAt: string;
};

type DemoMemberProfile = {
  id: string;
  member_id: string;
  member_number: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  birthdate: string;
  points_balance: number;
  tier: "Bronze";
  enrollment_date: string;
  demo_local_only: true;
};

type PendingEmailAlias = {
  pendingEmail: string;
  authEmail: string;
  updatedAt: string;
};

export type RegisterCustomerResult = {
  authMode: "demo" | "supabase";
  profileMode: "supabase" | "local_demo";
  emailConfirmationRequired: boolean;
  immediateLoginAvailable: boolean;
  memberRecord: Record<string, any>;
  recoveredFromExistingAuthSignup: boolean;
  authUserAlreadyExisted: boolean;
};

export type LoginCustomerResult = {
  authMode: "demo" | "supabase";
  accessToken?: string;
  userId?: string;
};

class AuthFlowError extends Error {
  constructor(
    public readonly code:
      | "INVALID_EMAIL"
      | "INVALID_PHONE"
      | "INVALID_PASSWORD"
      | "MISSING_PASSWORD"
      | "DUPLICATE_EMAIL"
      | "DUPLICATE_PHONE"
      | "DUPLICATE_EMAIL_AND_PHONE"
      | "AUTH_RATE_LIMIT"
      | "AUTH_EMAIL_NOT_CONFIRMED"
      | "INVALID_CREDENTIALS"
      | "PROFILE_CREATION_FAILED"
      | "AUTH_PROVIDER_ERROR",
    message: string,
    public readonly causeValue?: unknown
  ) {
    super(message);
  }
}

function normalizeEmail(rawEmail: string): string {
  return rawEmail.trim().toLowerCase();
}

function loadPendingEmailAliases(): PendingEmailAlias[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(PENDING_EMAIL_ALIASES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingEmailAlias[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => Boolean(entry?.pendingEmail && entry?.authEmail));
  } catch {
    return [];
  }
}

function savePendingEmailAliases(aliases: PendingEmailAlias[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PENDING_EMAIL_ALIASES_KEY, JSON.stringify(aliases));
}

export function rememberPendingEmailAlias(pendingEmail: string, authEmail: string): void {
  const normalizedPendingEmail = normalizeEmail(pendingEmail);
  const normalizedAuthEmail = normalizeEmail(authEmail);
  if (!normalizedPendingEmail || !normalizedAuthEmail) return;

  const aliases = loadPendingEmailAliases().filter(
    (entry) =>
      entry.pendingEmail !== normalizedPendingEmail &&
      entry.authEmail !== normalizedPendingEmail
  );

  aliases.push({
    pendingEmail: normalizedPendingEmail,
    authEmail: normalizedAuthEmail,
    updatedAt: new Date().toISOString(),
  });
  savePendingEmailAliases(aliases);
}

export function clearPendingEmailAlias(email: string): void {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return;

  const aliases = loadPendingEmailAliases().filter(
    (entry) =>
      entry.pendingEmail !== normalizedEmail &&
      entry.authEmail !== normalizedEmail
  );
  savePendingEmailAliases(aliases);
}

function resolvePendingEmailAlias(email: string): string | null {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const alias = loadPendingEmailAliases().find((entry) => entry.pendingEmail === normalizedEmail);
  return alias?.authEmail ?? null;
}

function normalizePhoneNumber(rawPhone: string): string {
  const trimmed = rawPhone.trim();
  if (!trimmed) return "";
  const digitsOnly = trimmed.replace(/\D/g, "");
  if (!digitsOnly) return "";
  return trimmed.startsWith("+") ? `+${digitsOnly}` : digitsOnly;
}

function normalizePhilippinePhoneNumber(rawPhone: string): string {
  const digitsOnly = rawPhone.replace(/\D/g, "");
  if (!digitsOnly) return "";

  if (digitsOnly.startsWith("09") && digitsOnly.length === 11) {
    return `+63${digitsOnly.slice(1)}`;
  }

  if (digitsOnly.startsWith("639") && digitsOnly.length === 12) {
    return `+${digitsOnly}`;
  }

  if (digitsOnly.startsWith("9") && digitsOnly.length === 10) {
    return `+63${digitsOnly}`;
  }

  return normalizePhoneNumber(rawPhone);
}

export function isValidPhilippinePhoneNumber(rawPhone: string): boolean {
  const digitsOnly = rawPhone.replace(/\D/g, "");
  return /^(09\d{9}|639\d{9}|9\d{9})$/.test(digitsOnly);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hasStrongEnoughPassword(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}

function extractErrorText(rawError: unknown): string {
  return typeof rawError === "string"
    ? rawError
    : rawError && typeof rawError === "object"
      ? [
          "message" in rawError ? String(rawError.message ?? "") : "",
          "details" in rawError ? String(rawError.details ?? "") : "",
          "hint" in rawError ? String(rawError.hint ?? "") : "",
          JSON.stringify(rawError),
        ]
          .filter(Boolean)
          .join(" ")
      : "";
}

function mapProviderErrorMessage(rawError: unknown, fallbackMessage: string): string {
  const code = rawError && typeof rawError === "object" && "code" in rawError
    ? String(rawError.code ?? "").toLowerCase()
    : "";
  const message = extractErrorText(rawError).toLowerCase();

  if (code === "email_address_invalid" || message.includes("email address") && message.includes("is invalid")) {
    return "That email address was rejected by Supabase Auth. Try a real address format, or use a demo/test email like `demo@example.com` while developing.";
  }

  if (message.includes("signup is disabled")) {
    return "Email signups are currently disabled in Supabase Auth for this project.";
  }

  if (message.includes("password should be at least")) {
    return "Password must meet the minimum length required by Supabase Auth.";
  }

  if (
    message.includes("loyalty_members") ||
    message.includes("row-level security") ||
    message.includes("permission denied") ||
    message.includes("schema cache")
  ) {
    return "Customer profile access failed. Your Supabase public key can reach Auth, but the `loyalty_members` table is missing or not accessible from the client.";
  }

  return fallbackMessage;
}

function hasAnyHint(haystack: string, hints: string[]): boolean {
  return hints.some((hint) => haystack.toLowerCase().includes(hint));
}

function isAlreadyExistsAuthError(rawError: unknown): boolean {
  if (!rawError || typeof rawError !== "object") return false;
  const code = "code" in rawError ? String(rawError.code ?? "").toLowerCase() : "";
  const normalizedText = extractErrorText(rawError).toLowerCase();
  return code.includes("already") || hasAnyHint(normalizedText, AUTH_ALREADY_EXISTS_HINTS);
}

function isRateLimitError(rawError: unknown): boolean {
  if (!rawError || typeof rawError !== "object") return false;
  if (isAlreadyExistsAuthError(rawError)) return false;
  const status = "status" in rawError ? Number(rawError.status) : NaN;
  const code = "code" in rawError ? String(rawError.code ?? "").toLowerCase() : "";
  const text = extractErrorText(rawError).toLowerCase();
  return status === 429 || code.includes("over_email_send_rate_limit") || hasAnyHint(text, AUTH_RATE_LIMIT_HINTS);
}

export function isDemoEmail(rawEmail: string): boolean {
  const normalized = normalizeEmail(rawEmail);
  const [localPart = "", domain = ""] = normalized.split("@");
  const normalizedDomain = domain.trim().toLowerCase();

  if (!localPart || !normalizedDomain) return false;
  if (DEMO_DOMAINS.has(normalizedDomain)) return true;
  if (
    normalizedDomain === "localhost" ||
    normalizedDomain.endsWith(".local") ||
    normalizedDomain.endsWith(".test") ||
    normalizedDomain.endsWith(".invalid") ||
    normalizedDomain.endsWith(".example")
  ) {
    return true;
  }
  if (
    normalizedDomain.includes("mailinator") ||
    normalizedDomain.includes("tempmail") ||
    normalizedDomain.includes("disposable") ||
    normalizedDomain.includes("fake") ||
    normalizedDomain.includes("dummy") ||
    normalizedDomain.includes("example") ||
    normalizedDomain.includes("test")
  ) {
    return true;
  }
  return DEMO_LOCAL_PART_HINTS.some((hint) => localPart.includes(hint));
}

export function isCustomerDemoAuthEnabled(): boolean {
  return DEMO_AUTH_ENABLED;
}

export function isCustomerDemoAuthForced(): boolean {
  return FORCE_CUSTOMER_DEMO_AUTH;
}

export function isAdminDemoAuthEnabled(): boolean {
  return DEMO_AUTH_ENABLED;
}

function shouldUseCustomerDemoAuth(normalizedEmail: string): boolean {
  if (!DEMO_AUTH_ENABLED) return false;
  if (FORCE_CUSTOMER_DEMO_AUTH) return true;
  return isDemoEmail(normalizedEmail);
}

function normalizeAdminId(rawAdminId: string): string {
  return rawAdminId.trim().toLowerCase().replace(/\s+/g, "");
}

function isDemoAdminId(rawAdminId: string): boolean {
  const normalizedAdminId = normalizeAdminId(rawAdminId);
  if (!normalizedAdminId) return false;
  return DEMO_ADMIN_ID_HINTS.some((hint) => normalizedAdminId.includes(hint));
}

function loadDemoAccounts(): DemoAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DEMO_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DemoAccount[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => Boolean(entry?.email && entry?.passwordHash && entry?.memberId));
  } catch {
    return [];
  }
}

function saveDemoAccounts(accounts: DemoAccount[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DEMO_ACCOUNTS_KEY, JSON.stringify(accounts));
}

function findDemoAccountByEmail(normalizedEmail: string): DemoAccount | null {
  return loadDemoAccounts().find((entry) => entry.email === normalizedEmail) ?? null;
}

function loadDemoAdminAccounts(): DemoAdminAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DEMO_ADMIN_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DemoAdminAccount[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => Boolean(entry?.adminId && entry?.passwordHash));
  } catch {
    return [];
  }
}

function saveDemoAdminAccounts(accounts: DemoAdminAccount[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DEMO_ADMIN_ACCOUNTS_KEY, JSON.stringify(accounts));
}

function loadDemoMemberProfiles(): DemoMemberProfile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DEMO_MEMBER_PROFILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DemoMemberProfile[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => Boolean(entry?.member_number && entry?.email));
  } catch {
    return [];
  }
}

function saveDemoMemberProfiles(profiles: DemoMemberProfile[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DEMO_MEMBER_PROFILES_KEY, JSON.stringify(profiles));
}

async function hashSecret(secret: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
    return Array.from(new Uint8Array(digest))
      .map((part) => part.toString(16).padStart(2, "0"))
      .join("");
  }
  return btoa(secret);
}

export function persistDemoSession(input: { memberId: string; email: string; phone: string; fullName: string }) {
  clearStoredAuth();
  setStoredCustomerSession({
    memberId: input.memberId,
    email: normalizeEmail(input.email),
    phone: input.phone,
    fullName: input.fullName,
    expiresAt: new Date(Date.now() + DEMO_SESSION_TTL_MS).toISOString(),
  });
}

function persistDemoAdminSession(input: { adminId: string; fullName: string }) {
  clearStoredAuth();
  setStoredAdminSession({
    adminId: input.adminId,
    email: `${input.adminId}@admin.loyaltyhub.com`,
    fullName: input.fullName,
    expiresAt: new Date(Date.now() + DEMO_SESSION_TTL_MS).toISOString(),
  });
}

function nextDemoMemberNumber(profiles: DemoMemberProfile[]): string {
  return `DMO${String(profiles.length + 1).padStart(6, "0")}`;
}

function createLocalDemoMemberProfile(input: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthdate: string;
}): DemoMemberProfile {
  const profiles = loadDemoMemberProfiles();
  const normalizedEmail = normalizeEmail(input.email);
  const normalizedPhone = normalizePhoneNumber(input.phone);
  const emailExists = profiles.some((profile) => normalizeEmail(profile.email) === normalizedEmail);
  const phoneExists = profiles.some((profile) => normalizePhoneNumber(profile.phone) === normalizedPhone);

  if (emailExists && phoneExists) {
    throw new AuthFlowError("DUPLICATE_EMAIL_AND_PHONE", "A user with that email and phone number already exists.");
  }
  if (emailExists) {
    throw new AuthFlowError("DUPLICATE_EMAIL", "Email already registered.");
  }
  if (phoneExists) {
    throw new AuthFlowError("DUPLICATE_PHONE", "This phone number is already registered.");
  }

  const memberNumber = nextDemoMemberNumber(profiles);
  const profile: DemoMemberProfile = {
    id: memberNumber,
    member_id: memberNumber,
    member_number: memberNumber,
    first_name: input.firstName,
    last_name: input.lastName,
    email: normalizedEmail,
    phone: normalizedPhone,
    birthdate: input.birthdate,
    points_balance: 0,
    tier: "Bronze",
    enrollment_date: new Date().toISOString(),
    demo_local_only: true,
  };

  saveDemoMemberProfiles([profile, ...profiles]);
  return profile;
}

async function createOrRepairMemberProfile(input: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthdate: string;
}, options?: { allowLocalDemoProfileFallback?: boolean }): Promise<{
  memberRecord: Record<string, any>;
  recoveredFromExistingAuthSignup: boolean;
  profileMode: "supabase" | "local_demo";
}> {
  const { data: insertedMember, error: insertError } = await supabase
    .from("loyalty_members")
    .insert([
      {
        first_name: input.firstName,
        last_name: input.lastName,
        email: input.email,
        phone: input.phone,
        birthdate: input.birthdate,
        points_balance: 0,
        tier: "Bronze",
      },
    ])
    .select(MEMBER_SELECT_COLUMNS)
    .single();

  if (!insertError && insertedMember) {
    return { memberRecord: insertedMember, recoveredFromExistingAuthSignup: false, profileMode: "supabase" };
  }

  const insertErrorText = extractErrorText(insertError).toLowerCase();
  if (!hasAnyHint(insertErrorText, PROFILE_CONSTRAINT_HINTS)) {
    if (options?.allowLocalDemoProfileFallback) {
      return {
        memberRecord: createLocalDemoMemberProfile(input),
        recoveredFromExistingAuthSignup: false,
        profileMode: "local_demo",
      };
    }
    throw new AuthFlowError("PROFILE_CREATION_FAILED", "Unable to create customer profile.", insertError);
  }

  const { data: existingMember, error: existingMemberError } = await supabase
    .from("loyalty_members")
    .select(MEMBER_SELECT_COLUMNS)
    .or(`email.ilike.${input.email},phone.eq.${input.phone}`)
    .limit(1)
    .maybeSingle();

  if (existingMemberError || !existingMember) {
    if (options?.allowLocalDemoProfileFallback) {
      return {
        memberRecord: createLocalDemoMemberProfile(input),
        recoveredFromExistingAuthSignup: false,
        profileMode: "local_demo",
      };
    }
    throw new AuthFlowError("PROFILE_CREATION_FAILED", "Unable to create customer profile.", existingMemberError);
  }

  const needsRepair =
    !existingMember.first_name ||
    !existingMember.last_name ||
    !existingMember.phone ||
    !existingMember.birthdate;

  if (!needsRepair) {
    return { memberRecord: existingMember, recoveredFromExistingAuthSignup: false, profileMode: "supabase" };
  }

  const { data: repairedMember, error: repairError } = await supabase
    .from("loyalty_members")
    .update({
      first_name: existingMember.first_name || input.firstName,
      last_name: existingMember.last_name || input.lastName,
      phone: existingMember.phone || input.phone,
      birthdate: existingMember.birthdate || input.birthdate,
    })
    .eq("id", existingMember.id)
    .select(MEMBER_SELECT_COLUMNS)
    .single();

  if (repairError || !repairedMember) {
    if (options?.allowLocalDemoProfileFallback) {
      return {
        memberRecord: createLocalDemoMemberProfile(input),
        recoveredFromExistingAuthSignup: false,
        profileMode: "local_demo",
      };
    }
    throw new AuthFlowError("PROFILE_CREATION_FAILED", "Unable to create customer profile.", repairError);
  }

  return { memberRecord: repairedMember, recoveredFromExistingAuthSignup: true, profileMode: "supabase" };
}

async function findMemberProfileByEmail(normalizedEmail: string): Promise<Record<string, any> | null> {
  const { data, error } = await supabase
    .from("loyalty_members")
    .select(MEMBER_SELECT_COLUMNS)
    .ilike("email", normalizedEmail)
    .limit(1)
    .maybeSingle();

  if (error) {
    const localProfile = loadDemoMemberProfiles().find((profile) => normalizeEmail(profile.email) === normalizedEmail);
    if (localProfile) return localProfile as Record<string, any>;
    throw new AuthFlowError("AUTH_PROVIDER_ERROR", "Unable to load customer profile.", error);
  }

  if (data) return data as Record<string, any>;
  return loadDemoMemberProfiles().find((profile) => normalizeEmail(profile.email) === normalizedEmail) ?? null;
}

async function bootstrapDemoAccountFromMemberProfile(input: {
  email: string;
  password: string;
  memberRecord: Record<string, any>;
}): Promise<LoginCustomerResult> {
  const memberId = String(
    input.memberRecord.member_number ??
      input.memberRecord.member_id ??
      input.memberRecord.id ??
      "",
  ).trim();
  if (!memberId) {
    throw new AuthFlowError("AUTH_PROVIDER_ERROR", "Customer profile is missing a member identifier.");
  }

  const normalizedPhone =
    normalizePhilippinePhoneNumber(String(input.memberRecord.phone ?? "")) ||
    normalizePhoneNumber(String(input.memberRecord.phone ?? "")) ||
    "demo-phone";
  const fullName =
    `${String(input.memberRecord.first_name ?? "").trim()} ${String(input.memberRecord.last_name ?? "").trim()}`.trim() ||
    "Member";

  const demoAccounts = loadDemoAccounts().filter((entry) => entry.email !== input.email);
  demoAccounts.push({
    email: input.email,
    passwordHash: await hashSecret(input.password),
    memberId,
    fullName,
    phone: normalizedPhone,
    createdAt: new Date().toISOString(),
  });
  saveDemoAccounts(demoAccounts);

  persistDemoSession({
    memberId,
    email: input.email,
    phone: normalizedPhone,
    fullName,
  });

  return { authMode: "demo", accessToken: "demo-customer-session", userId: memberId };
}

export async function registerCustomer(input: RegisterCustomerInput): Promise<RegisterCustomerResult> {
  const normalizedEmail = normalizeEmail(input.email);
  const normalizedPhone = normalizePhilippinePhoneNumber(input.phone);
  let canUseDemoAuth = shouldUseCustomerDemoAuth(normalizedEmail);

  if (!isValidEmail(normalizedEmail)) {
    throw new AuthFlowError("INVALID_EMAIL", "Please enter a valid email address.");
  }
  if (!isValidPhilippinePhoneNumber(input.phone)) {
    throw new AuthFlowError("INVALID_PHONE", "Please enter a valid Philippine mobile number.");
  }
  if (!input.password) {
    throw new AuthFlowError("MISSING_PASSWORD", "Password is required.");
  }
  if (!hasStrongEnoughPassword(input.password)) {
    throw new AuthFlowError("INVALID_PASSWORD", "Password must be at least 8 characters long.");
  }

  if (!canUseDemoAuth) {
    const { data: existingMembers, error: existingMembersError } = await supabase
      .from("loyalty_members")
      .select("email, phone")
      .or(`email.ilike.${normalizedEmail},phone.eq.${normalizedPhone}`);

    if (existingMembersError) {
      if (DEMO_AUTH_ENABLED) {
        console.warn("Falling back to local demo registration because loyalty_members validation is unavailable.", existingMembersError);
        canUseDemoAuth = true;
      } else {
        throw new AuthFlowError(
          "AUTH_PROVIDER_ERROR",
          "Unable to validate existing customer records. Check the `loyalty_members` table access or enable forced demo auth for local development.",
          existingMembersError
        );
      }
    }

    if (!canUseDemoAuth) {
      const emailExists = (existingMembers ?? []).some((member) => String(member.email || "").trim().toLowerCase() === normalizedEmail);
      const phoneExists = (existingMembers ?? []).some((member) => normalizePhoneNumber(String(member.phone || "")) === normalizedPhone);
      if (emailExists && phoneExists) {
        throw new AuthFlowError("DUPLICATE_EMAIL_AND_PHONE", "A user with that email and phone number already exists.");
      }
      if (emailExists) {
        throw new AuthFlowError("DUPLICATE_EMAIL", "Email already registered.");
      }
      if (phoneExists) {
        throw new AuthFlowError("DUPLICATE_PHONE", "This phone number is already registered.");
      }
    }
  }

  if (canUseDemoAuth) {
    console.info("DEMO REGISTER PATH USED");
    const demoAccounts = loadDemoAccounts();
    const duplicateDemo = demoAccounts.find((entry) => entry.email === normalizedEmail);
    if (duplicateDemo) {
      throw new AuthFlowError("DUPLICATE_EMAIL", "Email already registered.");
    }

    const { memberRecord, recoveredFromExistingAuthSignup, profileMode } = await createOrRepairMemberProfile({
      firstName: input.firstName,
      lastName: input.lastName,
      email: normalizedEmail,
      phone: normalizedPhone,
      birthdate: input.birthdate,
    }, { allowLocalDemoProfileFallback: true });

    const passwordHash = await hashSecret(input.password);
    demoAccounts.push({
      email: normalizedEmail,
      passwordHash,
      memberId: String(memberRecord.member_number || memberRecord.member_id || memberRecord.id),
      fullName: `${input.firstName} ${input.lastName}`.trim(),
      phone: normalizedPhone,
      createdAt: new Date().toISOString(),
    });
    saveDemoAccounts(demoAccounts);

    persistDemoSession({
      memberId: String(memberRecord.member_number || memberRecord.member_id || memberRecord.id),
      email: normalizedEmail,
      phone: normalizedPhone,
      fullName: `${input.firstName} ${input.lastName}`.trim() || "Member",
    });

    return {
      authMode: "demo",
      profileMode,
      emailConfirmationRequired: false,
      immediateLoginAvailable: true,
      memberRecord,
      recoveredFromExistingAuthSignup,
      authUserAlreadyExisted: false,
    };
  }

  console.info("SUPABASE REGISTER PATH USED");
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: normalizedEmail,
    password: input.password,
    options: {
      data: {
        first_name: input.firstName,
        last_name: input.lastName,
        birthdate: input.birthdate,
      },
    },
  });

  let authUserAlreadyExisted = false;
  if (signUpError) {
    if (isAlreadyExistsAuthError(signUpError)) {
      authUserAlreadyExisted = true;
    } else if (isRateLimitError(signUpError)) {
      throw new AuthFlowError(
        "AUTH_RATE_LIMIT",
        "Supabase Auth is rate-limited (429) while trying to send confirmation/login email. Use a demo email in development or wait and retry.",
        signUpError
      );
    } else {
      throw new AuthFlowError("AUTH_PROVIDER_ERROR", extractErrorText(signUpError) || "Unable to register account.", signUpError);
    }
  }

  const { memberRecord, recoveredFromExistingAuthSignup, profileMode } = await createOrRepairMemberProfile({
    firstName: input.firstName,
    lastName: input.lastName,
    email: normalizedEmail,
    phone: normalizedPhone,
    birthdate: input.birthdate,
  });

  return {
    authMode: "supabase",
    profileMode,
    emailConfirmationRequired: !authUserAlreadyExisted && !signUpData?.session,
    immediateLoginAvailable: !authUserAlreadyExisted && Boolean(signUpData?.session),
    memberRecord,
    recoveredFromExistingAuthSignup,
    authUserAlreadyExisted,
  };
}

export async function loginCustomer(input: { email: string; password: string; role: "customer" | "admin" }): Promise<LoginCustomerResult> {
  const normalizedEmail = normalizeEmail(input.email);
  if (input.role === "admin" && DEMO_AUTH_ENABLED && isDemoAdminId(input.email)) {
    const normalizedAdminId = normalizeAdminId(input.email);
    const passwordHash = await hashSecret(input.password);
    const demoAdminAccounts = loadDemoAdminAccounts();
    const existingDemoAdmin = demoAdminAccounts.find((entry) => entry.adminId === normalizedAdminId);

    if (existingDemoAdmin) {
      if (existingDemoAdmin.passwordHash !== passwordHash) {
        throw new AuthFlowError("INVALID_CREDENTIALS", "Invalid admin ID or password.");
      }

      persistDemoAdminSession({
        adminId: normalizedAdminId,
        fullName: existingDemoAdmin.fullName,
      });
      return { authMode: "demo", accessToken: "demo-admin-session", userId: normalizedAdminId };
    }

    const fullName = `Admin ${normalizedAdminId.toUpperCase()}`;
    saveDemoAdminAccounts([
      {
        adminId: normalizedAdminId,
        passwordHash,
        fullName,
        createdAt: new Date().toISOString(),
      },
      ...demoAdminAccounts,
    ]);
    persistDemoAdminSession({ adminId: normalizedAdminId, fullName });
    return { authMode: "demo", accessToken: "demo-admin-session", userId: normalizedAdminId };
  }

  const existingDemoAccount =
    input.role === "customer" && DEMO_AUTH_ENABLED
      ? findDemoAccountByEmail(normalizedEmail)
      : null;
  const localDemoProfile =
    input.role === "customer" && DEMO_AUTH_ENABLED
      ? loadDemoMemberProfiles().find((profile) => normalizeEmail(profile.email) === normalizedEmail) ?? null
      : null;

  if (input.role === "customer" && (shouldUseCustomerDemoAuth(normalizedEmail) || Boolean(existingDemoAccount) || Boolean(localDemoProfile))) {
    console.info("DEMO LOGIN PATH USED");
    const demoAccount = existingDemoAccount;
    if (demoAccount) {
      const incomingHash = await hashSecret(input.password);
      if (incomingHash !== demoAccount.passwordHash) {
        throw new AuthFlowError("INVALID_CREDENTIALS", "Invalid email or password.");
      }

      persistDemoSession({
        memberId: demoAccount.memberId,
        email: demoAccount.email,
        phone: demoAccount.phone,
        fullName: demoAccount.fullName,
      });
      return { authMode: "demo", accessToken: "demo-customer-session", userId: demoAccount.memberId };
    }

    if (DEMO_PROFILE_BOOTSTRAP_ENABLED) {
      const memberProfile = localDemoProfile ?? await findMemberProfileByEmail(normalizedEmail);
      if (memberProfile) {
        console.info("BOOTSTRAPPED DEMO LOGIN FROM MEMBER PROFILE");
        return bootstrapDemoAccountFromMemberProfile({
          email: normalizedEmail,
          password: input.password,
          memberRecord: memberProfile,
        });
      }
    }

    if (FORCE_CUSTOMER_DEMO_AUTH) {
      throw new AuthFlowError("INVALID_CREDENTIALS", "Invalid email or password.");
    }
  }

  console.info("SUPABASE LOGIN PATH USED");
  const authEmail = input.role === "admin" ? `${input.email.trim()}@admin.loyaltyhub.com` : normalizedEmail;
  const attemptedEmails =
    input.role === "customer"
      ? [authEmail, resolvePendingEmailAlias(normalizedEmail)].filter(
          (value, index, list): value is string => Boolean(value) && list.indexOf(value) === index
        )
      : [authEmail];

  let data: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>["data"] | null = null;
  let error: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>["error"] | null = null;

  for (const attemptedEmail of attemptedEmails) {
    const result = await supabase.auth.signInWithPassword({
      email: attemptedEmail,
      password: input.password,
    });

    data = result.data;
    error = result.error;

    if (!error) {
      if (attemptedEmail === normalizedEmail) {
        clearPendingEmailAlias(normalizedEmail);
      }
      break;
    }

    const signInCode = String(error.code ?? "").toLowerCase();
    const signInMessage = String(error.message ?? "").toLowerCase();
    const isInvalidCredentialsError = signInMessage.includes("invalid login credentials");
    const isEmailNotConfirmedError = signInCode === "email_not_confirmed" || signInMessage.includes("email not confirmed");

    if (!isInvalidCredentialsError && !isEmailNotConfirmedError) {
      break;
    }
  }

  if (error) {
    const signInCode = String(error.code ?? "").toLowerCase();
    const signInMessage = String(error.message ?? "").toLowerCase();
    const isEmailNotConfirmedError = signInCode === "email_not_confirmed" || signInMessage.includes("email not confirmed");
    const isInvalidCredentialsError = signInMessage.includes("invalid login credentials");

    if (isEmailNotConfirmedError) {
      throw new AuthFlowError("AUTH_EMAIL_NOT_CONFIRMED", "Email confirmation is still required for this account.", error);
    }
    if (isRateLimitError(error)) {
      throw new AuthFlowError(
        "AUTH_RATE_LIMIT",
        "Supabase temporarily blocked this auth attempt (429/rate limit). This usually happens in development when built-in auth email limits are exceeded.",
        error
      );
    }
    if (isInvalidCredentialsError) {
      throw new AuthFlowError("INVALID_CREDENTIALS", "Invalid email or password.", error);
    }
    throw new AuthFlowError("AUTH_PROVIDER_ERROR", extractErrorText(error) || "Unable to sign in.", error);
  }

  return {
    authMode: "supabase",
    accessToken: data?.session?.access_token,
    userId: data?.user?.id,
  };
}

export function mapAuthErrorToMessage(error: unknown): string {
  if (!(error instanceof AuthFlowError)) {
    return error instanceof Error ? error.message : "An unexpected auth error occurred.";
  }

  switch (error.code) {
    case "INVALID_EMAIL":
      return "Please enter a valid email address.";
    case "INVALID_PHONE":
      return "Please enter a valid Philippine mobile number, like +63 912 345 6789 or 09123456789.";
    case "MISSING_PASSWORD":
      return "Password is required.";
    case "INVALID_PASSWORD":
      return "Password must be at least 8 characters long.";
    case "DUPLICATE_EMAIL":
      return "Duplicate email.";
    case "DUPLICATE_PHONE":
      return "Duplicate number.";
    case "DUPLICATE_EMAIL_AND_PHONE":
      return "A user with that email and phone number already exists.";
    case "AUTH_RATE_LIMIT":
      return "Supabase Auth rate limit reached (429). In development, use a demo/test email (example.com/.test/.local) to avoid email-send limits, or wait 60 seconds and try again.";
    case "AUTH_EMAIL_NOT_CONFIRMED":
      return "Email confirmation is still required for this account. Confirm your email, then try signing in again.";
    case "INVALID_CREDENTIALS":
      return "Invalid email or password. Please check your credentials and try again.";
    case "PROFILE_CREATION_FAILED":
      return "Account authentication was created, but profile setup failed. Please try logging in, and contact support if the issue persists.";
    case "AUTH_PROVIDER_ERROR":
    default:
      return mapProviderErrorMessage(error.causeValue, error.message || "Authentication failed. Please try again.");
  }
}

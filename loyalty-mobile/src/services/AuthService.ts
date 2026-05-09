/**
 * Authentication Service
 * Connected to Supabase with Demo Auth fallback to match the exact auth flow
 * of the web application (customer-auth.ts).
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '../utils/supabase/client';
import ApiClient from './ApiClient';

const JWT_KEY = 'loyalty_jwt_token';
const USER_KEY = 'loyalty_user_data';

// ─── Demo Auth Configuration (mirrors web customer-auth.ts) ──────────
const DEMO_AUTH_ENABLED =
  Constants.expoConfig?.extra?.enableDemoAuth === 'true' ||
  Constants.expoConfig?.extra?.enableDemoAuth === true ||
  __DEV__;

const FORCE_CUSTOMER_DEMO_AUTH =
  Constants.expoConfig?.extra?.forceCustomerDemoAuth === 'true' ||
  Constants.expoConfig?.extra?.forceCustomerDemoAuth === true;

const DEMO_LOCAL_PART_HINTS = [
  'demo', 'test', 'fake', 'sample', 'qa', 'dev', 'staging', 'dummy', 'mock',
];

const DEMO_DOMAINS = new Set([
  'example.com', 'example.org', 'example.net', 'test.com', 'test.local',
  'local.test', 'localhost', 'invalid', 'mailinator.com', 'tempmail.com',
  'fake.com', 'fake.local', 'dummy.com', 'noemail.com',
]);

const DEMO_ADMIN_ID_HINTS = ['admin', 'demo', 'dev', 'test', 'qa'];

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'member' | 'program_manager';
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  error?: string;
}

// ─── Demo Auth Helpers ─────────────────────────────────────
function isDemoEmail(email: string): boolean {
  const normalised = email.trim().toLowerCase();
  const atIdx = normalised.indexOf('@');
  if (atIdx < 1) return false;

  const localPart = normalised.substring(0, atIdx);
  const domain = normalised.substring(atIdx + 1);

  if (DEMO_DOMAINS.has(domain)) return true;
  return DEMO_LOCAL_PART_HINTS.some((hint) => localPart.includes(hint));
}

function isDemoAdminId(adminId: string): boolean {
  const normalised = adminId.trim().toLowerCase();
  return DEMO_ADMIN_ID_HINTS.some((hint) => normalised.includes(hint));
}

function shouldUseDemoAuth(email: string): boolean {
  if (!DEMO_AUTH_ENABLED) return false;
  if (FORCE_CUSTOMER_DEMO_AUTH) return true;
  return isDemoEmail(email);
}

// Simple hash for demo password validation (mirrors web's hashSecret)
async function hashSecret(secret: string): Promise<string> {
  // Use a simple but consistent hash for demo purposes
  let hash = 0;
  const str = `loyaltyhub-demo-salt:${secret}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `demo-hash-${Math.abs(hash).toString(36)}`;
}

// Demo account storage keys (mirrors web's localStorage keys)
const DEMO_ACCOUNTS_KEY = 'loyaltyhub-demo-accounts-v1';
const DEMO_ADMIN_ACCOUNTS_KEY = 'loyaltyhub-demo-admin-accounts-v1';

type DemoAccount = {
  email: string;
  passwordHash: string;
  name: string;
  createdAt: string;
};

type DemoAdminAccount = {
  adminId: string;
  passwordHash: string;
  fullName: string;
  createdAt: string;
};

async function loadDemoAccounts(): Promise<DemoAccount[]> {
  const raw = await getItem(DEMO_ACCOUNTS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

async function saveDemoAccounts(accounts: DemoAccount[]): Promise<void> {
  await setItem(DEMO_ACCOUNTS_KEY, JSON.stringify(accounts));
}

async function loadDemoAdminAccounts(): Promise<DemoAdminAccount[]> {
  const raw = await getItem(DEMO_ADMIN_ACCOUNTS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

async function saveDemoAdminAccounts(accounts: DemoAdminAccount[]): Promise<void> {
  await setItem(DEMO_ADMIN_ACCOUNTS_KEY, JSON.stringify(accounts));
}

// ─── Storage Helpers ──────────────────────────────────────
async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try { localStorage.setItem(key, value); } catch (e) { console.error(e); }
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try { return localStorage.getItem(key); } catch (e) { console.error(e); return null; }
  } else {
    return await SecureStore.getItemAsync(key);
  }
}

async function removeItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try { localStorage.removeItem(key); } catch (e) { console.error(e); }
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}

// ─── Token Management ──────────────────────────────────────
export async function storeToken(token: string): Promise<void> {
  await setItem(JWT_KEY, token);
}

export async function getToken(): Promise<string | null> {
  // Try to get token from Supabase session first to ensure it's fresh
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return session.access_token;
    }
  } catch (e) {
    // Supabase might not be available (demo mode), fall through to local storage
  }
  return await getItem(JWT_KEY);
}

export async function removeToken(): Promise<void> {
  await removeItem(JWT_KEY);
}

// ─── User Data Management ──────────────────────────────────
export async function storeUser(user: User): Promise<void> {
  await setItem(USER_KEY, JSON.stringify(user));
}

export async function getStoredUser(): Promise<User | null> {
  const data = await getItem(USER_KEY);
  if (data) {
    try {
      return JSON.parse(data) as User;
    } catch {
      return null;
    }
  }
  return null;
}

export async function removeUser(): Promise<void> {
  await removeItem(USER_KEY);
}

// ─── Auth API Calls ────────────────────────────────────────

export async function login(email: string, password: string): Promise<AuthResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const isAdminLogin = normalizedEmail.includes('@admin.loyaltyhub.com');

  // ─── Demo Admin Login (matches web: auto-creates on first login) ─────
  if (isAdminLogin && DEMO_AUTH_ENABLED) {
    const adminId = normalizedEmail.replace('@admin.loyaltyhub.com', '');
    if (isDemoAdminId(adminId)) {
      console.info('[Mobile Auth] DEMO ADMIN LOGIN PATH');
      const passwordHash = await hashSecret(password);
      const demoAdminAccounts = await loadDemoAdminAccounts();
      const existingAdmin = demoAdminAccounts.find((a) => a.adminId === adminId);

      if (existingAdmin) {
        // Existing demo admin → validate password
        if (existingAdmin.passwordHash !== passwordHash) {
          return { success: false, error: 'Invalid admin ID or password.' };
        }
      } else {
        // First-time demo admin login → auto-create (same as web)
        await saveDemoAdminAccounts([
          { adminId, passwordHash, fullName: `Admin ${adminId.toUpperCase()}`, createdAt: new Date().toISOString() },
          ...demoAdminAccounts,
        ]);
      }

      const user: User = {
        id: `demo-admin-${adminId}`,
        email: normalizedEmail,
        name: existingAdmin?.fullName || `Admin ${adminId.toUpperCase()}`,
        role: 'program_manager',
      };
      await storeToken('demo-admin-session-' + Date.now());
      await storeUser(user);
      return { success: true, user };
    }
  }

  // ─── Demo Customer Login (matches web: existing account OR bootstrap from DB) ─────
  if (!isAdminLogin && shouldUseDemoAuth(normalizedEmail)) {
    const demoAccounts = await loadDemoAccounts();
    const existingAccount = demoAccounts.find((a) => a.email === normalizedEmail);

    // 1. Existing demo account → validate password
    if (existingAccount) {
      console.info('[Mobile Auth] DEMO CUSTOMER LOGIN - existing account');
      const passwordHash = await hashSecret(password);
      if (existingAccount.passwordHash !== passwordHash) {
        return { success: false, error: 'Invalid email or password.' };
      }

      const user: User = {
        id: `demo-customer-${Date.now()}`,
        email: normalizedEmail,
        name: existingAccount.name,
        role: 'member',
      };
      await storeToken('demo-customer-session-' + Date.now());
      await storeUser(user);
      return { success: true, user };
    }

    // 2. No demo account → try bootstrap from member profile in DB (like web does)
    try {
      const { data: memberData } = await supabase
        .from('loyalty_members')
        .select('first_name, last_name, member_number, email')
        .ilike('email', normalizedEmail)
        .maybeSingle();

      if (memberData) {
        console.info('[Mobile Auth] DEMO CUSTOMER LOGIN - bootstrapped from member profile');
        const passwordHash = await hashSecret(password);
        const name = `${memberData.first_name || ''} ${memberData.last_name || ''}`.trim() || normalizedEmail.split('@')[0];

        // Save new demo account so password is validated on future logins
        await saveDemoAccounts([
          { email: normalizedEmail, passwordHash, name, createdAt: new Date().toISOString() },
          ...demoAccounts,
        ]);

        const user: User = {
          id: `demo-customer-${Date.now()}`,
          email: normalizedEmail,
          name,
          role: 'member',
        };
        await storeToken('demo-customer-session-' + Date.now());
        await storeUser(user);
        return { success: true, user };
      }
    } catch (e) {
      console.warn('[Mobile Auth] Member profile lookup failed, falling through to Supabase');
    }

    // 3. No demo account + no member profile → fall through to Supabase
  }

  // ─── Real Supabase Login ──────────────────────────────
  try {
    console.info('[Mobile Auth] SUPABASE LOGIN PATH');
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (authError) throw authError;
    if (!authData.user || !authData.session) throw new Error('No session returned');

    // Fetch loyalty profile to match web behavior
    const isProgramManager = normalizedEmail.includes('admin');
    let name = normalizedEmail.split('@')[0];

    if (!isProgramManager) {
      const { data: memberData } = await supabase
        .from('loyalty_members')
        .select('first_name, last_name')
        .ilike('email', normalizedEmail)
        .maybeSingle();

      if (memberData && memberData.first_name) {
        name = `${memberData.first_name} ${memberData.last_name || ''}`.trim();
      }
    }

    const user: User = {
      id: authData.user.id,
      email: authData.user.email!,
      name,
      role: isProgramManager ? 'program_manager' : 'member',
    };

    await storeToken(authData.session.access_token);
    await storeUser(user);

    return { success: true, user };
  } catch (error: any) {
    console.warn('[Mobile Auth] Supabase Login Error:', error);
    return { success: false, error: error.message || 'Login failed' };
  }
}

export async function register(
  name: string,
  email: string,
  password: string
): Promise<AuthResult> {
  const normalizedEmail = email.trim().toLowerCase();

  // ─── Demo Registration ─────────────────────────────────
  if (shouldUseDemoAuth(normalizedEmail)) {
    console.info('[Mobile Auth] DEMO REGISTER PATH');
    const passwordHash = await hashSecret(password);
    const demoAccounts = await loadDemoAccounts();

    // Check if account already exists
    const existing = demoAccounts.find((a) => a.email === normalizedEmail);
    if (existing) {
      return { success: false, error: 'An account with this email already exists.' };
    }

    // Save demo account (for future login validation)
    await saveDemoAccounts([
      { email: normalizedEmail, passwordHash, name, createdAt: new Date().toISOString() },
      ...demoAccounts,
    ]);

    // Do NOT store token/user — user must login separately
    const user: User = {
      id: `demo-member-${Date.now()}`,
      email: normalizedEmail,
      name,
      role: 'member',
    };
    return { success: true, user };
  }

  // ─── Real Supabase Registration ────────────────────────
  try {
    console.info('[Mobile Auth] SUPABASE REGISTER PATH');
    const [firstName, ...lastNameParts] = name.split(' ');
    const lastName = lastNameParts.join(' ');

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
        },
      },
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error('Failed to create account');

    // Sign out immediately so user doesn't stay logged in
    await supabase.auth.signOut();

    const user: User = {
      id: authData.user.id,
      email: authData.user.email!,
      name,
      role: normalizedEmail.includes('admin') ? 'program_manager' : 'member',
    };

    if (!authData.session) {
      return { 
        success: true, 
        user, 
        error: 'Please check your email to confirm your account.' 
      };
    }

    return { success: true, user };
  } catch (error: any) {
    console.warn('[Mobile Auth] Supabase Register Error:', error);
    return { success: false, error: error.message || 'Registration failed' };
  }
}

export async function forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
    if (error) throw error;
    
    return { success: true, message: 'Password reset email sent successfully.' };
  } catch (error: any) {
    console.warn('[Mobile Auth] Forgot Password Error:', error);
    return { success: false, message: error.message || 'Failed to send reset email.' };
  }
}

export async function logout(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.warn('[Mobile Auth] SignOut Error:', e);
  }
  await removeToken();
  await removeUser();
}


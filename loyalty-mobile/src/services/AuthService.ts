/**
 * Authentication Service
 * Handles JWT storage via expo-secure-store and auth API calls
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import ApiClient from './ApiClient';

const JWT_KEY = 'loyalty_jwt_token';
const USER_KEY = 'loyalty_user_data';

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
  try {
    const response = await ApiClient.post<LoginResponse>('/auth/login', { email, password });

    if (response.ok && response.data.token) {
      await storeToken(response.data.token);
      await storeUser(response.data.user);
      return { success: true, user: response.data.user };
    }

    return { success: false, error: response.data?.toString() || 'Login failed' };
  } catch (error) {
    // Fallback: mock login for development when API is unavailable
    console.warn('API unavailable — using mock login');
    const mockUser: User = {
      id: '1',
      email,
      name: email.split('@')[0],
      role: email.includes('admin') ? 'program_manager' : 'member',
    };
    await storeToken('mock_jwt_token_' + Date.now());
    await storeUser(mockUser);
    return { success: true, user: mockUser };
  }
}

export async function register(
  name: string,
  email: string,
  password: string
): Promise<AuthResult> {
  try {
    const response = await ApiClient.post<LoginResponse>('/auth/register', {
      name,
      email,
      password,
    });

    if (response.ok && response.data.token) {
      await storeToken(response.data.token);
      await storeUser(response.data.user);
      return { success: true, user: response.data.user };
    }

    return { success: false, error: response.data?.toString() || 'Registration failed' };
  } catch (error) {
    // Fallback: mock register for development
    console.warn('API unavailable — using mock registration');
    const mockUser: User = {
      id: '2',
      email,
      name,
      role: 'member',
    };
    await storeToken('mock_jwt_token_' + Date.now());
    await storeUser(mockUser);
    return { success: true, user: mockUser };
  }
}

export async function forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await ApiClient.post('/auth/forgot-password', { email });
    if (response.ok) {
      return { success: true, message: 'Password reset email sent successfully.' };
    }
    return { success: false, message: 'Failed to send reset email. Please try again.' };
  } catch (error) {
    // Fallback for dev
    console.warn('API unavailable — mock password reset');
    return { success: true, message: 'Password reset email sent (mock).' };
  }
}

export async function logout(): Promise<void> {
  await removeToken();
  await removeUser();
}

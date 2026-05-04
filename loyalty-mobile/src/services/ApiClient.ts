/**
 * @retail/api-client stub
 * HTTP client with JWT authentication interceptor
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const API_BASE_URL = 'http://localhost:4000';
const JWT_KEY = 'loyalty_jwt_token';

interface ApiResponse<T = any> {
  data: T;
  status: number;
  ok: boolean;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  let token: string | null = null;
  if (Platform.OS === 'web') {
    try { token = localStorage.getItem(JWT_KEY); } catch (e) { console.error(e); }
  } else {
    token = await SecureStore.getItemAsync(JWT_KEY);
  }
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function request<T = any>(
  method: string,
  endpoint: string,
  body?: any
): Promise<ApiResponse<T>> {
  try {
    const headers = await getAuthHeaders();
    const config: RequestInit = {
      method,
      headers,
    };
    if (body) {
      config.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    const data = await response.json();

    return {
      data,
      status: response.status,
      ok: response.ok,
    };
  } catch (error) {
    console.warn(`API ${method} ${endpoint} failed (using mock fallback):`, error);
    throw error;
  }
}

export const ApiClient = {
  get: <T = any>(endpoint: string) => request<T>('GET', endpoint),
  post: <T = any>(endpoint: string, body?: any) => request<T>('POST', endpoint, body),
  put: <T = any>(endpoint: string, body?: any) => request<T>('PUT', endpoint, body),
  patch: <T = any>(endpoint: string, body?: any) => request<T>('PATCH', endpoint, body),
  delete: <T = any>(endpoint: string) => request<T>('DELETE', endpoint),
};

export default ApiClient;

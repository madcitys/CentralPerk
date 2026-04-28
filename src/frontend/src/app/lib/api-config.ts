export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_GATEWAY_URL ||
  ""
).replace(/\/+$/, "");

export function normalizeApiPath(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const withoutLegacyPrefix = path === "/api" ? "/" : path.startsWith("/api/") ? path.slice(4) : path;
  return withoutLegacyPrefix.startsWith("/") ? withoutLegacyPrefix : `/${withoutLegacyPrefix}`;
}

export function apiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = normalizeApiPath(path);
  return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath;
}

export const BACKEND_OFFLINE_MESSAGE = API_BASE_URL
  ? `Backend is offline. Start the gateway or backend on ${API_BASE_URL}.`
  : "Backend is offline. Set NEXT_PUBLIC_API_BASE_URL or NEXT_PUBLIC_GATEWAY_URL and start the backend.";

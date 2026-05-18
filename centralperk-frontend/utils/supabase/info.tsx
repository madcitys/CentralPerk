declare global {
  interface Window {
    __CENTRALPERK_RUNTIME_CONFIG__?: {
      supabaseUrl?: string;
      projectId?: string;
      publicAnonKey?: string;
    };
  }
}

function readRuntimeConfig() {
  if (typeof window === "undefined") return null;
  return window.__CENTRALPERK_RUNTIME_CONFIG__ ?? null;
}

const runtimeConfig = readRuntimeConfig();
const envUrl =
  runtimeConfig?.supabaseUrl?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  process.env.MEMBER_SUPABASE_URL?.trim() ||
  process.env.VITE_SUPABASE_URL?.trim() ||
  "";
const envProjectId =
  runtimeConfig?.projectId?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ID?.trim() ||
  process.env.VITE_SUPABASE_PROJECT_ID?.trim() ||
  "";

const derivedProjectId = envUrl
  .replace(/^https?:\/\//, "")
  .replace(".supabase.co", "")
  .split(".")[0];

export const projectId = envProjectId || derivedProjectId;
export const supabaseUrl = envUrl || (projectId ? `https://${projectId}.supabase.co` : "");
export const publicAnonKey =
  runtimeConfig?.publicAnonKey?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  process.env.MEMBER_SUPABASE_ANON_KEY?.trim() ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
  "";

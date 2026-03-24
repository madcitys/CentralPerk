const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const envProjectId = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ID?.trim() ?? "";

const derivedProjectId = envUrl
  .replace(/^https?:\/\//, "")
  .replace(".supabase.co", "")
  .split(".")[0];

export const projectId = envProjectId || derivedProjectId;
export const supabaseUrl = envUrl || (projectId ? `https://${projectId}.supabase.co` : "");
export const publicAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  "";

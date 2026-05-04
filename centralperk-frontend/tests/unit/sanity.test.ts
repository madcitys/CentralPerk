import { projectId, supabaseUrl, publicAnonKey } from "@/utils/supabase/info";

describe("Supabase Info Utility", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("should handle empty environment variables", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ID = "";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY = "";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    
    const info = require("@/utils/supabase/info");
    expect(info.projectId).toBe("");
    expect(info.supabaseUrl).toBe("");
    expect(info.publicAnonKey).toBe("");
  });

  it("should use NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY if available", () => {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "key1";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY = "key2";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "key3";
    
    const info = require("@/utils/supabase/info");
    expect(info.publicAnonKey).toBe("key1");
  });

  it("should use NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY if key1 is missing", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY = "key2";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "key3";
    
    const info = require("@/utils/supabase/info");
    expect(info.publicAnonKey).toBe("key2");
  });

  it("should use NEXT_PUBLIC_SUPABASE_PROJECT_ID if available", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://xyz.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ID = "explicit-id";
    
    const info = require("@/utils/supabase/info");
    expect(info.projectId).toBe("explicit-id");
  });

  it("should derive projectId if explicit ID is missing", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    delete process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ID;
    
    const info = require("@/utils/supabase/info");
    expect(info.projectId).toBe("abc");
  });
});

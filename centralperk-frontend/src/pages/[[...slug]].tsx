import dynamic from "next/dynamic";
import Script from "next/script";
import type { GetServerSidePropsContext } from "next";

function LoadingShell() {
  return (
    <main className="min-h-screen bg-white text-[#1A2B47] flex items-center justify-center p-6">
      <div className="text-center">
        <p className="text-lg font-semibold">Loading GREENOVATE...</p>
        <p className="mt-2 text-sm text-slate-500">Initializing the app shell.</p>
      </div>
    </main>
  );
}

const LegacySpaApp = dynamic(
  () => import("../next/LegacySpaApp").then((mod) => mod.LegacySpaApp),
  {
    ssr: false,
    loading: () => <LoadingShell />,
  },
);

type CatchAllPageProps = {
  runtimeConfig: {
    supabaseUrl: string;
    projectId: string;
    publicAnonKey: string;
  };
};

export default function CatchAllPage({ runtimeConfig }: CatchAllPageProps) {
  return (
    <>
      <Script
        id="centralperk-runtime-config"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{
          __html: `window.__CENTRALPERK_RUNTIME_CONFIG__ = ${JSON.stringify(runtimeConfig)};`,
        }}
      />
      <LegacySpaApp />
    </>
  );
}

export async function getServerSideProps(context: GetServerSidePropsContext) {
  context.res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  context.res.setHeader("Pragma", "no-cache");
  context.res.setHeader("Expires", "0");

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.MEMBER_SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    "";
  const projectId =
    process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ID?.trim() ||
    process.env.VITE_SUPABASE_PROJECT_ID?.trim() ||
    supabaseUrl.replace(/^https?:\/\//, "").replace(".supabase.co", "").split(".")[0] ||
    "";
  const publicAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.MEMBER_SUPABASE_ANON_KEY?.trim() ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    "";

  return {
    props: {
      runtimeConfig: {
        supabaseUrl,
        projectId,
        publicAnonKey,
      },
    },
  };
}

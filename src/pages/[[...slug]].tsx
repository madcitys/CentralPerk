import dynamic from "next/dynamic";

const LegacySpaApp = dynamic(
  () => import("../next/LegacySpaApp").then((mod) => mod.LegacySpaApp),
  {
    ssr: false,
    loading: () => (
      <main className="min-h-screen bg-white text-[#1A2B47] flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-lg font-semibold">Loading CentralPerk...</p>
          <p className="mt-2 text-sm text-slate-500">Initializing the app shell.</p>
        </div>
      </main>
    ),
  }
);

export default function CatchAllPage() {
  return <LegacySpaApp />;
}

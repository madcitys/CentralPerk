export default function AdminSettingsPage() {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">Administrative configuration</p>
      </div>

      <div className="bg-gradient-to-br from-[#eef6ff] via-white to-[#f5f0ff] rounded-xl p-6 border border-[#9ed8ff]">
        <h2 className="text-xl font-semibold text-gray-900 mb-3">System Notes</h2>
        <p className="text-gray-600">
          This section is reserved for admin configuration options. Add role management,
          thresholds, and reward rules here as your backend endpoints are finalized.
        </p>
      </div>
    </div>
  );
}


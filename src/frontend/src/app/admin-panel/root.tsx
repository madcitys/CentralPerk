import { Activity, Award, BarChart3, Bell, Home, LogOut, Menu, Settings, Sparkles, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { cn } from "../../components/ui/utils";
import { supabase } from "../../utils/supabase/client";
import type { AppNotification } from "../lib/notifications";
import { brandTealSolidClass } from "../lib/ui-color-tokens";
import { loadNotificationsViaApi, markNotificationReadViaApi } from "../lib/api";
import { clearStoredAuth, touchStoredAdminSession } from "../auth/auth";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

function useLocalDemoRealtimeFallback() {
  return (
    process.env.NEXT_PUBLIC_USE_REMOTE_LOYALTY_API !== "true" &&
    (process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH === "true" ||
      process.env.NEXT_PUBLIC_USE_LOCAL_LOYALTY_API === "true")
  );
}

const navItems = [
  { to: "/admin", label: "Dashboard", icon: Home, end: true },
  { to: "/admin/members", label: "Members", icon: Users },
  { to: "/admin/activity", label: "Activity", icon: Activity },
  { to: "/admin/rewards", label: "Rewards", icon: Award },
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/admin/engagement", label: "Engagement", icon: Sparkles },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

export default function AdminRoot() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const loadNotifications = async () => {
    try {
      const response = await loadNotificationsViaApi({ limit: 20 });
      setNotifications(response.notifications.filter((item) => item.status !== "read"));
    } catch {
    }
  };

  useEffect(() => {
    loadNotifications().catch(() => {});

    if (useLocalDemoRealtimeFallback()) return;

    const channel = supabase
      .channel("admin-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notification_outbox" },
        () => {
          loadNotifications().catch(() => {});
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleNotificationClick = async (notificationId: string) => {
    try {
      await markNotificationReadViaApi(notificationId);
      setNotifications((prev) => prev.filter((item) => item.id !== notificationId));
    } catch {
    }
  };

  useEffect(() => {
    let timeoutRef: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      clearTimeout(timeoutRef);
      touchStoredAdminSession();
      timeoutRef = setTimeout(() => {
        handleLogout().catch(() => {});
      }, IDLE_TIMEOUT_MS);
    };

    const events: (keyof WindowEventMap)[] = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      clearTimeout(timeoutRef);
      events.forEach((eventName) => window.removeEventListener(eventName, resetTimer));
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    clearStoredAuth();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7fbff_0%,#ffffff_28%,#f9fbff_100%)]" style={{ fontFamily: "'Poppins', sans-serif" }}>
      <div className="fixed left-0 right-0 top-0 z-40 border-b border-[#dbe6f7] bg-white/95 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1A2B47]">
              <span className="text-sm font-bold text-white">CP</span>
            </div>
            <div>
              <h1 className="font-bold text-gray-900">CentralPerk</h1>
              <p className="text-xs text-gray-500">Admin Panel</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setNotifOpen((s) => !s)}
              className="relative rounded-lg p-2 hover:bg-gray-100"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5 text-[#1A2B47]" />
              {notifications.length > 0 ? (
                <span className={cn("absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold", brandTealSolidClass)}>
                  {Math.min(notifications.length, 9)}
                </span>
              ) : null}
            </button>
            <button
              onClick={() => setSidebarOpen((s) => !s)}
              className="rounded-lg p-2 hover:bg-gray-100"
              aria-label="Toggle sidebar"
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-30 w-64 transform border-r border-white/15 bg-[#1A2B47] transition-transform duration-300 ease-in-out",
          "lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-white/15 p-6">
            <div className="flex items-center gap-3">
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", brandTealSolidClass)}>
                <span className="text-sm font-bold text-white">CP</span>
              </div>
              <div>
                <h1 className="font-bold text-white">CentralPerk</h1>
                <p className="text-xs text-slate-300">Admin Panel</p>
              </div>
            </div>
          </div>

          <div className="border-b border-white/15 p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10 font-semibold text-white">
                AD
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-white">Admin User</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="inline-flex items-center rounded border border-[#92d8df] bg-[#d8f6f8] px-2 py-0.5 text-xs font-medium text-[#0f5f65]">
                    Administrator
                  </span>
                </div>
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto p-4">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all",
                    isActive ? brandTealSolidClass : "text-slate-100 hover:bg-white/10 hover:text-white",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon className={cn("h-5 w-5", isActive && "text-white")} />
                    {item.label}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="space-y-2 border-t border-white/15 p-4">
            <button
              onClick={handleLogout}
              className="inline-flex w-full items-center justify-start gap-3 rounded-xl border border-white/20 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10"
            >
              <LogOut className="h-5 w-5" />
              Logout
            </button>
            <p className="text-center text-xs text-slate-300">(c) 2026 CentralPerk</p>
          </div>
        </div>
      </div>

      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <div className="bg-transparent pt-16 lg:pl-64 lg:pt-0">
        <main className="p-4 lg:p-8">
          <div className="relative mb-4 hidden justify-end lg:flex">
            <button
              onClick={() => setNotifOpen((s) => !s)}
              className="relative inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white p-2 hover:bg-gray-50"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5 text-[#1A2B47]" />
              {notifications.length > 0 ? (
                <span className={cn("absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold", brandTealSolidClass)}>
                  {Math.min(notifications.length, 9)}
                </span>
              ) : null}
            </button>
          </div>

          {notifOpen ? (
            <div className="z-50 mb-4 w-full max-w-sm rounded-xl border border-[#9ed8ff] bg-[#f8fcff] p-3 shadow-lg lg:absolute lg:right-8 lg:top-20">
              <p className="mb-2 text-sm font-semibold text-[#1A2B47]">Notifications</p>
              {notifications.length === 0 ? (
                <p className="text-sm text-gray-500">No new notifications.</p>
              ) : (
                <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                  {notifications.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleNotificationClick(item.id)}
                      className="block w-full rounded-lg border border-gray-200 bg-white p-2 text-left transition hover:border-[#c5d6ec] hover:bg-[#f7fbff]"
                    >
                      <p className="text-sm font-semibold text-[#1A2B47]">{item.subject}</p>
                      <p className="mt-1 text-xs text-gray-600">{item.message}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <Outlet />
        </main>
      </div>
    </div>
  );
}

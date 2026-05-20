import { Outlet, NavLink } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Award, Bell, Clock3, Gift, Home, Leaf, LogOut, Menu, Sparkles, User, X } from "lucide-react";
import { cn } from "../../components/ui/utils";
import type { MemberData } from "../types/loyalty";
import { ThemeInitializer } from "../../components/theme-initializer";
import { Toaster } from "../../components/ui/sonner";
import type { AppOutletContext } from "../types/app-context";
import { loadMemberSnapshot } from "../lib/loyalty-supabase";
import type { AppNotification } from "../lib/notifications";
import { loadNotificationsViaApi, markNotificationReadViaApi } from "../lib/api";
import { supabase } from "../../utils/supabase/client";
import { clearStoredAuth, touchStoredCustomerSession } from "../auth/auth";
import { brandTealSolidClass } from "../lib/ui-color-tokens";
import { DEMO_MEMBER_ID, DEMO_POINTS, DEMO_TIER, withDemoMemberData } from "../lib/demo-loyalty-data";

const USER_STORAGE_KEY = "points-dashboard-user-v1";
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

const DEFAULT_MEMBER: MemberData = {
  memberId: DEMO_MEMBER_ID,
  fullName: "Sarah Johnson",
  email: "sarah.johnson@example.com",
  phone: "+639763227122",
  birthdate: "",
  profileImage:
    "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=300&q=80",
  tier: DEMO_TIER,
  memberSince: "2024-08-15",
  status: "Active",
  points: DEMO_POINTS,
  pendingPoints: 0,
  lifetimePoints: 184900,
  expiringPoints: 0,
  daysUntilExpiry: 0,
  earnedThisMonth: 13271,
  redeemedThisMonth: 12930,
  profileComplete: true,
  hasDownloadedApp: false,
  surveysCompleted: 0,
  transactions: [],
};

function deriveCompletedTaskIds(user: MemberData): string[] {
  const pattern = /Task completed \(([^)]+)\)/i;
  return user.transactions
    .map((tx) => {
      const match = String(tx.description || "").match(pattern);
      return match?.[1] ?? null;
    })
    .filter((id): id is string => Boolean(id));
}

function loadUser(): MemberData {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return withDemoMemberData(DEFAULT_MEMBER);
    return withDemoMemberData({ ...DEFAULT_MEMBER, ...JSON.parse(raw) } as MemberData);
  } catch {
    return withDemoMemberData(DEFAULT_MEMBER);
  }
}

export default function Root() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [user, setUser] = useState<MemberData>(loadUser);
  const userRef = useRef(user);
  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const basePath = "/customer";
  const navigation = [
    { name: "Dashboard", href: `${basePath}`, icon: Home },
    { name: "Earn Points", href: `${basePath}/earn`, icon: Gift },
    { name: "Activity", href: `${basePath}/activity`, icon: Activity },
    { name: "Rewards", href: `${basePath}/rewards`, icon: Award },
    { name: "Engagement", href: `${basePath}/engagement`, icon: Sparkles },
    { name: "Profile", href: `${basePath}/profile`, icon: User },
  ];

  useEffect(() => {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    userRef.current = user;
  }, [user]);

  const refreshUser = useCallback(async () => {
    try {
      const snapshot = await loadMemberSnapshot(userRef.current);
      if (!snapshot) return;
      setUser((prev) => withDemoMemberData({ ...prev, ...snapshot }));
    } catch {
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const response = await loadNotificationsViaApi({
        memberId: userRef.current.memberId || undefined,
        email: userRef.current.email || undefined,
        limit: 20,
      });
      setNotifications(response.notifications.filter((item) => item.status !== "read"));
    } catch {
    }
  }, []);

  useEffect(() => {
    refreshUser().catch(() => {});
    loadNotifications().catch(() => {});
  }, [loadNotifications, refreshUser]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      refreshUser().catch(() => {});
      loadNotifications().catch(() => {});
    }, 30_000);

    const handleWindowFocus = () => {
      refreshUser().catch(() => {});
      loadNotifications().catch(() => {});
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") handleWindowFocus();
    };

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadNotifications, refreshUser]);

  useEffect(() => {
    const fromTransactions = deriveCompletedTaskIds(user);
    if (fromTransactions.length === 0) return;
    setCompletedTaskIds((prev) => [...new Set([...prev, ...fromTransactions])]);
  }, [user]);

  const handleNotificationClick = async (notificationId: string) => {
    try {
      await markNotificationReadViaApi(notificationId);
      setNotifications((prev) => prev.filter((item) => item.id !== notificationId));
    } catch {
    }
  };

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    clearStoredAuth();
    localStorage.removeItem(USER_STORAGE_KEY);
    window.location.replace("/login");
  }, []);

  useEffect(() => {
    let timeoutRef: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      clearTimeout(timeoutRef);
      touchStoredCustomerSession();
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
  }, [handleLogout]);

  const notificationCount = notifications.length + (user.expiringPoints > 0 ? 1 : 0);
  const openNotifications = () => setNotifOpen((s) => !s);
  const notificationPanel = (
    <div className="w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
      <p className="mb-2 text-sm font-semibold text-[#1A2B47]">Notifications</p>
      {user.expiringPoints > 0 || notifications.length > 0 ? (
        <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
          {user.expiringPoints > 0 ? (
            <div className="rounded-lg border border-[#00A3AD]/35 bg-[#e6f8fa] p-3">
              <div className="flex items-start gap-2">
                <Clock3 className="mt-0.5 h-4 w-4 text-[#1A2B47]" />
                <div>
                  <p className="text-sm font-semibold text-[#1A2B47]">{user.expiringPoints} points expiring soon</p>
                  <p className="text-xs text-[#1A2B47]/80">Expires in {user.daysUntilExpiry} days.</p>
                </div>
              </div>
            </div>
          ) : null}

          {notifications.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNotificationClick(item.id)}
              className="block w-full rounded-lg border border-gray-200 bg-gray-50 p-3 text-left transition hover:border-[#c5d6ec] hover:bg-[#f7fbff]"
            >
              <p className="text-sm font-semibold text-[#1A2B47]">{item.subject}</p>
              <p className="mt-1 text-xs text-gray-600">{item.message}</p>
              <p className="mt-1 text-[11px] text-gray-500">{new Date(item.createdAt).toLocaleString()}</p>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">No new notifications.</p>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f2fbf8_0%,#f7fafc_48%,#edf8f4_100%)]">
      <ThemeInitializer />

      <div className="fixed left-0 right-0 top-0 z-40 border-b border-[#d6eee8] bg-white/92 shadow-[0_8px_20px_rgba(0,96,86,0.06)] backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", brandTealSolidClass)}>
              <Leaf className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900">GREENOVATE</h1>
              <p className="text-xs text-gray-500">Pharmacy Rewards</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={openNotifications}
                className="relative rounded-lg p-2 transition hover:bg-[#eef5ff]"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5 text-[#1A2B47]" />
                {notificationCount > 0 ? (
                  <span className={cn("absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold", brandTealSolidClass)}>
                    {Math.min(notificationCount, 9)}
                  </span>
                ) : null}
              </button>
              {notifOpen ? <div className="absolute right-0 top-full z-50 mt-3">{notificationPanel}</div> : null}
            </div>
            <button onClick={() => setSidebarOpen((open) => !open)} className="rounded-lg p-2 transition hover:bg-[#eef5ff]" aria-label="Toggle sidebar">
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {!sidebarOpen ? (
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="fixed left-3 top-1/2 z-40 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[#bfe9e4] bg-[linear-gradient(180deg,#ffffff_0%,#effcf8_100%)] text-[#061e3b] shadow-[0_12px_28px_rgba(0,96,86,0.16)] transition hover:border-[#8bd3c8] hover:bg-[#eefbf8] hover:text-[#00736f] lg:inline-flex"
          aria-label="Open sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 w-[260px] transform border-r border-white/10 bg-[linear-gradient(180deg,#061e3b_0%,#051a35_54%,#031427_100%)] transition-transform duration-300 ease-in-out",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-white/10 px-5 py-7">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#049c9d] shadow-[0_14px_28px_rgba(0,0,0,0.22)]">
                <Leaf className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-[21px] font-black leading-none tracking-tight text-white">GREENOVATE</h1>
                <p className="mt-1.5 text-[12px] font-medium tracking-[0.18em] text-slate-300">PHARMACY</p>
              </div>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-200 transition hover:bg-white/10 hover:text-white"
                aria-label="Close sidebar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="border-b border-white/10 px-5 py-5">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="flex items-center gap-3.5">
                <img
                  src={user.profileImage}
                  alt={user.fullName}
                  className="h-12 w-12 rounded-full border border-white/20 bg-white/10 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-black text-white">{user.fullName}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="inline-flex items-center rounded bg-[#008c80] px-2.5 py-0.5 text-[10px] font-black text-white">
                      {user.tier}
                    </span>
                    <span className="text-[12px] font-medium text-slate-200">{user.points.toLocaleString()} pts</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-3 overflow-y-auto px-5 py-6">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                end={item.href === basePath}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex h-12 items-center gap-4 rounded-xl px-4 text-[14px] font-black transition-all",
                    isActive
                      ? "bg-[linear-gradient(135deg,#0b999a_0%,#078985_100%)] text-white shadow-[0_14px_30px_rgba(0,140,128,0.25)]"
                      : "text-slate-100 hover:bg-white/10 hover:text-white"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon className={cn("h-5 w-5", isActive && "text-white")} />
                    {item.name}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="space-y-2 border-t border-white/10 p-5">
            <button
              onClick={() => setLogoutConfirmOpen(true)}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/18 px-3 text-[14px] font-black text-white transition hover:bg-white/12"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      {sidebarOpen ? <div className="fixed inset-0 z-20 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} /> : null}

      {notifOpen ? <div className="fixed right-5 top-16 z-50 hidden lg:block">{notificationPanel}</div> : null}

      <div className={cn("pt-16 transition-[padding] duration-300 ease-in-out lg:pt-0", sidebarOpen ? "lg:pl-[260px]" : "lg:pl-0")}>
        <Outlet
          context={
            {
              user,
              setUser,
              refreshUser,
              completedTaskIds,
              setCompletedTaskIds,
              notificationCount,
              openNotifications,
            } satisfies AppOutletContext
          }
        />
      </div>

      {logoutConfirmOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[#dce7f0] bg-white p-5 shadow-2xl">
            <h2 className="text-lg font-black text-[#061e3b]">Log out?</h2>
            <p className="mt-2 text-sm font-medium text-[#64748b]">End your GREENOVATE customer session now?</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setLogoutConfirmOpen(false)}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-[#d6e3ee] bg-white text-sm font-black text-[#10213a] transition hover:bg-[#f8fafc]"
              >
                No
              </button>
              <button
                type="button"
                onClick={() => {
                  setLogoutConfirmOpen(false);
                  handleLogout().catch(() => undefined);
                }}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-[#008c80] text-sm font-black text-white transition hover:bg-[#00736f]"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Toaster position="top-right" richColors />
    </div>
  );
}

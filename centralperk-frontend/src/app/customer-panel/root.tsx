import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../../components/ui/utils";
import { Home, Gift, Activity, Award, User, Menu, X, Bell, Clock3, LogOut, Sparkles } from "lucide-react";
import type { MemberData } from "../types/loyalty";
import { ThemeInitializer } from "../../components/theme-initializer";
import { Toaster } from "../../components/ui/sonner";
import type { AppOutletContext } from "../types/app-context";
import { loadMemberSnapshot } from "../lib/loyalty-supabase";
import type { AppNotification } from "../lib/notifications";
import { clearApiReadCache, loadMemberSnapshotViaApi, loadNotificationsViaApi, markNotificationReadViaApi } from "../lib/api";

import { supabase } from "../../utils/supabase/client";
import { clearStoredAuth, getStoredCustomerSession, touchStoredCustomerSession } from "../auth/auth";
import { brandTealSolidClass } from "../lib/ui-color-tokens";
import { customerPageShellClass } from "./lib/page-theme";

const USER_STORAGE_KEY = "points-dashboard-user-v1";
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const LOCAL_REFRESH_INTERVAL_MS = 30_000;
const CUSTOMER_REFRESH_MIN_INTERVAL_MS = 12_000;
const NOTIFICATION_REFRESH_MIN_INTERVAL_MS = 20_000;

function useLocalDemoRealtimeFallback() {
  return (
    process.env.NEXT_PUBLIC_USE_REMOTE_LOYALTY_API !== "true" &&
    (process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH === "true" ||
      process.env.NEXT_PUBLIC_USE_LOCAL_LOYALTY_API === "true")
  );
}


const DEFAULT_MEMBER: MemberData = {
  memberId: "",
  fullName: "Member",
  email: "",
  phone: "",
  birthdate: "",
  profileImage:
    "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=300&q=80",
  tier: "Bronze",
  memberSince: "",
  status: "Active",
  points: 0,
  pendingPoints: 0,
  lifetimePoints: 0,
  expiringPoints: 0,
  daysUntilExpiry: 0,
  earnedThisMonth: 0,
  redeemedThisMonth: 0,
  profileComplete: false,
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
    const session = getStoredCustomerSession();
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) {
      return {
        ...DEFAULT_MEMBER,
        memberId: session?.memberId || DEFAULT_MEMBER.memberId,
        fullName: session?.fullName || DEFAULT_MEMBER.fullName,
        email: session?.email || DEFAULT_MEMBER.email,
        phone: session?.phone || DEFAULT_MEMBER.phone,
      };
    }
    const parsed = { ...DEFAULT_MEMBER, ...JSON.parse(raw) } as MemberData;
    return {
      ...parsed,
      memberId: parsed.memberId || session?.memberId || "",
      fullName: parsed.fullName || session?.fullName || "Member",
      email: parsed.email || session?.email || "",
      phone: parsed.phone || session?.phone || "",
      points: 0,
      pendingPoints: 0,
      lifetimePoints: 0,
      expiringPoints: 0,
      daysUntilExpiry: 0,
      earnedThisMonth: 0,
      redeemedThisMonth: 0,
      transactions: [],
    };
  } catch {
    return DEFAULT_MEMBER;
  }
}

export default function Root() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [user, setUser] = useState<MemberData>(loadUser);
  const userRef = useRef(user);
  const refreshInFlightRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const notificationsInFlightRef = useRef(false);
  const lastNotificationsAtRef = useRef(0);
  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    userRef.current = user;
  }, [user]);

  const basePath = "/customer";

  const refreshUser = useCallback(async (options?: { force?: boolean }) => {
    const now = Date.now();
    if (!options?.force && now - lastRefreshAtRef.current < CUSTOMER_REFRESH_MIN_INTERVAL_MS) return;
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      if (options?.force) clearApiReadCache();
      const currentUser = userRef.current;
      const hasMemberLookup = Boolean(currentUser.memberId || currentUser.email);
      const snapshot = hasMemberLookup
        ? await loadMemberSnapshotViaApi(currentUser).catch(() => loadMemberSnapshot(currentUser))
        : await loadMemberSnapshot(currentUser);
      if (!snapshot) return;
      setUser((prev) => ({ ...prev, ...snapshot }));
      lastRefreshAtRef.current = Date.now();
    } catch {
    } finally {
      refreshInFlightRef.current = false;
    }
  }, []);

  const loadNotifications = useCallback(async (options?: { force?: boolean }) => {
    const now = Date.now();
    if (!options?.force && now - lastNotificationsAtRef.current < NOTIFICATION_REFRESH_MIN_INTERVAL_MS) return;
    if (notificationsInFlightRef.current) return;
    notificationsInFlightRef.current = true;
    try {
      if (options?.force) clearApiReadCache();
      const response = await loadNotificationsViaApi({
        memberId: userRef.current.memberId || undefined,
        email: userRef.current.email || undefined,
        limit: 20,
      });
      setNotifications(response.notifications.filter((item) => item.status !== "read"));
      lastNotificationsAtRef.current = Date.now();
    } catch {
    } finally {
      notificationsInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    refreshUser({ force: true }).catch(() => {});
    loadNotifications({ force: true }).catch(() => {});
  }, []);

  useEffect(() => {
    const refreshVisibleUser = () => {
      if (document.visibilityState === "visible") {
        refreshUser().catch(() => {});
      }
    };
    const interval = window.setInterval(refreshVisibleUser, LOCAL_REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refreshVisibleUser);
    window.addEventListener("pageshow", refreshVisibleUser);
    document.addEventListener("visibilitychange", refreshVisibleUser);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisibleUser);
      window.removeEventListener("pageshow", refreshVisibleUser);
      document.removeEventListener("visibilitychange", refreshVisibleUser);
    };
  }, [refreshUser]);

  useEffect(() => {
    if (useLocalDemoRealtimeFallback()) return;

    const notificationChannel = supabase
      .channel("customer-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notification_outbox" },
        () => {
          loadNotifications({ force: true }).catch(() => {});
        }
      )
      .subscribe();

    const memberChannel = supabase
      .channel("customer-member-data")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "loyalty_members" },
        () => {
          refreshUser({ force: true }).catch(() => {});
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "loyalty_transactions" },
        () => {
          refreshUser({ force: true }).catch(() => {});
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notificationChannel);
      supabase.removeChannel(memberChannel);
    };
  }, [loadNotifications, refreshUser]);

  const handleNotificationClick = async (notificationId: string) => {
    try {
      await markNotificationReadViaApi(notificationId);
      setNotifications((prev) => prev.filter((item) => item.id !== notificationId));
    } catch {
    }
  };

  useEffect(() => {
    const fromTransactions = deriveCompletedTaskIds(user);
    if (fromTransactions.length === 0) return;
    setCompletedTaskIds((prev) => [...new Set([...prev, ...fromTransactions])]);
  }, [user, setCompletedTaskIds]);

  const navigation = [
    { name: "Dashboard", href: `${basePath}`, icon: Home },
    { name: "Earn Points", href: `${basePath}/earn`, icon: Gift },
    { name: "Activity", href: `${basePath}/activity`, icon: Activity },
    { name: "Rewards", href: `${basePath}/rewards`, icon: Award },
    { name: "Engagement", href: `${basePath}/engagement`, icon: Sparkles },
    { name: "Profile", href: `${basePath}/profile`, icon: User },
  ];

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
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    clearStoredAuth();
    localStorage.removeItem(USER_STORAGE_KEY);
    window.location.replace("/login");
  };

  const notificationPanel = (
    <div className="absolute right-0 top-full z-50 mt-3 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
      <p className="mb-2 text-sm font-semibold text-[#1A2B47]">Notifications</p>
      {user.expiringPoints > 0 || notifications.length > 0 ? (
        <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
          {user.expiringPoints > 0 ? <div className="rounded-lg border border-[#00A3AD]/35 bg-[#e6f8fa] p-3">
          <div className="flex items-start gap-2">
            <Clock3 className="h-4 w-4 mt-0.5 text-[#1A2B47]" />
            <div>
              <p className="text-sm font-semibold text-[#1A2B47]">{user.expiringPoints} points expiring soon</p>
              <p className="text-xs text-[#1A2B47]/80">Expires in {user.daysUntilExpiry} days.</p>
            </div>
          </div>
          <NavLink
            to={`${basePath}/rewards`}
            onClick={() => setNotifOpen(false)}
            className="mt-2 inline-flex rounded-md bg-[#1A2B47] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#23385a]"
          >
            Redeem now
          </NavLink>
          </div> : null}

          {notifications.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNotificationClick(item.id)}
              className="block w-full rounded-lg border border-gray-200 bg-gray-50 p-3 text-left transition hover:border-[#c5d6ec] hover:bg-[#f7fbff]"
            >
              <p className="text-sm font-semibold text-[#1A2B47]">{item.subject}</p>
              <p className="text-xs text-gray-600 mt-1">{item.message}</p>
              <p className="text-[11px] text-gray-500 mt-1">{new Date(item.createdAt).toLocaleString()}</p>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">No new notifications.</p>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#f2fbfb_0%,#ffffff_34%,#f4f7ff_100%)]">
      <ThemeInitializer />

      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#1A2B47]">
              <span className="text-white font-bold text-sm">Z</span>
            </div>
            <div>
              <h1 className="font-bold text-gray-900">GREENOVATE</h1>
              <p className="text-xs text-gray-500">{user.tier} Member</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setNotifOpen((s) => !s)}
                className="relative rounded-lg p-2 transition hover:bg-[#eef5ff]"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5 text-[#1A2B47]" />
                {notifications.length > 0 ? (
                  <span className={cn("absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold", brandTealSolidClass)}>
                    {Math.min(notifications.length, 9)}
                  </span>
                ) : null}
              </button>
              {notifOpen ? notificationPanel : null}
            </div>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="rounded-lg p-2 transition hover:bg-[#eef5ff]"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-30 w-64 border-r border-white/15 bg-[linear-gradient(180deg,#1A2B47_0%,#203558_100%)] transform transition-transform duration-300 ease-in-out",
          "lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-white/15">
            <div className="flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", brandTealSolidClass)}>
                <span className="text-white font-bold text-lg">Z</span>
              </div>
              <div>
                <h1 className="font-bold text-white">GREENOVATE</h1>
                <p className="text-xs text-slate-300">Member Panel</p>
              </div>
            </div>
          </div>

          <div className="p-6 border-b border-white/15">
            <div className="flex items-center gap-3">
              <img
                src={user.profileImage}
                alt={user.fullName}
                className="w-12 h-12 rounded-full object-cover border border-white/20 bg-white/10"
              />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white truncate">{user.fullName}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center rounded bg-[#0b7f88] px-2 py-0.5 text-xs font-medium text-white">
                    {user.tier}
                  </span>
                  <span className="text-xs text-slate-300">{user.points.toLocaleString()} pts</span>
                </div>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                end={item.href === basePath}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
                    isActive ? "bg-[#0b7f88] text-white" : "text-slate-100 hover:bg-white/10 hover:text-white"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon className={cn("w-5 h-5", isActive && "text-white")} />
                    {item.name}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="p-4 border-t border-white/15 space-y-2">
            <button
              onClick={handleLogout}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/12"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
            <p className="text-xs text-center text-slate-300">© 2026 GREENOVATE</p>
          </div>
        </div>
      </div>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="lg:pl-64 pt-16 lg:pt-0">
        <main className={`${customerPageShellClass} p-4 lg:p-8`}>
          <div className="mb-4 hidden lg:flex justify-end">
            <div className="relative">
              <button
                onClick={() => setNotifOpen((s) => !s)}
                className="relative inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white p-2 transition hover:border-[#c5d6ec] hover:bg-[#f7fbff]"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5 text-[#1A2B47]" />
                {notifications.length > 0 ? (
                  <span className={cn("absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold", brandTealSolidClass)}>
                    {Math.min(notifications.length, 9)}
                  </span>
                ) : null}
              </button>
              {notifOpen ? notificationPanel : null}
            </div>
          </div>

          <Outlet
            context={
              {
                user,
                setUser,
                refreshUser,
                completedTaskIds,
                setCompletedTaskIds,
              } satisfies AppOutletContext
            }
          />
        </main>
      </div>

      <Toaster position="top-right" richColors />
    </div>
  );
}

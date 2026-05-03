import { createBrowserRouter, redirect } from "react-router-dom";
import { requireRole, roleRedirect } from "./auth/guards";
import { LoginPage } from "./pages/LoginPage";
import { RegistrationPage } from "./pages/RegistrationPage";

export function RouteFallback() {
  return (
    <main className="min-h-screen bg-white text-[#1A2B47] flex items-center justify-center p-6">
      <div className="text-center">
        <p className="text-lg font-semibold">Loading CentralPerk...</p>
        <p className="mt-2 text-sm text-slate-500">Preparing your workspace.</p>
      </div>
    </main>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    loader: roleRedirect,
    Component: RouteFallback,
    HydrateFallback: RouteFallback,
  },
  {
    path: "/login",
    Component: LoginPage,
    HydrateFallback: RouteFallback,
  },
  {
    path: "/register",
    Component: RegistrationPage,
    HydrateFallback: RouteFallback,
  },
  {
    path: "/customer",
    loader: requireRole(["customer"]),
    HydrateFallback: RouteFallback,
    children: [
      {
        lazy: () => import("./customer-panel/root").then((m) => ({ Component: m.default })),
        HydrateFallback: RouteFallback,
        children: [
          {
            index: true,
            lazy: () => import("./customer-panel/pages/dashboard").then((m) => ({ Component: m.default })),
            HydrateFallback: RouteFallback,
          },
          {
            path: "earn",
            lazy: () => import("./customer-panel/pages/earn-points").then((m) => ({ Component: m.default })),
            HydrateFallback: RouteFallback,
          },
          {
            path: "activity",
            lazy: () => import("./customer-panel/pages/points-activity").then((m) => ({ Component: m.default })),
            HydrateFallback: RouteFallback,
          },
          {
            path: "rewards",
            lazy: () => import("./customer-panel/pages/rewards").then((m) => ({ Component: m.default })),
            HydrateFallback: RouteFallback,
          },
          {
            path: "profile",
            lazy: () => import("./customer-panel/pages/profile").then((m) => ({ Component: m.default })),
            HydrateFallback: RouteFallback,
          },
          {
            path: "engagement",
            lazy: () => import("./customer-panel/pages/engagement").then((m) => ({ Component: m.default })),
            HydrateFallback: RouteFallback,
          },
        ],
      },
    ],
  },
  {
    path: "/admin",
    loader: requireRole(["admin"]),
    lazy: () => import("./admin-panel/root").then((m) => ({ Component: m.default })),
    HydrateFallback: RouteFallback,
    children: [
      {
        index: true,
        lazy: () => import("./admin-panel/pages/dashboard").then((m) => ({ Component: m.default })),
        HydrateFallback: RouteFallback,
      },
      {
        path: "members",
        lazy: () => import("./admin-panel/pages/members").then((m) => ({ Component: m.default })),
        HydrateFallback: RouteFallback,
      },
      {
        path: "activity",
        lazy: () => import("./admin-panel/pages/activity").then((m) => ({ Component: m.default })),
        HydrateFallback: RouteFallback,
      },
      {
        path: "rewards",
        lazy: () => import("./admin-panel/pages/rewards").then((m) => ({ Component: m.default })),
        HydrateFallback: RouteFallback,
      },
      {
        path: "campaigns",
        loader: () => redirect("/admin/rewards#rewards-campaigns"),
        Component: RouteFallback,
        HydrateFallback: RouteFallback,
      },
      {
        path: "analytics",
        lazy: () => import("./admin-panel/pages/analytics").then((m) => ({ Component: m.default })),
        HydrateFallback: RouteFallback,
      },
      {
        path: "partners",
        loader: () => redirect("/admin/rewards#rewards-partners"),
        Component: RouteFallback,
        HydrateFallback: RouteFallback,
      },
      {
        path: "settings",
        lazy: () => import("./admin-panel/pages/settings").then((m) => ({ Component: m.default })),
        HydrateFallback: RouteFallback,
      },
      {
        path: "engagement",
        lazy: () => import("./admin-panel/pages/engagement").then((m) => ({ Component: m.default })),
        HydrateFallback: RouteFallback,
      },
    ],
  },
  { path: "/home", loader: () => redirect("/customer"), Component: RouteFallback, HydrateFallback: RouteFallback },
  { path: "*", loader: () => redirect("/"), Component: RouteFallback, HydrateFallback: RouteFallback },
]);

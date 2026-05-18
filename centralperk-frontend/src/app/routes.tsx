import { createBrowserRouter, redirect } from "react-router-dom";
import { requireRole, roleRedirect } from "./auth/guards";
import { LoginPage } from "./pages/LoginPage";
import { RegistrationPage } from "./pages/RegistrationPage";

function RedirectingRoot() {
  return null;
}

function HydrateFallback() {
  return (
    <div className="min-h-screen bg-white text-slate-900 flex items-center justify-center">
      <div className="text-center">
        <p className="text-lg font-semibold">Loading GREENOVATE...</p>
        <p className="mt-2 text-sm text-slate-500">Initializing the app shell.</p>
      </div>
    </div>
  );
}

const routeFallback = {
  hydrateFallbackElement: <HydrateFallback />,
};

export const router = createBrowserRouter([
  // Smart landing
  {
    path: "/",
    loader: roleRedirect,
    Component: RedirectingRoot,
    ...routeFallback,
  },

  // Public routes
  {
    path: "/login",
    Component: LoginPage,
  },
  {
    path: "/register",
    Component: RegistrationPage,
  },
  {
    path: "/voucher/:voucherId",
    lazy: () => import("./pages/VoucherPage").then((m) => ({ Component: m.default })),
    ...routeFallback,
  },

  // Customer protected (Member Panel)
  {
    path: "/customer",
    loader: requireRole(["customer"]),
    ...routeFallback,
    children: [
      {
        lazy: () => import("./customer-panel/root").then((m) => ({ Component: m.default })),
        children: [
          {
            index: true,
            lazy: () => import("./customer-panel/pages/dashboard").then((m) => ({ Component: m.default })),
          },
          {
            path: "earn",
            lazy: () => import("./customer-panel/pages/earn-points").then((m) => ({ Component: m.default })),
          },
          {
            path: "activity",
            lazy: () => import("./customer-panel/pages/points-activity").then((m) => ({ Component: m.default })),
          },
          {
            path: "rewards",
            lazy: () => import("./customer-panel/pages/rewards").then((m) => ({ Component: m.default })),
          },
          {
            path: "profile",
            lazy: () => import("./customer-panel/pages/profile").then((m) => ({ Component: m.default })),
          },
          {
            path: "engagement",
            lazy: () => import("./customer-panel/pages/engagement").then((m) => ({ Component: m.default })),
          },
        ],
      },
    ],
  },

  // Admin protected
  {
    path: "/admin",
    loader: requireRole(["admin"]),
    lazy: () => import("./admin-panel/root").then((m) => ({ Component: m.default })),
    ...routeFallback,
    children: [
      {
        index: true,
        lazy: () => import("./admin-panel/pages/dashboard").then((m) => ({ Component: m.default })),
      },
      {
        path: "members",
        lazy: () => import("./admin-panel/pages/members").then((m) => ({ Component: m.default })),
      },
      {
        path: "activity",
        lazy: () => import("./admin-panel/pages/activity").then((m) => ({ Component: m.default })),
      },
      {
        path: "rewards",
        lazy: () => import("./admin-panel/pages/rewards").then((m) => ({ Component: m.default })),
      },
      {
        path: "analytics",
        lazy: () => import("./admin-panel/pages/analytics").then((m) => ({ Component: m.default })),
      },
      {
        path: "settings",
        lazy: () => import("./admin-panel/pages/settings").then((m) => ({ Component: m.default })),
      },
      {
        path: "engagement",
        lazy: () => import("./admin-panel/pages/engagement").then((m) => ({ Component: m.default })),
      },
    ],
  },

  // Backwards-compat for your old route:
  { path: "/home", loader: () => redirect("/customer"), ...routeFallback },

  // catch-all
  { path: "*", loader: () => redirect("/"), ...routeFallback },
]);

import { createBrowserRouter, redirect } from "react-router-dom";
import { requireRole, roleRedirect } from "./auth/guards";
import { LoginPage } from "./pages/LoginPage";
import { RegistrationPage } from "./pages/RegistrationPage";

export const router = createBrowserRouter([
  {
    path: "/",
    loader: roleRedirect,
  },
  {
    path: "/login",
    Component: LoginPage,
  },
  {
    path: "/register",
    Component: RegistrationPage,
  },
  {
    path: "/customer",
    loader: requireRole(["customer"]),
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
  {
    path: "/admin",
    loader: requireRole(["admin"]),
    lazy: () => import("./admin-panel/root").then((m) => ({ Component: m.default })),
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
  { path: "/home", loader: () => redirect("/customer") },
  { path: "*", loader: () => redirect("/") },
]);

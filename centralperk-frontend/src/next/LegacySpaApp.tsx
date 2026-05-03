import { RouterProvider } from "react-router-dom";
import { router } from "../app/routes";

export function LegacySpaApp() {
  return <RouterProvider router={router} />;
}

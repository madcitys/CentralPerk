import { redirect } from "react-router-dom";
import { getRoleFromSession, getSession, Role } from "./auth";
export async function requireAuth() {
  const session = await getSession();
  if (!session) throw redirect("/login");
  return null;
}
export function requireRole(allowed: Role[]) {
  return async () => {
    const session = await getSession();
    if (!session) throw redirect("/login");

    const role = await getRoleFromSession();
    if (!role) throw redirect("/login");

    if (!allowed.includes(role)) {
      throw redirect(role === "admin" ? "/admin" : "/customer");
    }
    return null;
  };
}
export async function roleRedirect() {
  const session = await getSession();
  if (!session) throw redirect("/login");

  const role = await getRoleFromSession();
  throw redirect(role === "admin" ? "/admin" : "/customer");
}

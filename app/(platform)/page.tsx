import { AdminDashboard } from "@/components/admin-dashboard";
import { Dashboard } from "@/components/dashboard";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { MEMBER_HOME } from "@/lib/nav";
import { getUsers } from "@/lib/data";

export default async function Page() {
  const user = await requireUser();
  // Les membres n’ont pas de tableau de bord : ils arrivent sur les documents
  if (user.role === "membre") redirect(MEMBER_HOME);
  const adminPanel = user.role === "admin" ? <AdminDashboard users={await getUsers()} /> : null;
  return <Dashboard adminPanel={adminPanel} />;
}

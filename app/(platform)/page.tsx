import { AdminDashboard } from "@/components/admin-dashboard";
import { Dashboard } from "@/components/dashboard";
import { requireUser } from "@/lib/auth";
import { getUsers } from "@/lib/data";

export default async function Page() {
  const user = await requireUser();
  const adminPanel = user.role === "admin" ? <AdminDashboard users={await getUsers()} /> : null;
  return <Dashboard adminPanel={adminPanel} />;
}

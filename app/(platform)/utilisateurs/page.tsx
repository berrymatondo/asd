import { UsersPage } from "@/components/users-page";
import { requireUser } from "@/lib/auth";
import { getUsers } from "@/lib/data";

export default async function Page({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  await requireUser(["admin"]);
  const { role } = await searchParams;
  return <UsersPage users={await getUsers()} initialRole={role === "admin" || role === "berger" || role === "membre" ? role : "all"} />;
}

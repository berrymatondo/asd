import { UsersPage } from "@/components/users-page";
import { requireUser } from "@/lib/auth";
import { getUsers } from "@/lib/data";

export default async function Page() {
  await requireUser(["admin"]);
  return <UsersPage users={await getUsers()} />;
}

import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { getAppData } from "@/lib/data";
import { StoreProvider } from "@/lib/store";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const data = await getAppData(user);
  return (
    <StoreProvider data={data} user={user}>
      <AppShell>{children}</AppShell>
    </StoreProvider>
  );
}

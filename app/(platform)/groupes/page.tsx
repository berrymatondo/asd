import { Suspense } from "react";
import { CollectionPage } from "@/components/collection-page";
import { requireUser } from "@/lib/auth";

export default async function Page() {
  await requireUser(["admin", "berger"]);
  return (
    <Suspense>
      <CollectionPage type="groups" />
    </Suspense>
  );
}

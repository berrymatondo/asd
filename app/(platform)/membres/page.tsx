import { Suspense } from "react";
import { CollectionPage } from "@/components/collection-page";
import { requireUser } from "@/lib/auth";

export default async function Page() {
  // Fiches privées : réservées au berger et à l’administrateur
  await requireUser(["admin", "berger"]);
  return (
    <Suspense>
      <CollectionPage type="people" />
    </Suspense>
  );
}

import { Suspense } from "react";
import { CollectionPage } from "@/components/collection-page";

export default function Page() {
  return (
    <Suspense>
      <CollectionPage type="docs" />
    </Suspense>
  );
}

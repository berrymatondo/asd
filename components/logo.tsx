import Image from "next/image";
import { cn } from "@/lib/utils";

/** Logo rond « Famille ASD — Faiseurs de disciples ». La taille se règle par la classe (ex. size-10). */
export function Logo({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/logo.png"
      alt="Famille ASD — Faiseurs de disciples"
      width={160}
      height={160}
      priority={priority}
      className={cn("size-10.5 shrink-0 rounded-full object-cover shadow-sm ring-2 ring-white", className)}
    />
  );
}

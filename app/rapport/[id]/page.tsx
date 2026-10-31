import type { Metadata } from "next";
import { EventReport } from "@/components/event-report";
import { canSeeGroupItem, getVisibleGroups, requireUser } from "@/lib/auth";
import { getEventReport } from "@/lib/data";

export const metadata: Metadata = { title: "Rapport d’événement — ASD" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  const report = Number.isInteger(id) && id > 0 ? await getEventReport(id) : null;
  // Même message si l’événement n’existe pas ou n’est pas visible : on ne révèle pas son existence
  if (!report || !canSeeGroupItem(await getVisibleGroups(user), report.event.groupId)) return <p className="p-10 text-center text-sm text-muted-foreground">Événement introuvable.</p>;
  return <EventReport event={report.event} members={report.members} />;
}

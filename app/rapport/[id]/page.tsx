import type { Metadata } from "next";
import { EventReport } from "@/components/event-report";
import { requireUser } from "@/lib/auth";
import { getEventReport } from "@/lib/data";

export const metadata: Metadata = { title: "Rapport d’événement — ASD" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const id = Number((await params).id);
  const report = Number.isInteger(id) && id > 0 ? await getEventReport(id) : null;
  if (!report) return <p className="p-10 text-center text-sm text-muted-foreground">Événement introuvable.</p>;
  return <EventReport event={report.event} members={report.members} />;
}

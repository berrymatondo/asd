"use client";

import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { upcomingEvents, useStore } from "@/lib/store";
import { fmtDate, today } from "@/lib/format";

export function EventsPopupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data, group } = useStore();
  const router = useRouter();
  const upcoming = upcomingEvents(data, today());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>📅 Événements planifiés</DialogTitle>
          <DialogDescription>Les prochains rendez-vous de vos groupes.</DialogDescription>
        </DialogHeader>
        {upcoming.length ? (
          <div className="divide-y">
            {upcoming.map((e) => (
              <div key={e.id} className="flex items-center gap-3 py-3.5">
                <div className="grid size-10.5 shrink-0 place-items-center rounded-[13px] bg-[#f1f0ff] text-xl">📅</div>
                <div className="min-w-0 flex-1">
                  <b className="text-[13px]">{e.title}</b>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {fmtDate(e.date)} · {e.start}–{e.end} · {e.groupId == null ? "Tous les groupes" : group(e.groupId)?.name}
                  </p>
                </div>
                <Button
                  variant="soft"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    router.push(`/evenements?focus=${e.id}`);
                  }}
                >
                  Ouvrir
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Aucun événement planifié.</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

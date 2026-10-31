"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CalendarCheck, Heart, Lock, Pencil, Phone, Sparkles, Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { fmtDate, today } from "@/lib/format";
import type { Id } from "@/lib/types";

export function MemberDetailDialog({ personId, onOpenChange, onEdit }: { personId: Id | null; onOpenChange: (o: boolean) => void; onEdit: (id: Id) => void }) {
  return (
    <Dialog open={personId != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
        {personId != null && <Body personId={personId} onClose={() => onOpenChange(false)} onEdit={onEdit} />}
      </DialogContent>
    </Dialog>
  );
}

function Body({ personId, onClose, onEdit }: { personId: Id; onClose: () => void; onEdit: (id: Id) => void }) {
  const { data, person, group, shepherdOf, canManagePerson } = useStore();
  const router = useRouter();
  const p = person(personId);
  if (!p) return null;

  const g = group(p.groupId);
  const shepherd = person(g?.shepherdId);
  const leads = shepherdOf(p.id);
  const prayers = data.prayers.filter((x) => x.personId === p.id).sort((a, b) => b.date.localeCompare(a.date));
  const testimonies = data.testimonies.filter((x) => x.personId === p.id).sort((a, b) => b.date.localeCompare(a.date));

  // Présences : événements passés de son groupe (ou communs) visibles par l’utilisateur
  const now = today();
  const events = data.events
    .filter((e) => e.date < now && (e.groupId == null || (p.groupId != null && e.groupId === p.groupId)))
    .sort((a, b) => b.date.localeCompare(a.date));
  const present = events.filter((e) => e.attendance?.[p.id]).length;
  const rate = events.length ? Math.round((present / events.length) * 100) : null;

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <div className="grid gap-5">
      <DialogHeader>
        <DialogTitle className="flex flex-wrap items-center gap-2 text-xl">
          ♙ {p.first} {p.last}
          {leads.length > 0 && <Badge variant="success">Berger · {leads.map((x) => x.name).join(", ")}</Badge>}
        </DialogTitle>
        <DialogDescription>{g ? `Membre du ${g.name}` : "Membre sans groupe"}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        <Info icon={Phone} label="Téléphone">
          {p.phone && p.phone !== "•" ? (
            <a href={`tel:${p.phone.split("/")[0].replace(/\s/g, "")}`} className="text-primary hover:underline">
              {p.phone}
            </a>
          ) : (
            <span className="text-muted-foreground">Non renseigné</span>
          )}
        </Info>
        <Info icon={Users} label="Groupe">
          {g ? g.name : <span className="text-muted-foreground">Aucun</span>}
          {shepherd && shepherd.id !== p.id && (
            <span className="block text-xs text-muted-foreground">
              Berger : {shepherd.first} {shepherd.last}
            </span>
          )}
        </Info>
        <Info icon={CalendarCheck} label="Présences">
          {events.length ? (
            <>
              {present}/{events.length} <span className="text-muted-foreground">({rate} %)</span>
            </>
          ) : (
            <span className="text-muted-foreground">Aucun événement passé</span>
          )}
        </Info>
      </div>

      <section>
        <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase">
          <Lock className="size-3.5" /> Fiche descriptive
        </h4>
        <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-[13px] leading-relaxed whitespace-pre-line">
          {p.notes || <span className="text-muted-foreground">Aucune note.</span>}
        </p>
      </section>

      {events.length > 0 && (
        <section>
          <h4 className="mb-1.5 text-xs font-bold text-muted-foreground uppercase">Derniers événements</h4>
          <ul className="divide-y rounded-lg border">
            {events.slice(0, 5).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 px-3 py-2 text-[13px]">
                <span className="min-w-0 truncate">
                  {fmtDate(e.date)} · {e.title}
                </span>
                <Badge variant={e.attendance?.[p.id] ? "success" : "pending"}>{e.attendance?.[p.id] ? "Présent" : "Absent"}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      <PostList
        icon={Heart}
        title="Sujets de prière"
        empty="Aucun sujet de prière lié à ce membre."
        items={prayers.map((x) => ({ id: x.id, date: x.date, desc: x.desc, ok: x.answered, okLabel: "Exaucée", koLabel: "En attente" }))}
        onOpen={(id) => go(`/prieres?focus=${id}`)}
      />
      <PostList
        icon={Sparkles}
        title="Témoignages"
        empty="Aucun témoignage lié à ce membre."
        items={testimonies.map((x) => ({ id: x.id, date: x.date, desc: x.desc, ok: !!x.prayerId, okLabel: "Lié à une prière", koLabel: null }))}
        onOpen={(id) => go(`/temoignages?focus=${id}`)}
      />

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Fermer
        </Button>
        {canManagePerson(p) && (
          <Button
            onClick={() => {
              onClose();
              onEdit(p.id);
            }}
          >
            <Pencil /> Modifier la fiche
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}

function Info({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
        <Icon className="size-3.5 text-primary" /> {label}
      </span>
      <div className="mt-1 text-[13px] font-semibold">{children}</div>
    </div>
  );
}

function PostList({
  icon: Icon,
  title,
  empty,
  items,
  onOpen,
}: {
  icon: React.ElementType;
  title: string;
  empty: string;
  items: { id: Id; date: string; desc: string; ok: boolean; okLabel: string; koLabel: string | null }[];
  onOpen: (id: Id) => void;
}) {
  return (
    <section>
      <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase">
        <Icon className="size-3.5 text-primary" /> {title} <span className="font-normal">({items.length})</span>
      </h4>
      {items.length ? (
        <ul className="divide-y rounded-lg border">
          {items.map((it) => (
            <li key={it.id}>
              <button type="button" onClick={() => onOpen(it.id)} className="flex w-full cursor-pointer items-start gap-3 px-3 py-2.5 text-left hover:bg-accent/50">
                <span className="w-20 shrink-0 text-xs text-muted-foreground">{fmtDate(it.date)}</span>
                <span className="min-w-0 flex-1 text-[13px] leading-snug">{it.desc}</span>
                {(it.ok || it.koLabel) && <Badge variant={it.ok ? "success" : "pending"}>{it.ok ? it.okLabel : it.koLabel}</Badge>}
                <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-label="Ouvrir" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

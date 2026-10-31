"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarDays, Heart, Layers, Sparkles, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EventsPopupDialog } from "@/components/events-popup-dialog";
import { upcomingEvents, useStore } from "@/lib/store";
import { fmtDate, today } from "@/lib/format";
import { cn } from "@/lib/utils";

function Donut({ percent, color, track, value, label }: { percent: number; color: string; track: string; value: React.ReactNode; label: string }) {
  return (
    <div
      className="mx-auto my-3.5 grid size-36 place-items-center rounded-full"
      style={{ background: `conic-gradient(${color} ${percent}%, ${track} 0)` }}
      role="img"
      aria-label={`${label} : ${percent} %`}
    >
      <div className="flex size-27 flex-col items-center justify-center rounded-full bg-card">
        <b className="text-[27px]">{value}</b>
        <small className="text-[11px] text-muted-foreground">{label}</small>
      </div>
    </div>
  );
}

function ChartPanel({ icon: Icon, title, metric, children }: { icon: React.ElementType; title: string; metric: number; children: React.ReactNode }) {
  return (
    <Card className="min-h-65 gap-0">
      <h3 className="flex items-center justify-between gap-2 text-sm font-bold">
        <span className="flex items-center gap-2">
          <Icon className="size-4 text-primary" /> {title}
        </span>
        <span className="text-[22px] text-primary">{metric}</span>
      </h3>
      {children}
    </Card>
  );
}

export function Dashboard({ adminPanel }: { adminPanel?: React.ReactNode }) {
  const { data } = useStore();
  const [popup, setPopup] = React.useState(false);

  const upcoming = upcomingEvents(data, today());
  const answered = data.prayers.filter((p) => p.answered).length;
  const prayerPct = data.prayers.length ? Math.round((answered / data.prayers.length) * 100) : 0;
  const withPhone = data.people.filter((p) => p.phone).length;
  const phonePct = data.people.length ? Math.round((withPhone / data.people.length) * 100) : 0;
  const linkedTestimonies = data.testimonies.filter((t) => t.prayerId).length;
  const testimonyPct = data.testimonies.length ? Math.round((linkedTestimonies / data.testimonies.length) * 100) : 0;
  const counts = data.groups.map((g) => ({ g, n: data.people.filter((p) => p.groupId === g.id).length }));
  const max = Math.max(1, ...counts.map((c) => c.n));

  return (
    <>
      <div className="mb-7.5 flex flex-col items-start justify-between gap-4 rounded-[18px] border border-[#dcdcff] bg-gradient-to-r from-[#eeedff] to-[#f8faff] px-6 py-5.5 shadow-[0_10px_35px_#2534520b] sm:flex-row sm:items-center">
        <div>
          <span className="flex items-center gap-1.5 text-xs font-extrabold tracking-[1.3px] text-primary">
            <CalendarDays className="size-3.5" /> À NE PAS MANQUER
          </span>
          <h3 className="my-1.5 flex items-center gap-2 text-xl font-bold">
            Événements planifiés <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs text-white">{upcoming.length}</span>
          </h3>
          <p className="text-[13px] text-[#606d87]">
            {upcoming.length
              ? `Prochain rendez-vous : ${upcoming[0].title} · ${fmtDate(upcoming[0].date)} à ${upcoming[0].start}`
              : "Aucun événement à venir pour le moment."}
          </p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => setPopup(true)}>
          Voir les événements <ArrowUpRight />
        </Button>
      </div>

      {adminPanel}

      <div className="mb-7 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="text-xs font-extrabold tracking-[1.3px] text-primary uppercase">Bienvenue sur ASD ✨</div>
          <h1 className="my-2 text-2xl font-bold tracking-tight md:text-[30px]">Cela se réalisera.</h1>
          <p className="text-sm text-muted-foreground">Suivez la vie des groupes, les membres, les témoignages et les prières.</p>
        </div>
        <Button variant="outline" asChild className="bg-card">
          <Link href="/groupes">
            Explorer les groupes <ArrowRight />
          </Link>
        </Button>
      </div>

      <div className="mb-5.5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ChartPanel icon={Layers} title="Groupes actifs" metric={data.groups.length}>
          <div className="my-6.5">
            {counts.map(({ g, n }) => (
              <div key={g.id} className="my-3.5 grid grid-cols-[75px_1fr_20px] items-center gap-2 text-[11px]">
                <span className="truncate" title={g.name}>
                  {g.name}
                </span>
                <div className="h-3.5 overflow-hidden rounded-full bg-[#e9eafd]">
                  <div className="h-full min-w-0.5 rounded-full bg-[#6257ed]" style={{ width: `${(n / max) * 100}%` }} />
                </div>
                <b>{n}</b>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Répartition des membres par groupe</p>
        </ChartPanel>

        <ChartPanel icon={Users} title="Membres du groupe" metric={data.people.length}>
          <Donut percent={phonePct} color="#5b54e8" track="#e9eafd" value={data.people.length} label="Membres" />
          <p className="text-center text-xs text-muted-foreground">
            {withPhone} avec téléphone · {data.people.length - withPhone} sans téléphone
          </p>
        </ChartPanel>

        <ChartPanel icon={Sparkles} title="Témoignages" metric={data.testimonies.length}>
          <Donut percent={testimonyPct} color="#0c9f91" track="#e5f6f3" value={data.testimonies.length} label="Témoignages" />
          <p className="text-center text-xs text-muted-foreground">{linkedTestimonies} liés à une prière exaucée</p>
        </ChartPanel>

        <ChartPanel icon={Heart} title="Prières exaucées" metric={answered}>
          <Donut percent={prayerPct} color="#e7a03b" track="#fff3df" value={`${prayerPct}%`} label="Exaucées" />
          <p className="text-center text-xs text-muted-foreground">
            {answered} exaucées · {data.prayers.length - answered} en attente
          </p>
        </ChartPanel>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.45fr_1fr]">
        <Card className="p-6">
          <h3 className="text-[17px] font-bold">🙏 Sujets de prière récents</h3>
          <div className="divide-y">
            {data.prayers
              .slice(-3)
              .reverse()
              .map((p) => (
                <Row key={p.id} icon="♡" title={p.desc.slice(0, 65)} sub={`${p.author || "Anonyme"} · ${fmtDate(p.date)}`}>
                  <Badge variant={p.answered ? "success" : "pending"}>{p.answered ? "Exaucée" : "En cours"}</Badge>
                </Row>
              ))}
          </div>
          <Button variant="soft" size="sm" asChild className="w-fit">
            <Link href="/prieres">
              Voir les prières <ArrowRight />
            </Link>
          </Button>
        </Card>
        <Card className="p-6">
          <h3 className="text-[17px] font-bold">✨ Témoignages récents</h3>
          <div className="divide-y">
            {data.testimonies
              .slice(-3)
              .reverse()
              .map((t) => (
                <Row key={t.id} icon="✧" title={t.desc.slice(0, 70)} sub={`${t.author} · ${fmtDate(t.date)}`} />
              ))}
          </div>
          <Button variant="soft" size="sm" asChild className="w-fit">
            <Link href="/temoignages">
              Voir les témoignages <ArrowRight />
            </Link>
          </Button>
        </Card>
      </div>

      <p className="mt-5.5 text-xs text-muted-foreground">
        Données enregistrées dans la base ASD. Les actions disponibles dépendent de votre rôle.
      </p>

      <EventsPopupDialog open={popup} onOpenChange={setPopup} />
    </>
  );
}

function Row({ icon, title, sub, children, className }: { icon: string; title: string; sub: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 py-3.5", className)}>
      <div className="grid size-10.5 shrink-0 place-items-center rounded-[13px] bg-[#f1f0ff] text-xl text-primary">{icon}</div>
      <div className="min-w-0 flex-1">
        <b className="text-[13px]">{title}</b>
        <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
      </div>
      {children}
    </div>
  );
}

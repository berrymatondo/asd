"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CalendarDays, CheckCircle2, FileText, Heart, Layers, ShieldCheck, Sparkles, UserCheck, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ReportsPanel } from "@/components/reports-panel";
import { useStore } from "@/lib/store";
import { fmtSize, today } from "@/lib/format";
import { ROLE_LABELS, type AppData, type AsdEvent, type Role, type User } from "@/lib/types";
import { cn } from "@/lib/utils";

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** Taux de présence d’un événement passé : présents / membres attendus (groupe, ou tous si commun). */
function attendanceRate(e: AsdEvent, data: AppData) {
  const expected = data.people.filter((p) => e.groupId == null || p.groupId === e.groupId);
  if (!expected.length) return null;
  return expected.filter((p) => e.attendance?.[p.id]).length / expected.length;
}

const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)} %`);
const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export function AdminDashboard({ users }: { users: User[] }) {
  const { data, person } = useStore();
  const now = today();
  const past = data.events.filter((e) => e.date < now);
  const upcoming = data.events.filter((e) => e.date >= now);
  const globalAvg = avg(past.map((e) => attendanceRate(e, data)));
  const files = data.docs.flatMap((d) => d.files);
  const answered = data.prayers.filter((p) => p.answered).length;
  const activeUsers = users.filter((u) => u.active);
  const byRole = (r: Role) => activeUsers.filter((u) => u.role === r).length;

  // --- Tableau par groupe ---
  const rows = data.groups.map((g) => {
    const evs = data.events.filter((e) => e.groupId === g.id);
    const prs = data.prayers.filter((p) => p.groupId === g.id);
    const shepherd = person(g.shepherdId);
    return {
      g,
      shepherd: shepherd ? `${shepherd.first} ${shepherd.last}`.trim() : null,
      members: data.people.filter((p) => p.groupId === g.id).length,
      upcoming: evs.filter((e) => e.date >= now).length,
      past: evs.filter((e) => e.date < now).length,
      attendance: avg(evs.filter((e) => e.date < now).map((e) => attendanceRate(e, data))),
      docs: data.docs.filter((d) => d.groupId === g.id).length,
      prayers: prs.length,
      answered: prs.filter((p) => p.answered).length,
      testimonies: data.testimonies.filter((t) => t.groupId === g.id).length,
    };
  });

  // --- Événements par mois : 5 mois passés, le mois courant, 3 mois à venir ---
  const [y, m] = now.split("-").map(Number);
  const months = Array.from({ length: 9 }, (_, i) => {
    const d = new Date(y, m - 1 - 5 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const evs = data.events.filter((e) => e.date.startsWith(key));
    return { key, label: MONTHS[d.getMonth()], year: d.getFullYear(), count: evs.length, global: evs.filter((e) => e.groupId == null).length, current: i === 5 };
  });
  const maxMonth = Math.max(1, ...months.map((x) => x.count));

  // --- Points à traiter ---
  const linkedPersonIds = new Set(users.map((u) => u.personId).filter((x) => x != null));
  const alerts: { text: string; href: string }[] = [];
  const noShepherd = data.groups.filter((g) => g.shepherdId == null);
  if (noShepherd.length) alerts.push({ text: `${noShepherd.length} groupe(s) sans berger : ${noShepherd.map((g) => g.name).join(", ")}`, href: "/groupes" });
  const bergersIdle = activeUsers.filter((u) => u.role === "berger" && (!u.personId || !data.groups.some((g) => g.shepherdId === u.personId)));
  if (bergersIdle.length)
    alerts.push({ text: `${bergersIdle.length} compte(s) berger ne gèrent aucun groupe : ${bergersIdle.map((u) => u.name).join(", ")}`, href: "/utilisateurs" });
  const shepherdsNoAccount = data.groups.filter((g) => g.shepherdId != null && !linkedPersonIds.has(g.shepherdId));
  if (shepherdsNoAccount.length)
    alerts.push({ text: `${shepherdsNoAccount.length} berger(s) désigné(s) sans compte relié : ils ne peuvent pas gérer leur groupe`, href: "/utilisateurs" });
  const ungrouped = data.people.filter((p) => p.groupId == null).length;
  if (ungrouped) alerts.push({ text: `${ungrouped} membre(s) sans groupe`, href: "/membres?groupe=none" });
  const noSummary = past.filter((e) => !e.summary?.trim()).length;
  if (noSummary) alerts.push({ text: `${noSummary} événement(s) passé(s) sans synthèse`, href: "/evenements" });
  const openPast = past.filter((e) => !e.locked).length;
  if (openPast) alerts.push({ text: `${openPast} événement(s) passé(s) encore modifiable(s) (non bloqués)`, href: "/evenements" });
  const inactive = users.length - activeUsers.length;
  if (inactive) alerts.push({ text: `${inactive} compte(s) désactivé(s)`, href: "/utilisateurs" });

  return (
    <section className="mb-8" aria-labelledby="admin-title">
      <div className="mb-4 flex items-center gap-2">
        <ShieldCheck className="size-5 text-primary" />
        <h2 id="admin-title" className="text-lg font-bold">
          Vue administrateur
        </h2>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat icon={UserCheck} label="Comptes actifs" value={activeUsers.length} sub={`${byRole("admin")} admin · ${byRole("berger")} berger · ${byRole("membre")} membre`} />
        <Stat icon={Layers} label="Groupes" value={data.groups.length} sub={`${noShepherd.length} sans berger`} />
        <Stat icon={Users} label="Membres" value={data.people.length} sub={`${ungrouped} sans groupe`} />
        <Stat icon={CalendarDays} label="Événements à venir" value={upcoming.length} sub={`${past.length} passés`} />
        <Stat icon={CheckCircle2} label="Présence moyenne" value={pct(globalAvg)} sub="sur les événements passés" />
        <Stat icon={FileText} label="Documents" value={data.docs.length} sub={`${files.length} fichiers · ${fmtSize(files.reduce((n, f) => n + f.size, 0))}`} />
        <Stat icon={Heart} label="Prières exaucées" value={`${answered}/${data.prayers.length}`} sub={pct(data.prayers.length ? answered / data.prayers.length : null)} />
        <Stat icon={Sparkles} label="Témoignages" value={data.testimonies.length} sub={`${data.testimonies.filter((t) => t.prayerId).length} liés à une prière`} />
      </div>

      <ReportsPanel />

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card className="gap-3 overflow-hidden">
          <h3 className="text-sm font-bold">Activité par groupe</h3>
          <div className="-mx-6 overflow-x-auto px-6">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-3 font-semibold">Groupe</th>
                  <th className="py-2 pr-3 font-semibold">Berger</th>
                  <th className="py-2 pr-3 text-right font-semibold">Membres</th>
                  <th className="py-2 pr-3 text-right font-semibold">Évén. à venir / passés</th>
                  <th className="py-2 pr-3 font-semibold">Présence moyenne</th>
                  <th className="py-2 pr-3 text-right font-semibold">Docs</th>
                  <th className="py-2 pr-3 text-right font-semibold">Prières exaucées</th>
                  <th className="py-2 text-right font-semibold">Témoign.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.g.id} className="border-b last:border-0 hover:bg-accent/40">
                    <td className="py-2.5 pr-3 font-semibold">{r.g.name}</td>
                    <td className={cn("py-2.5 pr-3", !r.shepherd && "text-amber-700")}>{r.shepherd ?? "⚠ Non désigné"}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{r.members}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {r.upcoming} / {r.past}
                    </td>
                    <td className="py-2.5 pr-3">
                      <Meter value={r.attendance} />
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{r.docs}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {r.answered}/{r.prayers}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{r.testimonies}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.events.some((e) => e.groupId == null) && (
            <p className="text-xs text-muted-foreground">Les événements communs à tous les groupes ne sont pas comptés par groupe.</p>
          )}
        </Card>

        <Card className="gap-3">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <AlertTriangle className="size-4 text-amber-600" /> À traiter
          </h3>
          {alerts.length ? (
            <ul className="divide-y">
              {alerts.map((a) => (
                <li key={a.text}>
                  <Link href={a.href} className="flex items-start gap-2 py-2.5 text-[13px] hover:text-primary">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
                    {a.text}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 text-[13px] text-emerald-700">
              <CheckCircle2 className="size-4" /> Rien à signaler.
            </p>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card className="gap-3">
          <h3 className="text-sm font-bold">Événements par mois</h3>
          <div className="flex h-44 items-end gap-2 border-b border-border pt-6" role="img" aria-label="Nombre d’événements par mois">
            {months.map((mo) => (
              <div key={mo.key} className="group relative flex h-full flex-1 flex-col items-center justify-end">
                {/* Infobulle au survol / focus */}
                <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden rounded-md border bg-card px-2 py-1 text-[11px] whitespace-nowrap shadow-md group-focus-within:block group-hover:block">
                  <b>
                    {mo.label} {mo.year}
                  </b>{" "}
                  · {mo.count} événement{mo.count > 1 ? "s" : ""}
                  {mo.global ? ` (dont ${mo.global} commun${mo.global > 1 ? "s" : ""})` : ""}
                </div>
                <span className="mb-1 text-[11px] font-semibold tabular-nums">{mo.count || ""}</span>
                <button
                  type="button"
                  tabIndex={0}
                  aria-label={`${mo.label} ${mo.year} : ${mo.count} événement(s)`}
                  className={cn("w-full max-w-9 rounded-t-[4px]", mo.key > now.slice(0, 7) ? "bg-primary/45" : "bg-primary")}
                  style={{ height: `${(mo.count / maxMonth) * 100}%`, minHeight: mo.count ? 4 : 0 }}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            {months.map((mo) => (
              <span key={mo.key} className={cn("flex-1 text-center text-[10px] text-muted-foreground", mo.current && "font-bold text-foreground")}>
                {mo.label}
              </span>
            ))}
          </div>
          <p className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded-sm bg-primary" /> passés et mois en cours
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded-sm bg-primary/45" /> planifiés
            </span>
          </p>
        </Card>

        <Card className="gap-3">
          <h3 className="text-sm font-bold">Comptes par rôle</h3>
          <ul className="grid gap-3">
            {(["admin", "berger", "membre"] as Role[]).map((r) => (
              <li key={r} className="grid grid-cols-[110px_1fr_28px] items-center gap-2 text-xs">
                <span>{ROLE_LABELS[r]}</span>
                <div className="h-3 overflow-hidden rounded-full bg-[#e9eafd]">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${activeUsers.length ? (byRole(r) / activeUsers.length) * 100 : 0}%` }} />
                </div>
                <b className="text-right tabular-nums">{byRole(r)}</b>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            {users.filter((u) => u.personId != null).length}/{users.length} comptes reliés à une fiche membre ·{" "}
            <Link href="/utilisateurs" className="text-primary hover:underline">
              Gérer les utilisateurs
            </Link>
          </p>
        </Card>
      </div>
    </section>
  );
}

function Stat({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: React.ReactNode; sub: string }) {
  return (
    <Card className="gap-1 p-4">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
        <Icon className="size-3.5 text-primary" /> {label}
      </span>
      <b className="text-2xl tabular-nums">{value}</b>
      <small className="text-[11px] leading-snug text-muted-foreground">{sub}</small>
    </Card>
  );
}

/** Jauge de présence (une seule teinte ; la valeur est toujours écrite à côté). */
function Meter({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 overflow-hidden rounded-full bg-[#e9eafd]">
        <div className="h-full rounded-full bg-primary" style={{ width: `${value * 100}%` }} />
      </div>
      <span className="tabular-nums">{pct(value)}</span>
    </div>
  );
}

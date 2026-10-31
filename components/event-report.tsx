"use client";

import * as React from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtPeriod, safeSummary } from "@/lib/format";
import type { AsdEvent, Person } from "@/lib/types";
import { Logo } from "@/components/logo";

/** Rapport imprimable d’un événement (enregistrable en PDF via la boîte d’impression du navigateur). */
export function EventReport({
  event: e,
  members,
}: {
  event: AsdEvent & { groupName: string };
  members: Pick<Person, "id" | "first" | "last">[];
}) {
  const printed = React.useRef(false);
  // safeSummary utilise DOMParser : calculé après le montage, côté navigateur
  const [summary, setSummary] = React.useState("");

  React.useEffect(() => {
    setSummary(safeSummary(e.summary || "Aucune synthèse renseignée."));
    document.title = `Rapport ASD - ${e.title}`;
    if (printed.current) return;
    printed.current = true;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [e]);

  const yes = members.filter((p) => e.attendance?.[p.id]).length;

  return (
    <div className="min-h-screen bg-white print:bg-white">
      <div className="mx-auto max-w-[850px] px-6 py-11 text-[15px] leading-relaxed text-[#1b2941] print:p-0">
        <header className="flex items-center justify-between">
          <strong className="flex items-center gap-2">
            <Logo className="size-9 ring-0 print:shadow-none" /> Famille ASD · Faiseurs de disciples
          </strong>
          <span className="text-[#68758a]">Rapport d’événement</span>
        </header>
        <h1 className="mt-6 text-3xl font-bold text-primary">{e.title}</h1>
        <p className="mt-3">
          <b>Groupe :</b> {e.groupName}
          <br />
          {e.theme && (
            <>
              <b>Thème :</b> {e.theme}
              <br />
            </>
          )}
          <b>Période :</b> {fmtPeriod(e)}
          <br />
          <b>Statut :</b> {e.locked ? "Verrouillé" : "Éditable"}
        </p>

        <h2 className="mt-8 border-b-2 border-[#e6e7ff] pb-2 text-xl font-bold">Présences</h2>
        <p className="my-3">
          <b className="text-emerald-700">{yes} présent(s)</b> · <b className="text-red-700">{members.length - yes} absent(s)</b> · {members.length} membre(s) au
          total{members.length ? ` · taux de présence ${Math.round((yes / members.length) * 100)} %` : ""}
        </p>
        {members.length ? (
          <div className="grid gap-4 sm:grid-cols-2 print:grid-cols-2">
            <AttendanceList title="Présents" tone="present" names={members.filter((p) => e.attendance?.[p.id])} />
            <AttendanceList title="Absents" tone="absent" names={members.filter((p) => !e.attendance?.[p.id])} />
          </div>
        ) : (
          <p className="text-[#68758a]">Aucun membre.</p>
        )}

        <h2 className="mt-8 border-b-2 border-[#e6e7ff] pb-2 text-xl font-bold">Synthèse de l’événement</h2>
        <div
          className="rich-content mt-3 [overflow-wrap:anywhere]"
          dangerouslySetInnerHTML={{ __html: summary }}
        />

        <p className="mt-12 text-[#68758a]">ASD — Rapport généré le {new Date().toLocaleDateString("fr-FR")}</p>
        <Button className="mt-4 print:hidden" onClick={() => window.print()}>
          <Printer /> Imprimer / Enregistrer en PDF
        </Button>
      </div>
    </div>
  );
}

/** Liste imprimable d’un côté (présents ou absents), couleurs conservées à l’impression. */
function AttendanceList({ title, tone, names }: { title: string; tone: "present" | "absent"; names: { id: number; first: string; last: string }[] }) {
  const present = tone === "present";
  return (
    <section
      className={`overflow-hidden rounded-lg border-2 [print-color-adjust:exact] [-webkit-print-color-adjust:exact] ${present ? "border-emerald-300" : "border-red-300"}`}
    >
      <h3 className={`flex justify-between px-3 py-2 font-bold text-white ${present ? "bg-emerald-600" : "bg-red-600"}`}>
        <span>
          {present ? "✓" : "✗"} {title}
        </span>
        <span>{names.length}</span>
      </h3>
      {names.length ? (
        <ol className={`divide-y ${present ? "bg-emerald-50" : "bg-red-50"}`}>
          {[...names]
            .sort((a, b) => `${a.first} ${a.last}`.localeCompare(`${b.first} ${b.last}`, "fr"))
            .map((p, i) => (
              <li key={p.id} className="flex gap-2 px-3 py-1.5 text-[14px]">
                <span className="w-6 text-right text-[#68758a] tabular-nums">{i + 1}.</span>
                {p.first} {p.last}
              </li>
            ))}
        </ol>
      ) : (
        <p className="px-3 py-3 text-[13px] text-[#68758a]">{present ? "Aucun présent." : "Aucun absent."}</p>
      )}
    </section>
  );
}

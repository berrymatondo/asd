"use client";

import * as React from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtPeriod, safeSummary } from "@/lib/format";
import type { AsdEvent, Person } from "@/lib/types";

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
          <strong>✦ ASD · Faiseur de disciples</strong>
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
          {yes} présent(s) · {members.length - yes} absent(s) · {members.length} membre(s) au total
        </p>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="border border-[#dfe5ef] bg-[#f4f4ff] p-2.5 text-left">Membre</th>
              <th className="border border-[#dfe5ef] bg-[#f4f4ff] p-2.5 text-left">Présence</th>
            </tr>
          </thead>
          <tbody>
            {members.length ? (
              members.map((p) => (
                <tr key={p.id}>
                  <td className="border border-[#dfe5ef] p-2.5">
                    {p.first} {p.last}
                  </td>
                  <td className="border border-[#dfe5ef] p-2.5">{e.attendance?.[p.id] ? "Présent" : "Absent"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={2} className="border border-[#dfe5ef] p-2.5">
                  Aucun membre
                </td>
              </tr>
            )}
          </tbody>
        </table>

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

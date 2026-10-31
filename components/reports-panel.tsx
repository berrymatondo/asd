"use client";

import * as React from "react";
import { toast } from "sonner";
import { CalendarDays, CalendarRange, FileSpreadsheet, FileText, FileDown, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStore } from "@/lib/store";
import { fmtDate, today } from "@/lib/format";

type Kind = "evenement" | "periode" | "mensuel";

/** Télécharge un rapport ; affiche l’erreur du serveur au lieu d’enregistrer un fichier d’erreur. */
async function download(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error((await res.text()) || "Erreur lors de la génération du rapport.");
  const name = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "rapport";
  const href = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10000);
}

export function ReportsPanel() {
  const { data, group } = useStore();
  const now = today();
  const firstOfMonth = `${now.slice(0, 7)}-01`;
  const threeMonthsAgo = (() => {
    const d = new Date(Number(now.slice(0, 4)), Number(now.slice(5, 7)) - 3, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  })();

  const events = [...data.events].sort((a, b) => b.date.localeCompare(a.date));
  const [kind, setKind] = React.useState<Kind>("mensuel");
  const [eventId, setEventId] = React.useState(events[0] ? String(events[0].id) : "");
  const [from, setFrom] = React.useState(threeMonthsAgo);
  const [to, setTo] = React.useState(now);
  const [month, setMonth] = React.useState(firstOfMonth.slice(0, 7));
  const [groupId, setGroupId] = React.useState("all");
  const [busy, setBusy] = React.useState<null | "pdf" | "xlsx">(null);

  const generate = async (format: "pdf" | "xlsx") => {
    const q = new URLSearchParams({ type: kind, format });
    if (kind === "evenement") {
      if (!eventId) return toast.error("Choisissez un événement.");
      q.set("id", eventId);
    } else {
      q.set("groupe", groupId);
      if (kind === "periode") {
        if (!from || !to || from > to) return toast.error("Choisissez une période valide.");
        q.set("du", from);
        q.set("au", to);
      } else {
        if (!month) return toast.error("Choisissez un mois.");
        q.set("mois", month);
      }
    }
    setBusy(format);
    try {
      await download(`/api/rapports?${q}`);
      toast.success(format === "pdf" ? "Rapport PDF généré" : "Rapport Excel généré");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la génération du rapport.");
    } finally {
      setBusy(null);
    }
  };

  const groupSelect = (
    <div className="grid gap-1.5">
      <Label htmlFor="r_group">Groupe</Label>
      <Select value={groupId} onValueChange={setGroupId}>
        <SelectTrigger id="r_group" className="bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tous les groupes</SelectItem>
          {data.groups.map((g) => (
            <SelectItem key={g.id} value={String(g.id)}>
              {g.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Card className="mb-4 gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <FileDown className="size-4 text-primary" /> Rapports
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            PDF mis en page, ou classeur Excel détaillé : synthèse, regroupements par groupe et par mois, présences, assiduité, prières et témoignages.
          </p>
        </div>
      </div>

      <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
        {/* Trois colonnes égales ; icônes masquées sur téléphone pour que tout tienne */}
        <TabsList className="grid h-auto grid-cols-3">
          <TabsTrigger value="mensuel" className="px-1 py-2 text-xs sm:text-sm [&_svg]:hidden sm:[&_svg]:inline">
            <CalendarDays /> Mensuel
          </TabsTrigger>
          <TabsTrigger value="periode" className="px-1 py-2 text-xs sm:text-sm [&_svg]:hidden sm:[&_svg]:inline">
            <CalendarRange /> Période
          </TabsTrigger>
          <TabsTrigger value="evenement" className="px-1 py-2 text-xs sm:text-sm [&_svg]:hidden sm:[&_svg]:inline">
            <FileText /> Événement
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mensuel" className="grid gap-3 pt-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="r_month">Mois</Label>
            <Input id="r_month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="bg-card" />
          </div>
          {groupSelect}
        </TabsContent>

        <TabsContent value="periode" className="grid gap-3 pt-3 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="r_from">Du</Label>
            <Input id="r_from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="bg-card" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="r_to">Au</Label>
            <Input id="r_to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="bg-card" />
          </div>
          {groupSelect}
        </TabsContent>

        <TabsContent value="evenement" className="grid gap-3 pt-3">
          <div className="grid gap-1.5">
            <Label htmlFor="r_event">Événement</Label>
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger id="r_event" className="bg-card">
                <SelectValue placeholder="Aucun événement" />
              </SelectTrigger>
              <SelectContent>
                {events.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {fmtDate(e.date)} — {e.title} · {e.groupId == null ? "Tous les groupes" : group(e.groupId)?.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => generate("pdf")} disabled={busy != null}>
          {busy === "pdf" ? <Loader2 className="animate-spin" /> : <FileText />} Télécharger le PDF
        </Button>
        <Button variant="outline" onClick={() => generate("xlsx")} disabled={busy != null} className="border-emerald-200 text-emerald-700 hover:bg-emerald-50">
          {busy === "xlsx" ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />} Télécharger l’Excel
        </Button>
      </div>
    </Card>
  );
}

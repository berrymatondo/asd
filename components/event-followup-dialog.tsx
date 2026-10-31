"use client";

import * as React from "react";
import { toast } from "sonner";
import { CheckCheck, CircleCheck, CircleX, ClipboardList, Search, Users, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RichEditor, type RichEditorHandle } from "@/components/rich-editor";
import { useStore } from "@/lib/store";
import type { Id } from "@/lib/types";

export function EventFollowupDialog({ eventId, onOpenChange }: { eventId: Id | null; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={eventId != null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px]">
        {eventId != null && <Body key={eventId} eventId={eventId} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Body({ eventId, onDone }: { eventId: Id; onDone: () => void }) {
  const { data, canManageGroup, group, saveFollowup } = useStore();
  const ev = data.events.find((e) => e.id === eventId);
  const editor = React.useRef<RichEditorHandle>(null);
  // Événement commun : tous les membres sont concernés
  const members = ev ? data.people.filter((p) => ev.groupId == null || p.groupId === ev.groupId) : [];
  const [checked, setChecked] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(members.map((p) => [String(p.id), !!ev?.attendance?.[p.id]]))
  );

  const [saving, setSaving] = React.useState(false);

  if (!ev || !canManageGroup(ev.groupId)) return null;
  const locked = ev.locked;

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const attendance: Record<string, boolean> = {};
    members.forEach((p) => (attendance[p.id] = !!checked[p.id]));
    setSaving(true);
    const r = await saveFollowup(ev.id, editor.current?.getHTML() ?? "", attendance);
    setSaving(false);
    if (!r.ok) return toast.error(r.error);
    onDone();
    toast.success("Synthèse et présences enregistrées");
  };

  return (
    <form onSubmit={onSave} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>📝 Synthèse et présences — {ev.title}</DialogTitle>
        <DialogDescription>
          {locked ? "Événement verrouillé : consultation uniquement." : "Rédigez la synthèse et renseignez les présences dans la même fenêtre."}
        </DialogDescription>
      </DialogHeader>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">
            <ClipboardList /> Synthèse
          </TabsTrigger>
          <TabsTrigger value="attendance">
            <Users /> Présences ({members.filter((p) => checked[p.id]).length}/{members.length})
          </TabsTrigger>
        </TabsList>
        {/* forceMount : l’éditeur et les cases restent montés en changeant d’onglet */}
        <TabsContent value="summary" forceMount className="data-[state=inactive]:hidden">
          <RichEditor ref={editor} initialHTML={ev.summary ?? ""} readOnly={locked} />
        </TabsContent>
        <TabsContent value="attendance" forceMount className="data-[state=inactive]:hidden">
          <AttendanceBoard members={members} checked={checked} locked={locked} groupName={(gid) => group(gid)?.name} onChange={setChecked} />
        </TabsContent>
      </Tabs>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Fermer
        </Button>
        {!locked && (
          <Button type="submit" disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer synthèse et présences"}
          </Button>
        )}
      </DialogFooter>
    </form>
  );
}

type Member = { id: Id; first: string; last: string; groupId: Id | null };

/**
 * Présences séparées en deux blocs : « Présents » (vert) et « Absents » (rouge).
 * Un clic sur un membre le fait passer d’un bloc à l’autre.
 */
function AttendanceBoard({
  members,
  checked,
  locked,
  groupName,
  onChange,
}: {
  members: Member[];
  checked: Record<string, boolean>;
  locked: boolean;
  groupName: (gid: Id | null) => string | undefined;
  onChange: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
  const [query, setQuery] = React.useState("");
  const showGroup = new Set(members.map((m) => m.groupId)).size > 1; // événement commun : on précise le groupe
  const byName = (a: Member, b: Member) => `${a.first} ${a.last}`.localeCompare(`${b.first} ${b.last}`, "fr");
  const match = (m: Member) => `${m.first} ${m.last}`.toLowerCase().includes(query.trim().toLowerCase());
  const presents = members.filter((m) => checked[m.id]).sort(byName);
  const absents = members.filter((m) => !checked[m.id]).sort(byName);
  const rate = members.length ? Math.round((presents.length / members.length) * 100) : 0;

  const setAll = (value: boolean) => onChange(Object.fromEntries(members.map((m) => [String(m.id), value])));
  const toggle = (id: Id) => onChange((c) => ({ ...c, [id]: !c[id] }));

  if (!members.length) return <p className="text-xs text-muted-foreground">Aucun membre dans ce groupe.</p>;

  return (
    <div className="grid gap-3">
      {/* Résumé */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-2">
          <b className="block text-xl text-emerald-700 tabular-nums">{presents.length}</b>
          <span className="text-[11px] font-semibold text-emerald-700">Présent{presents.length > 1 ? "s" : ""}</span>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 px-2 py-2">
          <b className="block text-xl text-red-700 tabular-nums">{absents.length}</b>
          <span className="text-[11px] font-semibold text-red-700">Absent{absents.length > 1 ? "s" : ""}</span>
        </div>
        <div className="rounded-xl border bg-muted/40 px-2 py-2">
          <b className="block text-xl tabular-nums">{rate} %</b>
          <span className="text-[11px] font-semibold text-muted-foreground">sur {members.length} membres</span>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-red-100" aria-hidden>
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${rate}%` }} />
      </div>

      {/* Outils */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-40 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-9 pl-8 text-sm" placeholder="Rechercher un membre…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {!locked && (
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => setAll(true)} className="border-emerald-200 text-emerald-700 hover:bg-emerald-50">
              <CheckCheck /> Tous présents
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setAll(false)} className="border-red-200 text-red-700 hover:bg-red-50">
              <X /> Tous absents
            </Button>
          </>
        )}
      </div>
      {!locked && <p className="-mt-1 text-xs text-muted-foreground">Touchez un nom pour le faire passer de « Absents » à « Présents », et inversement.</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <AttendanceColumn
          kind="present"
          title="Présents"
          items={presents.filter(match)}
          total={presents.length}
          locked={locked}
          showGroup={showGroup}
          groupName={groupName}
          onToggle={toggle}
        />
        <AttendanceColumn
          kind="absent"
          title="Absents"
          items={absents.filter(match)}
          total={absents.length}
          locked={locked}
          showGroup={showGroup}
          groupName={groupName}
          onToggle={toggle}
        />
      </div>
    </div>
  );
}

function AttendanceColumn({
  kind,
  title,
  items,
  total,
  locked,
  showGroup,
  groupName,
  onToggle,
}: {
  kind: "present" | "absent";
  title: string;
  items: Member[];
  total: number;
  locked: boolean;
  showGroup: boolean;
  groupName: (gid: Id | null) => string | undefined;
  onToggle: (id: Id) => void;
}) {
  const isPresent = kind === "present";
  const Icon = isPresent ? CircleCheck : CircleX;
  return (
    <section
      aria-label={`${title} (${total})`}
      className={cn("overflow-hidden rounded-xl border-2", isPresent ? "border-emerald-200 bg-emerald-50/40" : "border-red-200 bg-red-50/40")}
    >
      <h4
        className={cn(
          "flex items-center justify-between px-3 py-2 text-[13px] font-extrabold text-white",
          isPresent ? "bg-emerald-600" : "bg-red-600"
        )}
      >
        <span className="flex items-center gap-1.5">
          <Icon className="size-4" /> {title}
        </span>
        <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs tabular-nums">{total}</span>
      </h4>
      {items.length ? (
        <ul className="max-h-72 divide-y overflow-y-auto">
          {items.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                disabled={locked}
                onClick={() => onToggle(m.id)}
                title={locked ? undefined : isPresent ? "Marquer absent" : "Marquer présent"}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors disabled:cursor-default",
                  !locked && "cursor-pointer",
                  !locked && (isPresent ? "hover:bg-emerald-100/70" : "hover:bg-red-100/70")
                )}
              >
                <Icon className={cn("size-4.5 shrink-0", isPresent ? "text-emerald-600" : "text-red-500")} />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[13px]">
                    {m.first} {m.last}
                  </b>
                  {showGroup && <span className="block truncate text-[11px] text-muted-foreground">{groupName(m.groupId) ?? "Sans groupe"}</span>}
                </span>
                {!locked && (
                  <span className={cn("shrink-0 text-[11px] font-semibold", isPresent ? "text-red-600" : "text-emerald-700")}>
                    {isPresent ? "→ Absent" : "→ Présent"}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-3 py-4 text-center text-xs text-muted-foreground">{total ? "Aucun résultat." : isPresent ? "Personne pour l’instant." : "Aucun absent."}</p>
      )}
    </section>
  );
}

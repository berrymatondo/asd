"use client";

import * as React from "react";
import { toast } from "sonner";
import { ClipboardList, Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { RichEditor, type RichEditorHandle } from "@/components/rich-editor";
import { useStore } from "@/lib/store";
import type { Id } from "@/lib/types";

export function EventFollowupDialog({ eventId, onOpenChange }: { eventId: Id | null; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={eventId != null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px]">
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
  const present = members.filter((p) => checked[p.id]).length;

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
            <Users /> Présences
          </TabsTrigger>
        </TabsList>
        {/* forceMount : l’éditeur et les cases restent montés en changeant d’onglet */}
        <TabsContent value="summary" forceMount className="data-[state=inactive]:hidden">
          <RichEditor ref={editor} initialHTML={ev.summary ?? ""} readOnly={locked} />
        </TabsContent>
        <TabsContent value="attendance" forceMount className="data-[state=inactive]:hidden">
          <div className="mb-3 rounded-lg bg-blue-50 px-3 py-2.5 text-[13px] font-bold">
            {present} présent(s) · {members.length - present} absent(s) · {members.length} membre(s)
          </div>
          {members.length ? (
            <div className="divide-y">
              {members.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-3 py-3.5">
                  <Checkbox
                    checked={!!checked[p.id]}
                    disabled={locked}
                    onCheckedChange={(v) => setChecked((c) => ({ ...c, [p.id]: v === true }))}
                  />
                  <div className="min-w-0 flex-1">
                    <b className="text-[13px]">
                      {p.first} {p.last}
                    </b>
                    <p className="mt-1 text-xs text-muted-foreground">{group(p.groupId)?.name}</p>
                  </div>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Aucun membre dans ce groupe.</p>
          )}
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

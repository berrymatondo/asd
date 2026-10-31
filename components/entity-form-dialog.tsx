"use client";

import * as React from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStore } from "@/lib/store";
import { today } from "@/lib/format";
import type { AsdEvent, CollectionKey, Id, Prayer, Testimony } from "@/lib/types";

const LABELS: Record<CollectionKey, string> = {
  groups: "groupe",
  people: "membre",
  events: "événement",
  docs: "document",
  prayers: "sujet de prière",
  testimonies: "témoignage",
};

const MAX_FILE = 3 * 1024 * 1024;

export function EntityFormDialog({
  type,
  itemId,
  open,
  onOpenChange,
}: {
  type: CollectionKey;
  itemId?: Id | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && <FormBody key={`${type}-${itemId ?? "new"}`} type={type} itemId={itemId} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, name, required, children }: { label: string; name: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`f_${name}`}>
        {label}
        {required && " *"}
      </Label>
      {children}
    </div>
  );
}

function FormBody({ type, itemId, onDone }: { type: CollectionKey; itemId?: Id | null; onDone: () => void }) {
  const { data, isBerger, upsert, saveDoc, group, canEditOwn } = useStore();
  const old = itemId ? (data[type] as { id: Id }[]).find((x) => x.id === itemId) : undefined;
  const o = (old ?? {}) as Record<string, unknown>;
  const str = (k: string) => (o[k] as string | undefined) ?? "";

  // Un membre peut être créé sans groupe ; les autres éléments en exigent un
  const [groupId, setGroupId] = React.useState<string>(
    o.groupId != null ? String(o.groupId) : type === "people" && !itemId ? "none" : String(data.groups[0]?.id ?? "")
  );
  const [shepherdId, setShepherdId] = React.useState<string>(o.shepherdId != null ? String(o.shepherdId) : "none");
  const [prayerId, setPrayerId] = React.useState<string>(o.prayerId ? String(o.prayerId) : "none");
  const [saving, setSaving] = React.useState(false);

  // Un membre peut ajouter des prières/témoignages et modifier les siens
  const allowed = isBerger || ((type === "prayers" || type === "testimonies") && (!old || canEditOwn(old as Prayer | Testimony)));

  // Prières exaucées proposées pour le lien : même groupe que le témoignage (ou déjà liée)
  const linkablePrayers = data.prayers.filter(
    (p) => p.answered && (String(p.groupId) === groupId || p.id === (o.prayerId as Id | undefined))
  );

  React.useEffect(() => {
    if (prayerId !== "none" && !linkablePrayers.some((p) => String(p.id) === prayerId)) setPrayerId("none");
  }, [groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!allowed) return null;

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (type !== "groups" && type !== "people" && (!groupId || groupId === "none")) return toast.error("Veuillez choisir un groupe.");

    // Contrôles rapides côté navigateur ; le serveur revalide tout
    if (type === "events") {
      if (String(form.get("end")) <= String(form.get("start"))) return toast.error("L’heure de fin doit être après le début.");
      if ((old as AsdEvent | undefined)?.locked) return toast.error("Cet événement est verrouillé.");
    }
    if (type === "testimonies" && prayerId !== "none") {
      const prayer = data.prayers.find((p) => String(p.id) === prayerId);
      if (!prayer?.answered || String(prayer.groupId) !== groupId) return toast.error("Choisissez une prière exaucée du même groupe.");
    }

    setSaving(true);
    let r;
    if (type === "docs") {
      const file = form.get("upload") as File | null;
      if (file && file.size > MAX_FILE) {
        setSaving(false);
        return toast.error("Fichier trop volumineux (max. 3 Mo).");
      }
      if (!itemId && !file?.size) {
        setSaving(false);
        return toast.error("Veuillez joindre un fichier.");
      }
      if (itemId) form.set("id", String(itemId));
      form.set("groupId", groupId);
      r = await saveDoc(form);
    } else {
      const obj: Record<string, unknown> = Object.fromEntries(form.entries());
      obj.id = itemId ?? null;
      if (type === "groups") obj.shepherdId = shepherdId !== "none" ? Number(shepherdId) : null;
      else obj.groupId = groupId !== "none" ? Number(groupId) : null;
      if (type === "testimonies") obj.prayerId = prayerId !== "none" ? Number(prayerId) : null;
      r = await upsert(type, obj);
    }
    setSaving(false);
    if (!r.ok) return toast.error(r.error);
    onDone();
    toast.success("Enregistré avec succès");
  };

  const optionalGroup = type === "people";
  const GroupSelect = (
    <Field label={optionalGroup ? "Groupe (facultatif)" : "Groupe"} name="groupId" required={!optionalGroup}>
      <Select value={groupId} onValueChange={setGroupId}>
        <SelectTrigger id="f_groupId">
          <SelectValue placeholder="Choisir un groupe" />
        </SelectTrigger>
        <SelectContent>
          {optionalGroup && <SelectItem value="none">Aucun groupe</SelectItem>}
          {data.groups.map((g) => (
            <SelectItem key={g.id} value={String(g.id)}>
              {g.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );

  const text = (label: string, name: string, required = false, inputType = "text") => (
    <Field label={label} name={name} required={required}>
      <Input id={`f_${name}`} name={name} type={inputType} defaultValue={str(name)} required={required} />
    </Field>
  );
  const area = (label: string, name: string, required = false) => (
    <Field label={label} name={name} required={required}>
      <Textarea id={`f_${name}`} name={name} defaultValue={str(name)} required={required} />
    </Field>
  );
  const dateField = (
    <Field label="Date" name="date" required>
      <Input id="f_date" name="date" type="date" defaultValue={str("date") || today()} required />
    </Field>
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>
          {itemId ? "Modifier" : "Ajouter"} — {LABELS[type]}
        </DialogTitle>
        <DialogDescription>Complétez les informations ci-dessous.</DialogDescription>
      </DialogHeader>

      {type === "groups" && (
        <>
          {text("Nom", "name", true)}
          {text("Objectif", "goal", true)}
          {area("Description", "desc")}
          <Field label="Berger responsable" name="shepherdId">
            <Select value={shepherdId} onValueChange={setShepherdId}>
              <SelectTrigger id="f_shepherdId">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucun berger désigné</SelectItem>
                {data.people.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.first} {p.last}
                    {p.groupId != null && p.groupId !== itemId ? ` — ${group(p.groupId)?.name ?? ""}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Un berger est d’abord un membre : créez sa fiche dans « Membres » s’il n’apparaît pas ici.
            </p>
          </Field>
        </>
      )}

      {type === "people" && (
        <>
          {text("Prénom", "first", true)}
          {text("Nom", "last")}
          {text("Téléphone", "phone", false, "tel")}
          {GroupSelect}
          {area("Fiche descriptive privée", "notes")}
        </>
      )}

      {type === "events" && (
        <>
          {text("Titre", "title", true)}
          {GroupSelect}
          {dateField}
          <div className="grid grid-cols-2 gap-3">
            {text("Heure de début", "start", true, "time")}
            {text("Heure de fin", "end", true, "time")}
          </div>
        </>
      )}

      {type === "docs" && (
        <>
          {text("Titre", "title", true)}
          {area("Description", "desc")}
          {GroupSelect}
          <Field label={`Fichier ou image${itemId ? " (facultatif pour conserver l’existant)" : ""}`} name="upload">
            <Input id="f_upload" name="upload" type="file" accept="image/*,.pdf,.doc,.docx,.txt,.xlsx" />
            {str("fileName") && <p className="text-xs text-muted-foreground">Fichier actuel : {str("fileName")}</p>}
          </Field>
        </>
      )}

      {(type === "prayers" || type === "testimonies") && (
        <>
          {text(type === "prayers" ? "Auteur (facultatif)" : "Auteur", "author", type === "testimonies")}
          {GroupSelect}
          {dateField}
          {area("Description", "desc", true)}
          {type === "testimonies" && (
            <Field label="Prière exaucée liée (facultatif)" name="prayerId">
              <Select value={prayerId} onValueChange={setPrayerId}>
                <SelectTrigger id="f_prayerId">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune prière liée</SelectItem>
                  {linkablePrayers.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.desc.slice(0, 90)} — {group(p.groupId)?.name ?? ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Seules les prières exaucées peuvent être liées. Le groupe du témoignage doit correspondre.
              </p>
            </Field>
          )}
        </>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </DialogFooter>
    </form>
  );
}


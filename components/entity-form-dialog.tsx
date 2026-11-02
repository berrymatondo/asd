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
import { Paperclip, Undo2, X } from "lucide-react";
import { fmtDate, fmtSize, today } from "@/lib/format";
import type { AsdEvent, CollectionKey, Doc, Id, Person, Prayer, Testimony } from "@/lib/types";

const LABELS: Record<CollectionKey, string> = {
  groups: "groupe",
  people: "membre",
  events: "événement",
  docs: "document",
  prayers: "sujet de prière",
  testimonies: "témoignage",
};

const MAX_FILE = 4 * 1024 * 1024;
const MAX_FILES = 10;

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
  const { data, user, person, isAdmin, isBerger, upsert, saveDoc, group, canEditOwn, canManageGroup, canManagePerson, managedGroups } = useStore();
  const old = itemId ? (data[type] as { id: Id }[]).find((x) => x.id === itemId) : undefined;
  const o = (old ?? {}) as Record<string, unknown>;
  const str = (k: string) => (o[k] as string | undefined) ?? "";

  // Groupes proposés : tous pour les prières/témoignages, sinon uniquement ceux que l’on gère
  const groupOptions = type === "prayers" || type === "testimonies" ? data.groups : managedGroups;

  const isPost = type === "prayers" || type === "testimonies";
  // Fiche de l’utilisateur connecté : proposée par défaut pour ses prières/témoignages
  const myFiche = person(user.personId);

  // Un membre peut être créé sans groupe ; les autres éléments en exigent un
  // "none" = membre sans groupe ; "all" = événement commun à tous les groupes (admin)
  const [groupId, setGroupId] = React.useState<string>(
    o.groupId != null
      ? String(o.groupId)
      : isPost && (myFiche?.groupId ?? user.groupId) != null
        ? String(myFiche?.groupId ?? user.groupId)
      : type === "people" && !itemId
        ? "none"
        : (type === "events" && itemId) || (type === "docs" && isAdmin)
          ? "all"
          : String(groupOptions[0]?.id ?? "")
  );
  // Documents : fichiers existants à retirer et nouveaux fichiers à envoyer
  const existingFiles = type === "docs" ? ((old as Doc | undefined)?.files ?? []) : [];
  const [removed, setRemoved] = React.useState<Id[]>([]);
  const [newFiles, setNewFiles] = React.useState<File[]>([]);
  const [progress, setProgress] = React.useState<string | null>(null);
  // Événements : période début → fin (la fin peut être le lendemain, ex. veillée)
  const [startDate, setStartDate] = React.useState<string>(str("date") || today());
  const [endDate, setEndDate] = React.useState<string>(str("endDate") || str("date") || today());
  const [shepherdId, setShepherdId] = React.useState<string>(o.shepherdId != null ? String(o.shepherdId) : "none");
  const [prayerId, setPrayerId] = React.useState<string>(o.prayerId ? String(o.prayerId) : "none");
  // Membre concerné par la prière / le témoignage (fiche du même groupe)
  const [personId, setPersonId] = React.useState<string>(
    o.personId != null ? String(o.personId) : !itemId && isPost && myFiche?.groupId != null ? String(myFiche.id) : "none"
  );
  const groupMembers = data.people.filter((p) => String(p.groupId) === groupId);
  const [saving, setSaving] = React.useState(false);

  const oldGroup = o.groupId as Id | null | undefined;
  const allowed =
    type === "prayers" || type === "testimonies"
      ? !old || canEditOwn(old as Prayer | Testimony)
      : type === "groups"
        ? old
          ? canManageGroup(old.id)
          : isAdmin
        : type === "people"
          ? old
            ? canManagePerson(old as Person)
            : isBerger
          : old
            ? canManageGroup(oldGroup)
            : managedGroups.length > 0;

  // Prières exaucées proposées pour le lien : même groupe que le témoignage (ou déjà liée)
  const linkablePrayers = data.prayers.filter(
    (p) => p.answered && (String(p.groupId) === groupId || p.id === (o.prayerId as Id | undefined))
  );

  React.useEffect(() => {
    if (prayerId !== "none" && !linkablePrayers.some((p) => String(p.id) === prayerId)) setPrayerId("none");
    if (personId !== "none" && !groupMembers.some((p) => String(p.id) === personId)) setPersonId("none");
  }, [groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!allowed) return null;

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (type !== "groups" && type !== "people" && (!groupId || groupId === "none")) return toast.error("Veuillez choisir un groupe.");

    // Contrôles rapides côté navigateur ; le serveur revalide tout
    if (type === "events") {
      if (`${form.get("endDate")} ${form.get("end")}` <= `${form.get("date")} ${form.get("start")}`)
        return toast.error("La fin doit être après le début (date et heure).");
      if ((old as AsdEvent | undefined)?.locked) return toast.error("Cet événement est verrouillé.");
    }
    if (type === "testimonies" && prayerId !== "none") {
      const prayer = data.prayers.find((p) => String(p.id) === prayerId);
      if (!prayer?.answered || String(prayer.groupId) !== groupId) return toast.error("Choisissez une prière exaucée du même groupe.");
    }

    setSaving(true);
    let r;
    if (type === "docs") {
      const kept = existingFiles.length - removed.length;
      if (kept + newFiles.length === 0) {
        setSaving(false);
        return toast.error("Joignez au moins un fichier.");
      }
      if (kept + newFiles.length > MAX_FILES) {
        setSaving(false);
        return toast.error(`Un document peut contenir au plus ${MAX_FILES} fichiers.`);
      }
      r = await saveDoc(
        { id: itemId ?? null, title: form.get("title"), desc: form.get("desc"), groupId: groupId === "all" ? null : Number(groupId), removeFileIds: removed },
        newFiles,
        (done, total) => setProgress(`Envoi ${done}/${total}…`)
      );
      setProgress(null);
    } else {
      const obj: Record<string, unknown> = Object.fromEntries(form.entries());
      obj.id = itemId ?? null;
      if (type === "groups") obj.shepherdId = shepherdId !== "none" ? Number(shepherdId) : null;
      else obj.groupId = groupId !== "none" && groupId !== "all" ? Number(groupId) : null;
      if (type === "testimonies") obj.prayerId = prayerId !== "none" ? Number(prayerId) : null;
      if (isPost) obj.personId = personId !== "none" ? Number(personId) : null;
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
          {(type === "events" || type === "docs") && isAdmin && <SelectItem value="all">🌐 Tous les groupes</SelectItem>}
          {groupOptions.map((g) => (
            <SelectItem key={g.id} value={String(g.id)}>
              {g.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );

  const text = (label: string, name: string, required = false, inputType = "text", fallback?: string) => (
    <Field label={label} name={name} required={required}>
      <Input id={`f_${name}`} name={name} type={inputType} defaultValue={str(name) || fallback} required={required} />
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
          {!isAdmin ? (
            <p className="rounded-lg bg-accent px-3 py-2.5 text-xs leading-relaxed text-primary">
              Seul un administrateur peut changer le berger de ce groupe.
            </p>
          ) : (
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
          )}
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
          {text("Thème (facultatif)", "theme")}
          {GroupSelect}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date de début" name="date" required>
              <Input
                id="f_date"
                name="date"
                type="date"
                value={startDate}
                required
                onChange={(e) => {
                  const v = e.target.value;
                  setStartDate(v);
                  // La fin suit le début si elle devient antérieure
                  if (v && endDate < v) setEndDate(v);
                }}
              />
            </Field>
            {text("Heure de début", "start", true, "time")}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date de fin" name="endDate" required>
              <Input id="f_endDate" name="endDate" type="date" value={endDate} min={startDate} required onChange={(e) => setEndDate(e.target.value)} />
            </Field>
            {text("Heure de fin", "end", true, "time")}
          </div>
          {startDate && endDate > startDate && (
            <p className="-mt-2 text-xs text-muted-foreground">Événement sur plusieurs jours : il se termine le {fmtDate(endDate)}.</p>
          )}
        </>
      )}

      {type === "docs" && (
        <>
          {text("Titre", "title", true)}
          {area("Description", "desc")}
          {GroupSelect}
          <Field label="Fichiers ou images" name="upload" required>
            {(existingFiles.length > 0 || newFiles.length > 0) && (
              <ul className="grid gap-1.5">
                {existingFiles.map((f) => {
                  const isRemoved = removed.includes(f.id);
                  return (
                    <FileRow
                      key={f.id}
                      name={f.fileName}
                      size={f.size}
                      struck={isRemoved}
                      action={isRemoved ? "Garder" : "Retirer"}
                      onAction={() => setRemoved((r) => (isRemoved ? r.filter((x) => x !== f.id) : [...r, f.id]))}
                    />
                  );
                })}
                {newFiles.map((f, i) => (
                  <FileRow key={`new-${i}`} name={f.name} size={f.size} isNew action="Retirer" onAction={() => setNewFiles((l) => l.filter((_, j) => j !== i))} />
                ))}
              </ul>
            )}
            <Input
              id="f_upload"
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.txt,.xlsx,.pptx"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                e.target.value = ""; // permet d’ajouter d’autres fichiers ensuite
                const tooBig = picked.filter((f) => f.size > MAX_FILE);
                if (tooBig.length) toast.error(`Trop volumineux (max. 4 Mo) : ${tooBig.map((f) => f.name).join(", ")}`);
                setNewFiles((l) => [...l, ...picked.filter((f) => f.size <= MAX_FILE)]);
              }}
            />
            <p className="text-xs text-muted-foreground">Plusieurs fichiers possibles (jusqu’à {MAX_FILES}, 4 Mo chacun).</p>
          </Field>
        </>
      )}

      {(type === "prayers" || type === "testimonies") && (
        <>
          {GroupSelect}
          <Field label="Membre concerné (facultatif)" name="personId">
            <Select
              value={personId}
              onValueChange={(v) => {
                setPersonId(v);
                // Pré-remplit l’auteur s’il est vide
                const m = groupMembers.find((p) => String(p.id) === v);
                const author = document.getElementById("f_author") as HTMLInputElement | null;
                if (m && author && !author.value.trim()) author.value = `${m.first} ${m.last}`.trim();
              }}
            >
              <SelectTrigger id="f_personId">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucun membre précis</SelectItem>
                {groupMembers.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.first} {p.last}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Visible ensuite sur la fiche du membre.</p>
          </Field>
          {text(
            type === "prayers" ? "Auteur (facultatif)" : "Auteur",
            "author",
            type === "testimonies",
            "text",
            !itemId && myFiche && personId === String(myFiche.id) ? `${myFiche.first} ${myFiche.last}`.trim() : undefined
          )}
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
          {saving ? (progress ?? "Enregistrement…") : "Enregistrer"}
        </Button>
      </DialogFooter>
    </form>
  );
}


function FileRow({
  name,
  size,
  struck,
  isNew,
  action,
  onAction,
}: {
  name: string;
  size: number;
  struck?: boolean;
  isNew?: boolean;
  action: string;
  onAction: () => void;
}) {
  return (
    <li className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5 text-xs">
      <Paperclip className="size-3.5 shrink-0 text-primary" />
      <span className={`min-w-0 flex-1 truncate ${struck ? "text-muted-foreground line-through" : ""}`}>{name}</span>
      {isNew && <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-primary">Nouveau</span>}
      <span className="shrink-0 text-muted-foreground">{fmtSize(size)}</span>
      <button
        type="button"
        onClick={onAction}
        title={`${action} ${name}`}
        aria-label={`${action} ${name}`}
        className="grid size-6 shrink-0 cursor-pointer place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        {struck ? <Undo2 className="size-3.5" /> : <X className="size-3.5" />}
      </button>
    </li>
  );
}

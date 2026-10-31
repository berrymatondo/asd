"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowUpRight,
  Check,
  Download,
  FileDown,
  Link2,
  Lock,
  LockOpen,
  NotebookPen,
  Pencil,
  Plus,
  Search,
  Target,
  Trash2,
  Undo2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityFormDialog } from "@/components/entity-form-dialog";
import { EventFollowupDialog } from "@/components/event-followup-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useStore } from "@/lib/store";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AsdEvent, CollectionKey, Doc, Group, Id, Person, Prayer, Testimony } from "@/lib/types";

const CONFIG: Record<CollectionKey, { title: string; sub: string; add: string; kicker: string; route: string }> = {
  groups: { title: "Groupes", sub: "Découvrez et accompagnez les communautés.", add: "Nouveau groupe", kicker: "GROUPE", route: "/groupes" },
  people: { title: "Membres", sub: "Informations privées, accessibles uniquement au berger.", add: "Ajouter un membre", kicker: "MEMBRE", route: "/membres" },
  events: { title: "Événements", sub: "Organisez les rencontres et suivez les présences.", add: "Nouvel événement", kicker: "RENCONTRE", route: "/evenements" },
  docs: { title: "Documents", sub: "Ressources partagées avec tous les membres.", add: "Ajouter un document", kicker: "RESSOURCE", route: "/documents" },
  prayers: { title: "Sujets de prière", sub: "Prions ensemble et suivons les exaucements.", add: "Ajouter un sujet", kicker: "INTERCESSION", route: "/prieres" },
  testimonies: { title: "Témoignages", sub: "Partageons les histoires qui nous encouragent.", add: "Ajouter un témoignage", kicker: "PARTAGE", route: "/temoignages" },
};

type AnyItem = Group | Person | AsdEvent | Doc | Prayer | Testimony;

export function CollectionPage({ type }: { type: CollectionKey }) {
  const store = useStore();
  const { data, isBerger } = store;
  const params = useSearchParams();
  const router = useRouter();
  const cfg = CONFIG[type];

  const [search, setSearch] = React.useState("");
  const [currentGroup, setCurrentGroup] = React.useState<string>(params.get("groupe") ?? "all");
  const [form, setForm] = React.useState<{ open: boolean; id?: Id | null }>({ open: false });
  const [followup, setFollowup] = React.useState<Id | null>(null);
  const [toDelete, setToDelete] = React.useState<Id | null>(null);
  const [blocked, setBlocked] = React.useState(false);
  const [flash, setFlash] = React.useState<Id | null>(null);

  // Filtre de groupe et mise en avant transmis par l’URL (?groupe=…, ?focus=…)
  React.useEffect(() => {
    setCurrentGroup(params.get("groupe") ?? "all");
    setSearch("");
    const focus = params.get("focus");
    if (!focus) return;
    const id = Number(focus);
    setFlash(id);
    requestAnimationFrame(() => document.getElementById(`item-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    const t = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(t);
  }, [params]);

  const items = (data[type] as AnyItem[]).filter((o) => {
    const gid = type === "groups" ? o.id : (o as { groupId: Id | null }).groupId;
    if (currentGroup === "none" ? gid != null : currentGroup !== "all" && String(gid) !== currentGroup) return false;
    return JSON.stringify(o).toLowerCase().includes(search.toLowerCase());
  });

  const canAdd = isBerger || type === "prayers" || type === "testimonies";

  const askDelete = (id: Id) => {
    if (type === "events" && data.events.find((e) => e.id === id)?.locked)
      return toast.error("Débloquez cet événement avant de le supprimer.");
    if (type === "groups" && !store.canDeleteGroup(id)) return setBlocked(true);
    setToDelete(id);
  };

  const doDelete = async () => {
    if (toDelete == null) return;
    const r = await store.remove(type, toDelete);
    setToDelete(null);
    if (!r.ok) return toast.error(r.error);
    toast("Élément supprimé");
  };

  const openEdit = (id: Id) => {
    if (type === "events" && data.events.find((e) => e.id === id)?.locked) return toast.error("Cet événement est verrouillé.");
    setForm({ open: true, id });
  };

  return (
    <>
      <div className="mb-7 flex items-start justify-between gap-5 sm:items-center">
        <div>
          <div className="text-xs font-extrabold tracking-[1.3px] text-primary uppercase">Espace communautaire</div>
          <h1 className="my-2 text-2xl font-bold tracking-tight md:text-[30px]">{cfg.title}</h1>
          <p className="text-sm text-muted-foreground">{cfg.sub}</p>
        </div>
        {canAdd && (
          <Button onClick={() => setForm({ open: true, id: null })}>
            <Plus /> <span className="hidden sm:inline">{cfg.add}</span>
            <span className="sm:hidden">Ajouter</span>
          </Button>
        )}
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="bg-card pl-9" placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={currentGroup} onValueChange={setCurrentGroup}>
          <SelectTrigger className="w-full bg-card sm:w-52.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les groupes</SelectItem>
            {type === "people" && <SelectItem value="none">Sans groupe</SelectItem>}
            {data.groups.map((g) => (
              <SelectItem key={g.id} value={String(g.id)}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {items.length ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((o) => (
            <ItemCard
              key={o.id}
              type={type}
              item={o}
              kicker={cfg.kicker}
              flash={flash === o.id}
              onEdit={() => openEdit(o.id)}
              onDelete={() => askDelete(o.id)}
              onFollowup={() => setFollowup(o.id)}
              onNavigate={(href) => router.push(href)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed bg-card p-14 text-center text-muted-foreground">Aucun résultat pour cette recherche.</div>
      )}

      <EntityFormDialog type={type} itemId={form.id} open={form.open} onOpenChange={(open) => setForm((f) => ({ ...f, open }))} />
      {type === "events" && <EventFollowupDialog eventId={followup} onOpenChange={(o) => !o && setFollowup(null)} />}
      <ConfirmDialog
        open={toDelete != null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Supprimer cet élément ?"
        description="Cette action est définitive."
        confirmLabel="Supprimer"
        destructive
        onConfirm={doDelete}
      />
      <ConfirmDialog
        open={blocked}
        onOpenChange={setBlocked}
        infoOnly
        title="Suppression impossible"
        description="Ce groupe contient encore des éléments. Réaffectez ou supprimez-les avant de supprimer le groupe."
      />
    </>
  );
}

function ItemCard({
  type,
  item,
  kicker,
  flash,
  onEdit,
  onDelete,
  onFollowup,
  onNavigate,
}: {
  type: CollectionKey;
  item: AnyItem;
  kicker: string;
  flash: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onFollowup: () => void;
  onNavigate: (href: string) => void;
}) {
  const { data, isBerger, group, person, shepherdOf, toggleLock, toggleAnswered, canEditOwn } = useStore();
  let title: React.ReactNode = null;
  let desc: React.ReactNode = null;
  let meta: React.ReactNode = null;
  let badge: React.ReactNode = null;
  let linked: React.ReactNode = null;
  let highlighted = false;

  const editBtn = (
    <Button variant="outline" size="sm" onClick={onEdit}>
      <Pencil /> Modifier
    </Button>
  );
  const delBtn = (
    <Button variant="destructive" size="sm" onClick={onDelete}>
      <Trash2 /> Supprimer
    </Button>
  );
  let actions: React.ReactNode = null;

  if (type === "groups") {
    const g = item as Group;
    const count = data.people.filter((p) => p.groupId === g.id).length;
    const shepherd = person(g.shepherdId);
    title = <>◈ {g.name}</>;
    desc = g.desc;
    meta = (
      <>
        <span className="flex items-center gap-1.5">
          <Target className="size-3.5" /> {g.goal}
        </span>
        <button
          type="button"
          title="Voir les membres de ce groupe"
          onClick={() => (isBerger ? onNavigate(`/membres?groupe=${g.id}`) : toast("La liste des membres est réservée au berger."))}
          className="mt-1 inline-flex cursor-pointer items-center gap-1.5 rounded py-1 text-left text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          👤 Berger : {shepherd ? `${shepherd.first} ${shepherd.last}`.trim() : "non désigné"} · {count} membres <ArrowUpRight className="size-3.5" aria-hidden />
        </button>
      </>
    );
    if (isBerger)
      actions = (
        <>
          {editBtn}
          {delBtn}
        </>
      );
  }

  if (type === "people") {
    const p = item as Person;
    const leads = shepherdOf(p.id);
    title = <>♙ {p.first} {p.last}</>;
    if (leads.length) badge = <Badge variant="success">Berger · {leads.map((g) => g.name).join(", ")}</Badge>;
    desc = <>🔒 {p.notes || "Aucune fiche descriptive"}</>;
    meta = (
      <>
        {group(p.groupId)?.name ?? "Sans groupe"} · {p.phone || "Téléphone non renseigné"}
      </>
    );
    actions = (
      <>
        {editBtn}
        {delBtn}
      </>
    );
  }

  if (type === "events") {
    const e = item as AsdEvent;
    title = <>📅 {e.title}</>;
    desc = (
      <>
        {fmtDate(e.date)} · {e.start} – {e.end}
      </>
    );
    meta = group(e.groupId)?.name;
    badge = (
      <Badge variant={e.locked ? "pending" : "success"}>
        {e.locked ? (
          <>
            <Lock /> Bloqué
          </>
        ) : (
          "Éditable"
        )}
      </Badge>
    );
    actions = (
      <>
        <Button variant="soft" size="sm" onClick={() => window.open(`/rapport/${e.id}`, "_blank", "noopener")}>
          <FileDown /> Rapport PDF
        </Button>
        {isBerger && (
          <>
            <Button variant="soft" size="sm" onClick={onFollowup}>
              <NotebookPen /> Synthèse & présences
            </Button>
            <Button variant="outline" size="sm" onClick={() => toggleLock(e.id)}>
              {e.locked ? (
                <>
                  <LockOpen /> Débloquer
                </>
              ) : (
                <>
                  <Lock /> Bloquer
                </>
              )}
            </Button>
            {!e.locked && (
              <>
                {editBtn}
                {delBtn}
              </>
            )}
          </>
        )}
      </>
    );
  }

  if (type === "docs") {
    const d = item as Doc;
    title = <>📄 {d.title}</>;
    desc = d.desc;
    meta = (
      <>
        {d.fileName || "Sans fichier"}
        {d.size ? ` (${fmtSize(d.size)})` : ""} · {group(d.groupId)?.name}
      </>
    );
    actions = (
      <>
        <Button variant="soft" size="sm" onClick={() => downloadDoc(d)}>
          <Download /> Télécharger
        </Button>
        {isBerger && (
          <>
            {editBtn}
            {delBtn}
          </>
        )}
      </>
    );
  }

  if (type === "prayers" || type === "testimonies") {
    const o = item as Prayer | Testimony;
    title = type === "prayers" ? "🙏 Sujet de prière" : "✨ Témoignage";
    desc = o.desc;
    const linkedPrayer = type === "testimonies" && (o as Testimony).prayerId ? data.prayers.find((p) => p.id === (o as Testimony).prayerId) : undefined;
    meta = (
      <>
        {o.author || "Anonyme"} · {fmtDate(o.date)} · {group(o.groupId)?.name}
        {type === "testimonies" && (o as Testimony).prayerId && (
          <span className="mt-1 flex items-start gap-1.5">
            <Link2 className="mt-0.5 size-3.5 shrink-0" /> Prière liée : {linkedPrayer?.desc.slice(0, 95) ?? "Prière supprimée"}
          </span>
        )}
      </>
    );
    badge = <Badge variant={o.answered ? "success" : "pending"}>{o.answered ? "✓ Exaucé" : "En attente"}</Badge>;

    if (type === "prayers" && o.answered) {
      const ts = data.testimonies.filter((t) => t.prayerId === o.id);
      if (ts.length) {
        highlighted = true;
        linked = (
          <LinkedBanner
            text={`${ts.length} témoignage${ts.length > 1 ? "s" : ""} lié${ts.length > 1 ? "s" : ""} à cette prière exaucée`}
            button="Voir le témoignage"
            onClick={() => onNavigate(`/temoignages?focus=${ts[0].id}`)}
          />
        );
      }
    }
    if (type === "testimonies" && linkedPrayer?.answered) {
      highlighted = true;
      linked = <LinkedBanner text="Témoignage lié à une prière exaucée" button="Voir la prière" onClick={() => onNavigate(`/prieres?focus=${linkedPrayer.id}`)} />;
    }

    if (!isBerger && canEditOwn(o))
      actions = (
        <>
          {editBtn}
          {delBtn}
        </>
      );
    if (isBerger)
      actions = (
        <>
          <Button variant="soft" size="sm" onClick={() => toggleAnswered(type, o.id)}>
            {o.answered ? (
              <>
                <Undo2 /> Non exaucé
              </>
            ) : (
              <>
                <Check /> Marquer exaucé
              </>
            )}
          </Button>
          {editBtn}
          {delBtn}
        </>
      );
  }

  return (
    <Card
      id={`item-${item.id}`}
      className={cn(
        "gap-3 transition-shadow",
        highlighted && "border-2 border-violet-500 bg-gradient-to-br from-white to-[#f6f1ff] shadow-[0_8px_30px_#7c3aed1c]",
        flash && "focus-flash"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-muted-foreground">{kicker}</span>
        {badge}
      </div>
      <h3 className="text-[17px] font-bold">{title}</h3>
      <p className="text-[13px] leading-relaxed text-muted-foreground">{desc}</p>
      <div className="flex flex-col text-xs text-[#59677e]">{meta}</div>
      {linked}
      {actions && <div className="mt-auto flex flex-wrap gap-2 pt-2">{actions}</div>}
    </Card>
  );
}

function LinkedBanner({ text, button, onClick }: { text: string; button: string; onClick: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-violet-100 px-3 py-2.5 text-[13px] font-bold text-violet-800">
      ✨ {text}
      <button type="button" onClick={onClick} className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 hover:bg-violet-50">
        {button} <ArrowUpRight className="size-3.5" />
      </button>
    </div>
  );
}

function downloadDoc(d: Doc) {
  // Le fichier est servi par /api/documents/[id] (réservé aux utilisateurs connectés)
  const a = document.createElement("a");
  a.href = `/api/documents/${d.id}`;
  a.download = d.fileName || "document";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowUpRight,
  Check,
  Download,
  FileDown,
  Paperclip,
  X,
  Eye,
  UserRound,
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
import { MemberDetailDialog } from "@/components/member-detail-dialog";
import { EventFollowupDialog } from "@/components/event-followup-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useStore } from "@/lib/store";
import { fileUrl, fmtDate, fmtPeriod, fmtSize, isPreviewable } from "@/lib/format";
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
  const { data, isBerger, isAdmin, user, managedGroups, canManagePerson } = store;
  const params = useSearchParams();
  const router = useRouter();
  const cfg = CONFIG[type];

  const [search, setSearch] = React.useState("");
  const [currentGroup, setCurrentGroup] = React.useState<string>(params.get("groupe") ?? "all");
  const [form, setForm] = React.useState<{ open: boolean; id?: Id | null }>({ open: false });
  const [followup, setFollowup] = React.useState<Id | null>(null);
  const [detail, setDetail] = React.useState<Id | null>(null);
  const [toDelete, setToDelete] = React.useState<Id | null>(null);
  const [blocked, setBlocked] = React.useState(false);
  const [flash, setFlash] = React.useState<Id | null>(null);

  // Filtre de groupe et mise en avant transmis par l’URL (?groupe=…, ?focus=…)
  React.useEffect(() => {
    setCurrentGroup(params.get("groupe") ?? "all");
    setSearch("");
    // ?fiche=ID : ouvre directement la fiche d’un membre
    const fiche = params.get("fiche");
    if (type === "people" && fiche) setDetail(Number(fiche));
    const focus = params.get("focus");
    if (!focus) return;
    const id = Number(focus);
    setFlash(id);
    requestAnimationFrame(() => document.getElementById(`item-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    const t = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(t);
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  // ?mois=AAAA-MM : événements de ce mois (début ou fin dans le mois)
  const month = type === "events" && /^\d{4}-\d{2}$/.test(params.get("mois") ?? "") ? params.get("mois")! : null;
  const monthLabel = month
    ? new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
    : "";
  const clearMonth = () => {
    const q = new URLSearchParams(params.toString());
    q.delete("mois");
    router.replace(`${cfg.route}${q.size ? `?${q}` : ""}`);
  };

  // Ferme la fiche et retire ?fiche= de l’adresse (sinon un rechargement la rouvrirait)
  const closeDetail = () => {
    setDetail(null);
    if (!params.has("fiche")) return;
    const q = new URLSearchParams(params.toString());
    q.delete("fiche");
    router.replace(`${cfg.route}${q.size ? `?${q}` : ""}`, { scroll: false });
  };

  const items = (data[type] as AnyItem[]).filter((o) => {
    if (month) {
      const e = o as AsdEvent;
      if (!e.date.startsWith(month) && !(e.endDate ?? e.date).startsWith(month)) return false;
    }
    // Un berger ne voit que les fiches qu’il gère (ses groupes et les membres sans groupe)
    if (type === "people" && !canManagePerson(o as Person)) return false;
    const gid = type === "groups" ? o.id : (o as { groupId: Id | null }).groupId;
    // Les événements et documents communs (sans groupe) apparaissent dans tous les groupes
    const global = (type === "events" || type === "docs") && gid == null;
    if (currentGroup === "none" ? gid != null : currentGroup !== "all" && !global && String(gid) !== currentGroup) return false;
    return JSON.stringify(o).toLowerCase().includes(search.toLowerCase());
  });

  const canAdd =
    type === "prayers" || type === "testimonies"
      ? true
      : type === "groups"
        ? isAdmin
        : type === "people"
          ? isBerger
          : managedGroups.length > 0;
  // Berger sans groupe : on explique pourquoi il ne peut rien gérer
  const notice =
    user.role === "berger" && managedGroups.length === 0 && type !== "prayers" && type !== "testimonies"
      ? user.personId
        ? "Vous n’êtes berger d’aucun groupe pour le moment : demandez à un administrateur de vous désigner berger d’un groupe."
        : "Votre compte n’est relié à aucune fiche membre : demandez à un administrateur de le relier pour gérer vos groupes."
      : null;
  const filterGroups = type === "people" ? managedGroups : data.groups;

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

      {notice && <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">{notice}</div>}

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
            {filterGroups.map((g) => (
              <SelectItem key={g.id} value={String(g.id)}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {month && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 font-semibold text-primary">
            Mois : {monthLabel}
            <button type="button" onClick={clearMonth} aria-label="Retirer le filtre du mois" className="grid size-5 cursor-pointer place-items-center rounded-full hover:bg-primary/10">
              <X className="size-3.5" />
            </button>
          </span>
          <span className="text-muted-foreground">{items.length} événement(s)</span>
        </div>
      )}

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
              onOpen={() => setDetail(o.id)}
              onNavigate={(href) => router.push(href)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed bg-card p-14 text-center text-muted-foreground">Aucun résultat pour cette recherche.</div>
      )}

      {type === "people" && <MemberDetailDialog personId={detail} onOpenChange={(o) => !o && closeDetail()} onEdit={openEdit} />}
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
  onOpen,
  onNavigate,
}: {
  type: CollectionKey;
  item: AnyItem;
  kicker: string;
  flash: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onFollowup: () => void;
  onOpen: () => void;
  onNavigate: (href: string) => void;
}) {
  const { data, isBerger, isAdmin, group, person, shepherdOf, toggleLock, toggleAnswered, canEditOwn, canManageGroup } = useStore();
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
    // Le berger modifie ses groupes ; seul l’admin les supprime
    if (canManageGroup(g.id))
      actions = (
        <>
          {editBtn}
          {isAdmin && delBtn}
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
    // Un berger ne supprime ni une fiche de berger, ni un membre sans groupe
    const canDelete = isAdmin || (p.groupId != null && canManageGroup(p.groupId) && !leads.length);
    actions = (
      <>
        <Button variant="soft" size="sm" onClick={onOpen}>
          <Eye /> Voir la fiche
        </Button>
        {editBtn}
        {canDelete && delBtn}
      </>
    );
  }

  if (type === "events") {
    const e = item as AsdEvent;
    title = <>📅 {e.title}</>;
    desc = (
      <>
        {e.theme && (
          <span className="mb-1 block font-semibold text-foreground">
            Thème : {e.theme}
          </span>
        )}
        {fmtPeriod(e)}
      </>
    );
    meta = e.groupId == null ? "🌐 Tous les groupes" : group(e.groupId)?.name;
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
        {canManageGroup(e.groupId) && (
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
    const total = d.files.reduce((n, f) => n + f.size, 0);
    meta = (
      <>
        {d.files.length} fichier{d.files.length > 1 ? "s" : ""}
        {total ? ` · ${fmtSize(total)}` : ""} · {d.groupId == null ? "🌐 Tous les groupes" : group(d.groupId)?.name}
      </>
    );
    linked = <DocFiles doc={d} />;
    if (canManageGroup(d.groupId))
      actions = (
        <>
          {editBtn}
          {delBtn}
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
        {o.personId != null && person(o.personId) && (
          <span className="mt-1 flex items-center gap-1.5">
            <UserRound className="size-3.5 shrink-0" /> Membre : {person(o.personId)!.first} {person(o.personId)!.last}
          </span>
        )}
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

    if (canEditOwn(o))
      actions = (
        <>
          {editBtn}
          {delBtn}
        </>
      );
    if (canManageGroup(o.groupId))
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
      // Fiche membre : un clic sur la carte (hors boutons et liens) ouvre le détail
      onClick={type === "people" ? (e) => !(e.target as HTMLElement).closest("button,a") && onOpen() : undefined}
      className={cn(
        "gap-3 transition-shadow",
        type === "people" && "cursor-pointer hover:border-primary/40 hover:shadow-md",
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

function DocFiles({ doc }: { doc: Doc }) {
  const images = doc.files.filter((f) => isPreviewable(f.mimeType));
  const others = doc.files.filter((f) => !isPreviewable(f.mimeType));
  if (!doc.files.length) return <p className="text-xs text-muted-foreground">Aucun fichier joint.</p>;
  return (
    <div className="grid gap-2">
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((f) => (
            <div key={f.id} className="group relative aspect-square overflow-hidden rounded-lg border bg-muted">
              <a href={fileUrl(f.id, true)} target="_blank" rel="noopener" title={`${f.fileName} (${fmtSize(f.size)}) — ouvrir`} className="block size-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fileUrl(f.id, true)} alt={f.fileName} loading="lazy" className="size-full object-cover transition-transform group-hover:scale-105" />
              </a>
              <a
                href={fileUrl(f.id)}
                download={f.fileName}
                title={`Télécharger ${f.fileName}`}
                aria-label={`Télécharger ${f.fileName}`}
                className="absolute right-1 bottom-1 grid size-7 place-items-center rounded-md bg-white/90 text-primary shadow-sm hover:bg-white"
              >
                <Download className="size-3.5" />
              </a>
            </div>
          ))}
        </div>
      )}
      {others.map((f) => (
        <a
          key={f.id}
          href={fileUrl(f.id)}
          download={f.fileName}
          className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-xs hover:bg-accent/60"
        >
          <Paperclip className="size-3.5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate">{f.fileName}</span>
          <span className="shrink-0 text-muted-foreground">{fmtSize(f.size)}</span>
          <Download className="size-3.5 shrink-0 text-muted-foreground" />
        </a>
      ))}
    </div>
  );
}

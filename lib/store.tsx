"use client";

import * as React from "react";
import { toast } from "sonner";
import * as actions from "@/lib/actions/content";
import { isManager, type AppData, type CollectionKey, type Id, type Managed, type Person, type Prayer, type Result, type SessionUser, type Testimony } from "./types";

type Upsertable = Exclude<CollectionKey, "docs">;

interface Store {
  data: AppData;
  user: SessionUser;
  /** Admin ou berger (la gestion reste limitée aux groupes gérés, voir canManageGroup) */
  isBerger: boolean;
  isAdmin: boolean;
  group: (id?: Id | null) => AppData["groups"][number] | undefined;
  person: (id?: Id | null) => AppData["people"][number] | undefined;
  /** Groupes dont ce membre est le berger */
  shepherdOf: (personId: Id) => AppData["groups"];
  /** Groupes que l’utilisateur peut gérer (tous pour l’admin, ceux qu’il mène pour un berger) */
  managedGroups: AppData["groups"];
  canManageGroup: (groupId?: Id | null) => boolean;
  /** Fiches gérables : membres des groupes gérés ou sans groupe */
  canManagePerson: (p: Person) => boolean;
  /** Prière/témoignage : son auteur, le berger du groupe ou un admin */
  canEditOwn: (item: Prayer | Testimony) => boolean;
  upsert: (key: Upsertable, item: Record<string, unknown>) => Promise<Result>;
  /** Enregistre un document puis envoie ses nouveaux fichiers un par un (onProgress : n° du fichier en cours). */
  saveDoc: (input: Record<string, unknown>, files: File[], onProgress?: (done: number, total: number) => void) => Promise<Result>;
  remove: (key: CollectionKey, id: Id) => Promise<Result>;
  canDeleteGroup: (id: Id) => boolean;
  toggleLock: (id: Id) => Promise<void>;
  toggleAnswered: (key: "prayers" | "testimonies", id: Id) => Promise<void>;
  saveFollowup: (id: Id, summary: string, attendance: Record<string, boolean>) => Promise<Result>;
}

const StoreContext = React.createContext<Store | null>(null);

const SAVE: Record<Upsertable, (input: Record<string, unknown>) => Promise<Result>> = {
  groups: actions.saveGroup,
  people: actions.savePerson,
  events: actions.saveEvent,
  prayers: actions.savePrayer,
  testimonies: actions.saveTestimony,
};

/** Les appels réseau peuvent échouer (hors ligne, serveur redémarré…) : on renvoie toujours un Result. */
async function safe<T extends Result>(p: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await p();
  } catch {
    return { ok: false, error: "Connexion au serveur impossible : veuillez réessayer." };
  }
}

/**
 * Les données viennent du serveur (layout). Après chaque action, le serveur
 * revalide la page et renvoie des données à jour, qui arrivent ici par les props.
 */
export function StoreProvider({
  data,
  user,
  managed,
  children,
}: {
  data: AppData;
  user: SessionUser;
  managed: Managed;
  children: React.ReactNode;
}) {
  const value = React.useMemo<Store>(() => {
    const isBerger = isManager(user.role);
    const group = (id?: Id | null) => (id == null ? undefined : data.groups.find((g) => g.id === id));
    const person = (id?: Id | null) => (id == null ? undefined : data.people.find((p) => p.id === id));
    const shepherdOf = (personId: Id) => data.groups.filter((g) => g.shepherdId === personId);
    const canManageGroup = (gid?: Id | null) => managed === "all" || (gid != null && managed.includes(gid));
    const canDeleteGroup = (id: Id) =>
      !data.people.some((p) => p.groupId === id) &&
      !(["events", "docs", "prayers", "testimonies"] as const).some((k) => (data[k] as { groupId: Id }[]).some((x) => x.groupId === id));

    return {
      data,
      user,
      isBerger,
      isAdmin: user.role === "admin",
      group,
      person,
      shepherdOf,
      canDeleteGroup,
      managedGroups: data.groups.filter((g) => canManageGroup(g.id)),
      canManageGroup,
      canManagePerson: (p) => isBerger && (p.groupId == null || canManageGroup(p.groupId)),
      canEditOwn: (item) => (item.createdBy != null && item.createdBy === user.id) || canManageGroup(item.groupId),
      upsert: (key, item) => safe(() => SAVE[key](item)),
      saveDoc: async (input, files, onProgress) => {
        const r = await safe(() => actions.saveDocument(input));
        if (!r.ok) return r;
        const docId = "id" in r ? r.id : undefined;
        if (!docId) return { ok: false, error: "Document introuvable." };
        const failed: string[] = [];
        for (const [i, file] of files.entries()) {
          onProgress?.(i + 1, files.length);
          const fd = new FormData();
          fd.append("file", file);
          const u = await safe(() => actions.uploadDocumentFile(docId, fd));
          if (!u.ok) failed.push(u.error);
        }
        return failed.length ? { ok: false, error: `Document enregistré, mais ${failed.length} fichier(s) refusé(s) : ${failed.join(" ")}` } : { ok: true };
      },
      remove: (key, id) => safe(() => actions.deleteItem(key, id)),
      toggleLock: async (id) => {
        const r = await safe(() => actions.toggleEventLock(id));
        if (!r.ok) toast.error(r.error);
        else toast("locked" in r && r.locked ? "Événement bloqué" : "Événement débloqué");
      },
      toggleAnswered: async (key, id) => {
        const r = await safe(() => actions.toggleAnswered(key, id));
        if (!r.ok) toast.error(r.error);
      },
      saveFollowup: (id, summary, attendance) => safe(() => actions.saveEventFollowup(id, summary, attendance)),
    };
  }, [data, user, managed]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = React.useContext(StoreContext);
  if (!ctx) throw new Error("useStore doit être utilisé dans <StoreProvider>");
  return ctx;
}

/** Événements à venir (date ≥ aujourd’hui), triés par date. */
export function upcomingEvents(data: AppData, todayStr: string) {
  return [...data.events].filter((e) => (e.endDate || e.date) >= todayStr).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

"use client";

import * as React from "react";
import { toast } from "sonner";
import * as actions from "@/lib/actions/content";
import { isManager, type AppData, type CollectionKey, type Id, type Prayer, type Result, type SessionUser, type Testimony } from "./types";

type Upsertable = Exclude<CollectionKey, "docs">;

interface Store {
  data: AppData;
  user: SessionUser;
  /** Admin ou berger : gestion complète du contenu */
  isBerger: boolean;
  isAdmin: boolean;
  group: (id?: Id | null) => AppData["groups"][number] | undefined;
  person: (id?: Id | null) => AppData["people"][number] | undefined;
  /** Groupes dont ce membre est le berger */
  shepherdOf: (personId: Id) => AppData["groups"];
  /** Un membre peut modifier/supprimer ses propres prières et témoignages */
  canEditOwn: (item: Prayer | Testimony) => boolean;
  upsert: (key: Upsertable, item: Record<string, unknown>) => Promise<Result>;
  saveDoc: (form: FormData) => Promise<Result>;
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
export function StoreProvider({ data, user, children }: { data: AppData; user: SessionUser; children: React.ReactNode }) {
  const value = React.useMemo<Store>(() => {
    const isBerger = isManager(user.role);
    const group = (id?: Id | null) => (id == null ? undefined : data.groups.find((g) => g.id === id));
    const person = (id?: Id | null) => (id == null ? undefined : data.people.find((p) => p.id === id));
    const shepherdOf = (personId: Id) => data.groups.filter((g) => g.shepherdId === personId);
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
      canEditOwn: (item) => isBerger || (item.createdBy != null && item.createdBy === user.id),
      upsert: (key, item) => safe(() => SAVE[key](item)),
      saveDoc: (form) => safe(() => actions.saveDocument(form)),
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
  }, [data, user]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = React.useContext(StoreContext);
  if (!ctx) throw new Error("useStore doit être utilisé dans <StoreProvider>");
  return ctx;
}

/** Événements à venir (date ≥ aujourd’hui), triés par date. */
export function upcomingEvents(data: AppData, todayStr: string) {
  return [...data.events].filter((e) => e.date >= todayStr).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

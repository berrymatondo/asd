export type Id = number;

export type Role = "admin" | "berger" | "membre";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrateur",
  berger: "Berger",
  membre: "Membre",
};

/** Utilisateur connecté (sans données sensibles). */
export interface SessionUser {
  id: Id;
  name: string;
  email: string;
  role: Role;
}

export interface User extends SessionUser {
  active: boolean;
  createdAt: string;
}

export interface Group {
  id: Id;
  name: string;
  goal: string;
  desc: string;
  /** Le berger est une fiche membre */
  shepherdId: Id | null;
}

export interface Person {
  id: Id;
  first: string;
  last: string;
  phone: string;
  /** Un membre peut n’appartenir à aucun groupe */
  groupId: Id | null;
  notes: string;
}

export interface AsdEvent {
  id: Id;
  title: string;
  date: string;
  start: string;
  end: string;
  groupId: Id;
  locked: boolean;
  attendance: Record<string, boolean>;
  summary?: string;
}

/** Le contenu du fichier reste en base ; il se télécharge via /api/documents/[id]. */
export interface Doc {
  id: Id;
  title: string;
  desc: string;
  fileName: string;
  mimeType: string;
  size: number;
  groupId: Id;
}

export interface Prayer {
  id: Id;
  author: string;
  date: string;
  desc: string;
  answered: boolean;
  groupId: Id;
  createdBy?: Id | null;
}

export interface Testimony {
  id: Id;
  author: string;
  date: string;
  desc: string;
  answered: boolean;
  groupId: Id;
  prayerId?: Id | null;
  createdBy?: Id | null;
}

export interface AppData {
  groups: Group[];
  people: Person[];
  events: AsdEvent[];
  docs: Doc[];
  prayers: Prayer[];
  testimonies: Testimony[];
}

export type CollectionKey = keyof AppData;
export type ItemOf<K extends CollectionKey> = AppData[K][number];

export type Result = { ok: true } | { ok: false; error: string };

export const isManager = (role?: Role | null) => role === "admin" || role === "berger";

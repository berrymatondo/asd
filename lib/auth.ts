import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import type { Managed, Role, SessionUser } from "./types";

export const SESSION_COOKIE = "asd_session";
const SESSION_DAYS = 30;

/** On ne stocke en base que l’empreinte du jeton : une fuite de la table ne permet pas d’usurper une session. */
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  await db()`insert into sessions (id, user_id, expires_at) values (${hashToken(token)}, ${userId}, ${expires.toISOString()})`;
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db()`delete from sessions where id = ${hashToken(token)}`;
  jar.delete(SESSION_COOKIE);
}

/** Utilisateur de la requête courante (lu une seule fois par rendu grâce à cache). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db()`
    select u.id, u.name, u.email, u.role, u.person_id as "personId", u.group_id as "groupId"
    from sessions s join users u on u.id = s.user_id
    where s.id = ${hashToken(token)} and s.expires_at > now() and u.active`;
  return (rows[0] as SessionUser | undefined) ?? null;
});

/** Pour les pages : redirige vers la connexion si besoin, ou vers l’accueil si le rôle ne suffit pas. */
export async function requireUser(roles?: Role[]) {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  if (roles && !roles.includes(user.role)) redirect("/");
  return user;
}

export class AuthError extends Error {}

/** Pour les actions serveur : lève une erreur affichable au lieu de rediriger. */
export async function assertUser(roles?: Role[]) {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Session expirée : veuillez vous reconnecter.");
  if (roles && !roles.includes(user.role)) throw new AuthError("Action non autorisée pour votre rôle.");
  return user;
}

/**
 * Périmètre de gestion : l’admin gère tout ; un berger ne gère que les groupes
 * dont sa fiche membre est le berger ; un membre ne gère aucun groupe.
 */
export const getManaged = cache(async (user: SessionUser): Promise<Managed> => {
  if (user.role === "admin") return "all";
  if (user.role !== "berger" || !user.personId) return [];
  const rows = await db()`select id from groups where shepherd_id = ${user.personId} order by id`;
  return rows.map((r) => r.id as number);
});

export const manages = (managed: Managed, groupId: number | null | undefined) =>
  managed === "all" || (groupId != null && managed.includes(groupId));

/**
 * Groupes dont l’utilisateur voit les événements : tous (admin), sinon ceux qu’il mène
 * plus le groupe de sa fiche membre. Les événements et documents communs (sans groupe) sont visibles de tous.
 */
export const getVisibleGroups = cache(async (user: SessionUser): Promise<Managed> => {
  const managed = await getManaged(user);
  if (managed === "all") return "all";
  // Groupe de la fiche membre, sinon groupe du compte (comptes « membreX »)
  let own = user.groupId;
  if (user.personId) {
    const [p] = await db()`select group_id from people where id = ${user.personId}`;
    own = (p?.group_id as number | null | undefined) ?? own;
  }
  return own != null && !managed.includes(own) ? [...managed, own] : managed;
});

/** Événement ou document : visible si commun (sans groupe) ou rattaché à un groupe visible. */
export const canSeeGroupItem = (visible: Managed, groupId: number | null) => groupId == null || manages(visible, groupId);

import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import type { Role, SessionUser } from "./types";

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
    select u.id, u.name, u.email, u.role
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

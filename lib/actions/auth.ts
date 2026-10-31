"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { assertUser, createSession, destroySession } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Result } from "@/lib/types";
import { mutation, password } from "@/lib/validate";

// Empreinte factice : même temps de calcul que l’adresse existe ou non
const DUMMY_HASH = bcrypt.hashSync("compte-inexistant", 10);

export async function login(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const pwd = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  if (!email || !pwd) return { error: "Renseignez votre e-mail et votre mot de passe." };

  const [user] = await db()`select id, password_hash, active from users where email=${email}`;
  const valid = await bcrypt.compare(pwd, (user?.password_hash as string) ?? DUMMY_HASH);
  if (!user || !valid) return { error: "E-mail ou mot de passe incorrect." };
  if (!user.active) return { error: "Ce compte est désactivé. Contactez un administrateur." };

  await createSession(user.id as number);
  // Redirection uniquement vers un chemin interne
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  await destroySession();
  redirect("/connexion");
}

export async function changeOwnPassword(current: string, next: string): Promise<Result> {
  return mutation(async () => {
    const user = await assertUser();
    const newPwd = password(next);
    const [row] = await db()`select password_hash from users where id=${user.id}`;
    if (!row || !(await bcrypt.compare(current, row.password_hash as string))) return "Mot de passe actuel incorrect.";
    const hash = await bcrypt.hash(newPwd, 10);
    await db()`update users set password_hash=${hash} where id=${user.id}`;
  });
}

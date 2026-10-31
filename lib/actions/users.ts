"use server";

import bcrypt from "bcryptjs";
import { assertUser } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Result, Role } from "@/lib/types";
import { email, id, mutation, optionalId, password, required, ValidationError } from "@/lib/validate";

const ROLES: Role[] = ["admin", "berger", "membre"];

function role(v: unknown): Role {
  if (!ROLES.includes(v as Role)) throw new ValidationError("Rôle invalide.");
  return v as Role;
}

/** Empêche de retirer le dernier administrateur actif. */
async function otherActiveAdmins(exceptId: number) {
  const [{ n }] = await db()`select count(*)::int as n from users where role='admin' and active and id <> ${exceptId}`;
  return n as number;
}

export async function saveUser(input: Record<string, unknown>): Promise<Result> {
  return mutation(async () => {
    const me = await assertUser(["admin"]);
    const v = {
      name: required(input.name, "Nom", 120),
      email: email(input.email),
      role: role(input.role),
      active: input.active !== false,
      personId: optionalId(input.personId),
    };
    const uid = optionalId(input.id);
    if (v.personId) {
      const [p] = await db()`select (select name from users where person_id=${v.personId} and id <> ${uid ?? 0}) as owner
                             from people where id=${v.personId}`;
      if (!p) return "La fiche membre choisie n’existe plus.";
      if (p.owner) return `Cette fiche est déjà reliée au compte de ${p.owner}.`;
    }
    const newPassword = typeof input.password === "string" && input.password !== "" ? password(input.password) : null;
    const taken = await db()`select 1 from users where email=${v.email} and id <> ${uid ?? 0}`;
    if (taken.length) return "Cette adresse e-mail est déjà utilisée.";

    if (!uid) {
      if (!newPassword) return "Un mot de passe est requis pour créer un compte.";
      const hash = await bcrypt.hash(newPassword, 10);
      await db()`insert into users (name, email, password_hash, role, active, person_id)
                 values (${v.name}, ${v.email}, ${hash}, ${v.role}, ${v.active}, ${v.personId})`;
      return;
    }

    const [current] = await db()`select role, active from users where id=${uid}`;
    if (!current) return "Utilisateur introuvable.";
    if (uid === me.id && (v.role !== "admin" || !v.active)) return "Vous ne pouvez pas retirer vos propres droits d’administrateur.";
    if (current.role === "admin" && current.active && (v.role !== "admin" || !v.active) && (await otherActiveAdmins(uid)) === 0)
      return "Il doit rester au moins un administrateur actif.";

    const sql = db();
    const queries = [sql`update users set name=${v.name}, email=${v.email}, role=${v.role}, active=${v.active}, person_id=${v.personId} where id=${uid}`];
    if (newPassword) queries.push(sql`update users set password_hash=${await bcrypt.hash(newPassword, 10)} where id=${uid}`);
    // Compte désactivé ou mot de passe réinitialisé : on ferme ses sessions ouvertes
    if (!v.active || (newPassword && uid !== me.id)) queries.push(sql`delete from sessions where user_id=${uid}`);
    await sql.transaction(queries);
  });
}

export async function deleteUser(userId: number): Promise<Result> {
  return mutation(async () => {
    const me = await assertUser(["admin"]);
    const uid = id(userId);
    if (uid === me.id) return "Vous ne pouvez pas supprimer votre propre compte.";
    const [u] = await db()`select role, active from users where id=${uid}`;
    if (!u) return "Utilisateur introuvable.";
    if (u.role === "admin" && u.active && (await otherActiveAdmins(uid)) === 0) return "Il doit rester au moins un administrateur actif.";
    // Sessions supprimées en cascade ; ses prières/témoignages sont conservés (created_by → null)
    await db()`delete from users where id=${uid}`;
  });
}

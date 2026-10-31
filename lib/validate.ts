import { revalidatePath } from "next/cache";
import { AuthError } from "./auth";
import type { Result } from "./types";

export class ValidationError extends Error {}

const fail = (msg: string): never => {
  throw new ValidationError(msg);
};

/** Texte facultatif, nettoyé et borné. */
export function text(v: unknown, max = 2000) {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  if (s.length > max) fail(`Texte trop long (max. ${max} caractères).`);
  return s;
}

export function required(v: unknown, label: string, max = 2000) {
  const s = text(v, max);
  if (!s) fail(`Le champ « ${label} » est obligatoire.`);
  return s;
}

export function id(v: unknown, label = "Identifiant"): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) fail(`${label} invalide.`);
  return n;
}

export function optionalId(v: unknown): number | null {
  if (v == null || v === "" || v === "none") return null;
  return id(v);
}

export function date(v: unknown) {
  const s = text(v, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) fail("Date invalide.");
  return s;
}

export function time(v: unknown, label: string) {
  const s = text(v, 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) fail(`${label} invalide.`);
  return s;
}

export function email(v: unknown) {
  const s = required(v, "E-mail", 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) fail("Adresse e-mail invalide.");
  return s;
}

export function password(v: unknown) {
  const s = typeof v === "string" ? v : "";
  if (s.length < 8) fail("Le mot de passe doit contenir au moins 8 caractères.");
  if (s.length > 200) fail("Mot de passe trop long.");
  return s;
}

const PG_MESSAGES: Record<string, string> = {
  "23503": "Un élément lié est introuvable ou encore utilisé.",
  "23505": "Cette valeur est déjà utilisée.",
};

/** Exécute une mutation, rafraîchit les pages et convertit les erreurs en message affichable. */
export async function mutation(fn: () => Promise<void | string>): Promise<Result> {
  try {
    const err = await fn();
    if (typeof err === "string") return { ok: false, error: err };
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    if (e instanceof ValidationError || e instanceof AuthError) return { ok: false, error: e.message };
    const code = (e as { code?: string }).code;
    if (code && PG_MESSAGES[code]) return { ok: false, error: PG_MESSAGES[code] };
    console.error(e);
    return { ok: false, error: "Erreur serveur : veuillez réessayer." };
  }
}

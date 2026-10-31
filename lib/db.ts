import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let client: NeonQueryFunction<false, false> | null = null;

/** Client SQL Neon (HTTP). À n’utiliser que côté serveur. */
export function db() {
  if (typeof window !== "undefined") throw new Error("db() est réservé au serveur");
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL n’est pas défini (voir .env.example)");
    client = neon(url);
  }
  return client;
}

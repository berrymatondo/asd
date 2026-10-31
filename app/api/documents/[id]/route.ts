import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

/** Téléchargement d’un document (tout utilisateur connecté). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new Response("Non authentifié", { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response("Identifiant invalide", { status: 400 });

  const [doc] = await db()`select file_name, mime_type, encode(content, 'base64') as data from documents where id=${id}`;
  if (!doc) return new Response("Document introuvable", { status: 404 });

  const body = Buffer.from(doc.data as string, "base64");
  return new Response(body, {
    headers: {
      "Content-Type": doc.mime_type as string,
      "Content-Length": String(body.length),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.file_name as string)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}

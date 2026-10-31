import { canSeeGroupItem, getCurrentUser, getVisibleGroups } from "@/lib/auth";
import { db } from "@/lib/db";

/** Téléchargement (ou aperçu avec ?apercu=1) d’un fichier de document, pour tout utilisateur connecté. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Non authentifié", { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response("Identifiant invalide", { status: 400 });

  const [file] = await db()`select f.file_name, f.mime_type, d.group_id, encode(f.content, 'base64') as data
                             from document_files f join documents d on d.id = f.document_id where f.id=${id}`;
  // Même réponse si le fichier n’existe pas ou appartient à un groupe non visible
  if (!file || !canSeeGroupItem(await getVisibleGroups(user), file.group_id as number | null))
    return new Response("Fichier introuvable", { status: 404 });

  const mime = file.mime_type as string;
  // Aperçu en ligne uniquement pour les images matricielles (pas de SVG, qui peut contenir du script)
  const inline = new URL(req.url).searchParams.has("apercu") && /^image\/(png|jpe?g|gif|webp|avif|bmp)$/.test(mime);
  const body = Buffer.from(file.data as string, "base64");
  return new Response(body, {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(body.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.file_name as string)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      "Cache-Control": "private, max-age=300",
    },
  });
}

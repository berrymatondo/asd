import { getCurrentUser } from "@/lib/auth";
import { buildReport, ReportError, type ReportRequest } from "@/lib/reports/build";
import { buildExcel } from "@/lib/reports/excel";
import { buildPdf } from "@/lib/reports/pdf";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function parse(q: URLSearchParams): ReportRequest | string {
  const groupe = q.get("groupe");
  const groupId = groupe && groupe !== "all" ? Number(groupe) : null;
  if (groupId != null && !(Number.isInteger(groupId) && groupId > 0)) return "Groupe invalide.";
  switch (q.get("type")) {
    case "evenement": {
      const id = Number(q.get("id"));
      return Number.isInteger(id) && id > 0 ? { kind: "evenement", eventId: id } : "Événement invalide.";
    }
    case "periode": {
      const from = q.get("du") ?? "";
      const to = q.get("au") ?? "";
      if (!DATE.test(from) || !DATE.test(to)) return "Période invalide.";
      return { kind: "periode", from, to, groupId };
    }
    case "mensuel": {
      const month = q.get("mois") ?? "";
      return MONTH.test(month) ? { kind: "mensuel", month, groupId } : "Mois invalide.";
    }
    default:
      return "Type de rapport inconnu.";
  }
}

/** Rapports PDF / Excel : réservés à l’administrateur. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Non authentifié", { status: 401 });
  if (user.role !== "admin") return new Response("Réservé à l’administrateur", { status: 403 });

  const q = new URL(req.url).searchParams;
  const format = q.get("format") === "xlsx" ? "xlsx" : "pdf";
  const parsed = parse(q);
  if (typeof parsed === "string") return new Response(parsed, { status: 400 });

  try {
    const model = await buildReport(parsed, user.name);
    const body = format === "xlsx" ? await buildExcel(model) : await buildPdf(model);
    const slug =
      parsed.kind === "evenement" ? `evenement-${parsed.eventId}` : parsed.kind === "mensuel" ? `mensuel-${parsed.month}` : `periode-${parsed.from}-au-${parsed.to}`;
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf",
        "Content-Disposition": `attachment; filename="rapport-asd-${slug}.${format}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof ReportError) return new Response(e.message, { status: 400 });
    console.error(e);
    return new Response("Erreur lors de la génération du rapport.", { status: 500 });
  }
}

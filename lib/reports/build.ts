import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";

/** Ce qu’un rapport contient, quel que soit son format (PDF ou Excel). */
export interface ReportModel {
  kind: "evenement" | "periode" | "mensuel";
  title: string;
  subtitle: string;
  scope: string;
  generatedAt: string;
  generatedBy: string;
  kpis: { label: string; value: string; hint?: string }[];
  byGroup: GroupRow[];
  byMonth: MonthRow[];
  events: EventRow[];
  members: MemberRow[];
  prayers: { date: string; author: string; group: string; groupId: number; desc: string; answered: boolean }[];
  testimonies: { date: string; author: string; group: string; groupId: number; desc: string; linked: boolean }[];
}

export interface GroupRow {
  group: string;
  shepherd: string;
  members: number;
  events: number;
  present: number;
  expected: number;
  rate: number | null;
  prayers: number;
  answered: number;
  testimonies: number;
}
export interface MonthRow {
  key: string;
  label: string;
  events: number;
  rate: number | null;
  prayers: number;
  answered: number;
  testimonies: number;
}
export interface EventRow {
  id: number;
  title: string;
  date: string;
  time: string;
  group: string;
  groupId: number | null;
  locked: boolean;
  present: number;
  expected: number;
  rate: number | null;
  summary: string;
  attendees: { personId: number; name: string; group: string; present: boolean }[];
}
export interface MemberRow {
  id: number;
  name: string;
  group: string;
  expected: number;
  present: number;
  rate: number | null;
}

export type ReportRequest =
  | { kind: "evenement"; eventId: number }
  | { kind: "periode"; from: string; to: string; groupId: number | null }
  | { kind: "mensuel"; month: string; groupId: number | null };

export class ReportError extends Error {}

const COMMON = "Tous les groupes";
const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const ratio = (a: number, b: number) => (b ? a / b : null);
export const fmtRate = (r: number | null) => (r == null ? "—" : `${Math.round(r * 100)} %`);

/** Synthèse HTML de l’éditeur → texte brut lisible (paragraphes et puces conservés). */
export function htmlToText(html: string) {
  return html
    .replace(/<\s*(script|style)[\s\S]*?<\/\s*\1\s*>/gi, "")
    .replace(/<\s*li[^>]*>/gi, "\n• ")
    .replace(/<\s*(br|\/p|\/div|\/h[1-6]|\/li|\/ul|\/ol)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "’")
    .split("\n")
    .map((l) => l.trim())
    .filter((l, i, all) => l !== "" || (i > 0 && all[i - 1] !== "")) // au plus une ligne vide d’affilée
    .join("\n")
    .trim();
}

function monthsBetween(from: string, to: string) {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export async function buildReport(req: ReportRequest, generatedBy: string): Promise<ReportModel> {
  const sql = db();
  const [groups, people] = await Promise.all([
    sql`select g.id, g.name, coalesce(trim(p.first_name || ' ' || p.last_name), '') as shepherd
        from groups g left join people p on p.id = g.shepherd_id order by g.name`,
    sql`select id, trim(first_name || ' ' || last_name) as name, group_id as "groupId" from people order by first_name, last_name`,
  ]);
  const groupName = new Map(groups.map((g) => [g.id as number, g.name as string]));
  const nameOf = (gid: number | null) => (gid == null ? "Sans groupe" : (groupName.get(gid) ?? "—"));

  // --- Bornes et filtre ---
  let from: string, to: string, groupId: number | null, eventsRows;
  if (req.kind === "evenement") {
    eventsRows = await sql`select id, title, date::text as date, start_time, end_time, group_id, locked, attendance, summary from events where id=${req.eventId}`;
    if (!eventsRows.length) throw new ReportError("Événement introuvable.");
    from = to = eventsRows[0].date as string;
    groupId = null;
  } else {
    if (req.kind === "mensuel") {
      const [y, m] = req.month.split("-").map(Number);
      from = `${req.month}-01`;
      to = `${req.month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
    } else {
      from = req.from;
      to = req.to;
    }
    if (from > to) throw new ReportError("La date de début doit précéder la date de fin.");
    groupId = req.groupId;
    if (groupId != null && !groupName.has(groupId)) throw new ReportError("Groupe introuvable.");
    // Avec un filtre de groupe, on garde aussi les événements communs
    eventsRows = await sql`
      select id, title, date::text as date, start_time, end_time, group_id, locked, attendance, summary from events
      where date between ${from} and ${to} and (${groupId}::int is null or group_id = ${groupId} or group_id is null)
      order by date, start_time`;
  }
  const inScope = (gid: number | null) => groupId == null || gid === groupId;

  const [prayersRows, testimoniesRows] =
    req.kind === "evenement"
      ? [[], []]
      : await Promise.all([
          sql`select date::text as date, author, description, answered, group_id from prayers
              where date between ${from} and ${to} and (${groupId}::int is null or group_id = ${groupId}) order by date`,
          sql`select date::text as date, author, description, group_id, prayer_id from testimonies
              where date between ${from} and ${to} and (${groupId}::int is null or group_id = ${groupId}) order by date`,
        ]);

  // --- Événements et présences ---
  const memberStats = new Map<number, { expected: number; present: number }>();
  const events: EventRow[] = eventsRows.map((e) => {
    const gid = e.group_id as number | null;
    // Attendus : membres du groupe (ou tous pour un événement commun), restreints au filtre éventuel
    const expected = people.filter((p) => (gid == null || p.groupId === gid) && inScope(p.groupId as number | null));
    const att = (e.attendance ?? {}) as Record<string, boolean>;
    const attendees = expected.map((p) => ({ personId: p.id as number, name: p.name as string, group: nameOf(p.groupId as number | null), present: att[String(p.id)] === true }));
    expected.forEach((p) => {
      const s = memberStats.get(p.id as number) ?? { expected: 0, present: 0 };
      s.expected++;
      if (att[String(p.id)] === true) s.present++;
      memberStats.set(p.id as number, s);
    });
    const present = attendees.filter((a) => a.present).length;
    return {
      id: e.id as number,
      title: e.title as string,
      date: e.date as string,
      time: `${e.start_time} – ${e.end_time}`,
      group: gid == null ? COMMON : nameOf(gid),
      groupId: gid,
      locked: e.locked as boolean,
      present,
      expected: attendees.length,
      rate: ratio(present, attendees.length),
      summary: htmlToText((e.summary as string) ?? ""),
      attendees,
    };
  });

  const members: MemberRow[] = people
    .filter((p) => memberStats.has(p.id as number))
    .map((p) => {
      const s = memberStats.get(p.id as number)!;
      return { id: p.id as number, name: p.name as string, group: nameOf(p.groupId as number | null), expected: s.expected, present: s.present, rate: ratio(s.present, s.expected) };
    })
    .sort((a, b) => a.group.localeCompare(b.group, "fr") || (b.rate ?? -1) - (a.rate ?? -1) || a.name.localeCompare(b.name, "fr"));

  const prayers = prayersRows.map((p) => ({
    date: p.date as string,
    author: (p.author as string) || "Anonyme",
    group: nameOf(p.group_id as number),
    groupId: p.group_id as number,
    desc: p.description as string,
    answered: p.answered as boolean,
  }));
  const testimonies = testimoniesRows.map((t) => ({
    date: t.date as string,
    author: t.author as string,
    group: nameOf(t.group_id as number),
    groupId: t.group_id as number,
    desc: t.description as string,
    linked: t.prayer_id != null,
  }));

  // --- Regroupement par groupe ---
  const byGroup: GroupRow[] = groups
    .filter((g) => inScope(g.id as number))
    .map((g) => {
      const gid = g.id as number;
      const evs = events.filter((e) => e.groupId === gid);
      const present = evs.reduce((n, e) => n + e.present, 0);
      const expected = evs.reduce((n, e) => n + e.expected, 0);
      const prs = prayers.filter((p) => p.groupId === gid);
      return {
        group: g.name as string,
        shepherd: (g.shepherd as string) || "Non désigné",
        members: people.filter((p) => p.groupId === g.id).length,
        events: evs.length,
        present,
        expected,
        rate: ratio(present, expected),
        prayers: prs.length,
        answered: prs.filter((p) => p.answered).length,
        testimonies: testimonies.filter((t) => t.groupId === gid).length,
      };
    });
  const commons = events.filter((e) => e.groupId == null);
  if (commons.length) {
    const present = commons.reduce((n, e) => n + e.present, 0);
    const expected = commons.reduce((n, e) => n + e.expected, 0);
    byGroup.push({ group: "Événements communs", shepherd: "—", members: 0, events: commons.length, present, expected, rate: ratio(present, expected), prayers: 0, answered: 0, testimonies: 0 });
  }

  // --- Regroupement par mois ---
  const byMonth: MonthRow[] =
    req.kind === "evenement"
      ? []
      : monthsBetween(from, to).map((key) => {
          const evs = events.filter((e) => e.date.startsWith(key));
          const prs = prayers.filter((p) => p.date.startsWith(key));
          return {
            key,
            label: monthLabel(key),
            events: evs.length,
            rate: ratio(
              evs.reduce((n, e) => n + e.present, 0),
              evs.reduce((n, e) => n + e.expected, 0)
            ),
            prayers: prs.length,
            answered: prs.filter((p) => p.answered).length,
            testimonies: testimonies.filter((t) => t.date.startsWith(key)).length,
          };
        });

  const totalPresent = events.reduce((n, e) => n + e.present, 0);
  const totalExpected = events.reduce((n, e) => n + e.expected, 0);
  const scope = groupId == null ? "Tous les groupes" : `Groupe : ${nameOf(groupId)} (+ événements communs)`;
  const generatedAt = new Date().toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Brussels" });

  if (req.kind === "evenement") {
    const e = events[0];
    return {
      kind: "evenement",
      title: e.title,
      subtitle: `${fmtDate(e.date)} · ${e.time} · ${e.group}`,
      scope: e.group,
      generatedAt,
      generatedBy,
      kpis: [
        { label: "Présents", value: String(e.present) },
        { label: "Absents", value: String(e.expected - e.present) },
        { label: "Membres attendus", value: String(e.expected) },
        { label: "Taux de présence", value: fmtRate(e.rate) },
        { label: "Statut", value: e.locked ? "Verrouillé" : "Modifiable" },
      ],
      byGroup: [],
      byMonth: [],
      events,
      members: e.attendees.map((a) => ({ id: a.personId, name: a.name, group: a.group, expected: 1, present: a.present ? 1 : 0, rate: a.present ? 1 : 0 })),
      prayers: [],
      testimonies: [],
    };
  }

  const answered = prayers.filter((p) => p.answered).length;
  return {
    kind: req.kind,
    title: req.kind === "mensuel" ? `Rapport mensuel — ${monthLabel(req.month)}` : "Rapport d’activité",
    subtitle: req.kind === "mensuel" ? `Du ${fmtDate(from)} au ${fmtDate(to)}` : `Période du ${fmtDate(from)} au ${fmtDate(to)}`,
    scope,
    generatedAt,
    generatedBy,
    kpis: [
      { label: "Événements", value: String(events.length), hint: commons.length ? `dont ${commons.length} commun(s)` : undefined },
      { label: "Présence moyenne", value: fmtRate(ratio(totalPresent, totalExpected)), hint: `${totalPresent} présences / ${totalExpected} attendues` },
      { label: "Membres concernés", value: String(members.length) },
      { label: "Prières", value: String(prayers.length), hint: `${answered} exaucée(s)` },
      { label: "Témoignages", value: String(testimonies.length), hint: `${testimonies.filter((t) => t.linked).length} lié(s) à une prière` },
    ],
    byGroup,
    byMonth,
    events,
    members,
    prayers,
    testimonies,
  };
}

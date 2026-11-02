import { canSeeGroupItem, getManaged, getVisibleGroups, manages } from "./auth";
import { db } from "./db";
import { type AppData, type Managed, type AsdEvent, type Doc, type Group, type Person, type Prayer, type SessionUser, type Testimony, type User } from "./types";

const groupsQ = () => db()`select id, name, goal, description as "desc", shepherd_id as "shepherdId" from groups order by id`;
const peopleQ = () =>
  db()`select id, first_name as "first", last_name as "last", phone, group_id as "groupId", notes from people order by first_name, last_name`;
const eventsQ = () =>
  db()`select id, title, theme, date::text as date, start_time as start, end_date::text as "endDate", end_time as "end",
              group_id as "groupId", locked, attendance, summary
       from events order by date, start_time`;

/** Charge toutes les données visibles par l’utilisateur, et les groupes qu’il gère. */
export async function getAppData(user: SessionUser): Promise<{ data: AppData; managed: Managed }> {
  const [managed, visible, groups, people, events, docs, prayers, testimonies] = await Promise.all([
    getManaged(user),
    getVisibleGroups(user),
    groupsQ(),
    peopleQ(),
    eventsQ(),
    db()`select d.id, d.title, d.description as "desc", d.group_id as "groupId",
           coalesce((select json_agg(json_build_object('id', f.id, 'fileName', f.file_name, 'mimeType', f.mime_type, 'size', f.size)
                                     order by f.position, f.id)
                     from document_files f where f.document_id = d.id), '[]'::json) as files
         from documents d order by d.id`,
    db()`select id, author, date::text as date, description as "desc", answered, group_id as "groupId", person_id as "personId", created_by as "createdBy" from prayers order by date, id`,
    db()`select id, author, date::text as date, description as "desc", answered, group_id as "groupId", prayer_id as "prayerId", person_id as "personId", created_by as "createdBy"
         from testimonies order by date, id`,
  ]);

  // Fiche complète : admin, ou berger pour les membres de ses groupes et ceux sans groupe
  const fullAccess = (p: Person) => user.role !== "membre" && (p.groupId == null || manages(managed, p.groupId));
  // Un membre ne reçoit que les éléments de son groupe (ex. membre3@asd.be → groupe 3)
  const isMember = user.role === "membre";
  const inMyGroup = (gid: number | null) => !isMember || (gid != null && manages(visible, gid));

  return {
    managed,
    data: {
      groups: (groups as Group[]).filter((g) => inMyGroup(g.id)),
      people: (people as Person[]).filter((p) => inMyGroup(p.groupId)).map((p) => (fullAccess(p) ? p : redact(p))),
      // Événements d’un groupe : visibles par l’admin, le berger du groupe et ses membres
      events: (events as AsdEvent[]).filter((e) => canSeeGroupItem(visible, e.groupId)),
      // Documents d’un groupe : visibles par l’admin, le berger du groupe et ses membres ; ceux de l’admin « tous les groupes » par tous
      docs: (docs as Doc[]).filter((d) => canSeeGroupItem(visible, d.groupId)),
      prayers: (prayers as Prayer[]).filter((p) => inMyGroup(p.groupId)),
      testimonies: (testimonies as Testimony[]).filter((t) => inMyGroup(t.groupId)),
    },
  };
}

/**
 * Les fiches sont privées : hors de son périmètre, on ne reçoit que le nom et le groupe
 * (utiles aux statistiques et aux rapports), jamais le téléphone ni les notes.
 * Le téléphone est remplacé par un marqueur pour conserver la statistique « avec téléphone ».
 */
function redact(p: Person): Person {
  return { ...p, phone: p.phone ? "•" : "", notes: "" };
}

/** Données nécessaires au rapport imprimable d’un événement. */
export async function getEventReport(id: number) {
  const rows = await db()`
    select e.id, e.title, e.theme, e.date::text as date, e.start_time as start, e.end_date::text as "endDate", e.end_time as "end", e.group_id as "groupId",
           e.locked, e.attendance, e.summary, coalesce(g.name, 'Tous les groupes') as "groupName"
    from events e left join groups g on g.id = e.group_id where e.id = ${id}`;
  const event = rows[0] as (AsdEvent & { groupName: string }) | undefined;
  if (!event) return null;
  const members = (await db()`
    select id, first_name as "first", last_name as "last" from people
    where ${event.groupId}::int is null or group_id = ${event.groupId} order by first_name, last_name`) as Pick<
    Person,
    "id" | "first" | "last"
  >[];
  return { event, members };
}

export async function getUsers(): Promise<User[]> {
  const rows = await db()`select id, name, email, role, active, person_id as "personId", group_id as "groupId", created_at::text as "createdAt" from users order by name`;
  return rows as User[];
}

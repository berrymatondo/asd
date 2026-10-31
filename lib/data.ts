import { db } from "./db";
import { isManager, type AppData, type AsdEvent, type Doc, type Group, type Person, type Prayer, type SessionUser, type Testimony, type User } from "./types";

const groupsQ = () => db()`select id, name, goal, description as "desc", shepherd_id as "shepherdId" from groups order by id`;
const peopleQ = () =>
  db()`select id, first_name as "first", last_name as "last", phone, group_id as "groupId", notes from people order by first_name, last_name`;
const eventsQ = () =>
  db()`select id, title, date::text as date, start_time as start, end_time as "end", group_id as "groupId", locked, attendance, summary
       from events order by date, start_time`;

/** Charge toutes les données visibles par l’utilisateur. */
export async function getAppData(user: SessionUser): Promise<AppData> {
  const [groups, people, events, docs, prayers, testimonies] = await Promise.all([
    groupsQ(),
    peopleQ(),
    eventsQ(),
    db()`select id, title, description as "desc", file_name as "fileName", mime_type as "mimeType", size, group_id as "groupId" from documents order by id`,
    db()`select id, author, date::text as date, description as "desc", answered, group_id as "groupId", created_by as "createdBy" from prayers order by date, id`,
    db()`select id, author, date::text as date, description as "desc", answered, group_id as "groupId", prayer_id as "prayerId", created_by as "createdBy"
         from testimonies order by date, id`,
  ]);

  return {
    groups: groups as Group[],
    people: isManager(user.role) ? (people as Person[]) : redactPeople(people as Person[]),
    events: events as AsdEvent[],
    docs: docs as Doc[],
    prayers: prayers as Prayer[],
    testimonies: testimonies as Testimony[],
  };
}

/**
 * Les fiches membres sont privées : un simple membre ne reçoit que le nom et le groupe
 * (utiles aux statistiques et aux rapports), jamais le téléphone ni les notes.
 * Le téléphone est remplacé par un marqueur pour conserver la statistique « avec téléphone ».
 */
function redactPeople(people: Person[]): Person[] {
  return people.map((p) => ({ ...p, phone: p.phone ? "•" : "", notes: "" }));
}

/** Données nécessaires au rapport imprimable d’un événement. */
export async function getEventReport(id: number) {
  const rows = await db()`
    select e.id, e.title, e.date::text as date, e.start_time as start, e.end_time as "end", e.group_id as "groupId",
           e.locked, e.attendance, e.summary, g.name as "groupName"
    from events e join groups g on g.id = e.group_id where e.id = ${id}`;
  const event = rows[0] as (AsdEvent & { groupName: string }) | undefined;
  if (!event) return null;
  const members = (await db()`
    select id, first_name as "first", last_name as "last" from people where group_id = ${event.groupId} order by first_name, last_name`) as Pick<
    Person,
    "id" | "first" | "last"
  >[];
  return { event, members };
}

export async function getUsers(): Promise<User[]> {
  const rows = await db()`select id, name, email, role, active, created_at::text as "createdAt" from users order by name`;
  return rows as User[];
}

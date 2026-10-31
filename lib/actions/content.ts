"use server";

import { assertUser, getManaged, manages } from "@/lib/auth";
import { db } from "@/lib/db";
import type { CollectionKey, Managed, Result, SessionUser } from "@/lib/types";
import { date, id, mutation, optionalId, required, text, time, ValidationError } from "@/lib/validate";

type Input = Record<string, unknown>;
const MANAGERS = ["admin", "berger"] as const;
const MAX_FILE = 4 * 1024 * 1024;
const MAX_FILES = 10;
const OUT_OF_SCOPE = "Vous ne gérez pas ce groupe : seul son berger ou un administrateur le peut.";

/** Utilisateur admin/berger et ses groupes gérés. */
async function manager() {
  const user = await assertUser([...MANAGERS]);
  return { user, managed: await getManaged(user) };
}

function assertManages(managed: Managed, groupId: number | null | undefined) {
  if (!manages(managed, groupId)) throw new ValidationError(OUT_OF_SCOPE);
}

/** Fiches modifiables par un berger : membres de ses groupes ou sans groupe. */
const managesPerson = (managed: Managed, groupId: number | null) => groupId == null || manages(managed, groupId);

// ---------- Groupes ----------
export async function saveGroup(input: Input): Promise<Result> {
  return mutation(async () => {
    const { user, managed } = await manager();
    const v = {
      name: required(input.name, "Nom", 120),
      goal: required(input.goal, "Objectif", 300),
      desc: text(input.desc),
      shepherdId: optionalId(input.shepherdId),
    };
    const gid = optionalId(input.id);
    const isAdmin = user.role === "admin";

    if (!isAdmin) {
      // Seul l’admin crée un groupe et choisit son berger ; le berger modifie les groupes qu’il mène
      if (!gid) return "Seul un administrateur peut créer un groupe.";
      assertManages(managed, gid);
      await db()`update groups set name=${v.name}, goal=${v.goal}, description=${v.desc} where id=${gid}`;
      return;
    }

    if (v.shepherdId && !(await db()`select 1 from people where id=${v.shepherdId}`).length) return "Le berger choisi n’existe plus.";
    if (gid) {
      const r = await db()`update groups set name=${v.name}, goal=${v.goal}, description=${v.desc}, shepherd_id=${v.shepherdId} where id=${gid} returning id`;
      if (!r.length) return "Groupe introuvable.";
    } else {
      await db()`insert into groups (name, goal, description, shepherd_id) values (${v.name}, ${v.goal}, ${v.desc}, ${v.shepherdId})`;
    }
  });
}

// ---------- Membres (fiches privées) ----------
export async function savePerson(input: Input): Promise<Result> {
  return mutation(async () => {
    const { managed } = await manager();
    const v = {
      first: required(input.first, "Prénom", 80),
      last: text(input.last, 80),
      phone: text(input.phone, 40),
      groupId: optionalId(input.groupId),
      notes: text(input.notes, 5000),
    };
    if (!managesPerson(managed, v.groupId)) throw new ValidationError(OUT_OF_SCOPE);
    const pid = optionalId(input.id);
    if (pid) {
      const [p] = await db()`select group_id from people where id=${pid}`;
      if (!p) return "Membre introuvable.";
      if (!managesPerson(managed, p.group_id)) return "Ce membre appartient à un groupe que vous ne gérez pas.";
      await db()`update people set first_name=${v.first}, last_name=${v.last}, phone=${v.phone}, group_id=${v.groupId}, notes=${v.notes} where id=${pid}`;
    } else {
      await db()`insert into people (first_name, last_name, phone, group_id, notes) values (${v.first}, ${v.last}, ${v.phone}, ${v.groupId}, ${v.notes})`;
    }
  });
}

// ---------- Événements ----------
export async function saveEvent(input: Input): Promise<Result> {
  return mutation(async () => {
    const { managed } = await manager();
    const v = {
      title: required(input.title, "Titre", 200),
      theme: text(input.theme, 300),
      // Sans groupe = événement commun à tous les groupes (admin uniquement)
      groupId: optionalId(input.groupId),
      date: date(input.date),
      start: time(input.start, "Heure de début"),
      endDate: date(input.endDate ?? input.date),
      end: time(input.end, "Heure de fin"),
    };
    if (v.groupId == null && managed !== "all") return "Seul un administrateur peut créer un événement pour tous les groupes.";
    assertManages(managed, v.groupId);
    // La fin peut tomber le lendemain (veillée) mais doit suivre le début
    if (`${v.endDate} ${v.end}` <= `${v.date} ${v.start}`) return "La fin doit être après le début (date et heure).";
    const eid = optionalId(input.id);
    if (eid) {
      const [ev] = await db()`select locked, group_id from events where id=${eid}`;
      if (!ev) return "Événement introuvable.";
      assertManages(managed, ev.group_id);
      if (ev.locked) return "Cet événement est verrouillé.";
      await db()`update events set title=${v.title}, theme=${v.theme}, group_id=${v.groupId}, date=${v.date}, start_time=${v.start},
                   end_date=${v.endDate}, end_time=${v.end} where id=${eid}`;
    } else {
      await db()`insert into events (title, theme, date, start_time, end_date, end_time, group_id)
                 values (${v.title}, ${v.theme}, ${v.date}, ${v.start}, ${v.endDate}, ${v.end}, ${v.groupId})`;
    }
  });
}

/** Charge un événement et vérifie que l’utilisateur gère son groupe. */
async function managedEvent(eventId: number) {
  const { managed } = await manager();
  const eid = id(eventId);
  const [ev] = await db()`select locked, group_id from events where id=${eid}`;
  if (!ev) throw new ValidationError("Événement introuvable.");
  assertManages(managed, ev.group_id);
  return { eid, locked: ev.locked as boolean, groupId: ev.group_id as number | null };
}

export async function toggleEventLock(eventId: number): Promise<Result & { locked?: boolean }> {
  let locked: boolean | undefined;
  const r = await mutation(async () => {
    const { eid } = await managedEvent(eventId);
    const rows = await db()`update events set locked = not locked where id=${eid} returning locked`;
    locked = rows[0]?.locked as boolean;
  });
  return r.ok ? { ...r, locked } : r;
}

export async function saveEventFollowup(eventId: number, summary: string, attendance: Record<string, boolean>): Promise<Result> {
  return mutation(async () => {
    const ev = await managedEvent(eventId);
    if (ev.locked) return "Cet événement est verrouillé.";
    // Ne garder que les présences des membres du groupe de l’événement
    // Événement commun : tous les membres sont concernés
    const members = await db()`select id from people where ${ev.groupId}::int is null or group_id=${ev.groupId}`;
    const clean: Record<string, boolean> = {};
    for (const m of members) clean[String(m.id)] = attendance?.[String(m.id)] === true;
    // Défense en profondeur : le HTML est aussi nettoyé à l’affichage
    const html = text(summary, 200_000).replace(/<\s*(script|style|iframe|object|embed)[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
    await db()`update events set summary=${html}, attendance=${JSON.stringify(clean)}::jsonb where id=${ev.eid}`;
  });
}

// ---------- Documents ----------
/**
 * Enregistre les informations d’un document et retire les fichiers demandés.
 * Les nouveaux fichiers sont envoyés ensuite un par un (uploadDocumentFile),
 * ce qui évite les limites de taille d’une requête unique.
 */
export async function saveDocument(input: Input): Promise<Result & { id?: number }> {
  let docId: number | undefined;
  const r = await mutation(async () => {
    const { managed } = await manager();
    const v = {
      title: required(input.title, "Titre", 200),
      desc: text(input.desc),
      // Sans groupe = document partagé avec tous les groupes (admin uniquement)
      groupId: optionalId(input.groupId),
    };
    if (v.groupId == null && managed !== "all") return "Seul un administrateur peut partager un document avec tous les groupes.";
    assertManages(managed, v.groupId);
    const removeIds = Array.isArray(input.removeFileIds) ? input.removeFileIds.map((x) => id(x)) : [];
    const did = optionalId(input.id);
    if (did) {
      const [d] = await db()`select group_id from documents where id=${did}`;
      if (!d) return "Document introuvable.";
      assertManages(managed, d.group_id);
      const sql = db();
      await sql.transaction([
        sql`update documents set title=${v.title}, description=${v.desc}, group_id=${v.groupId} where id=${did}`,
        sql`delete from document_files where document_id=${did} and id = any(${removeIds}::int[])`,
      ]);
      docId = did;
    } else {
      const [row] = await db()`insert into documents (title, description, group_id) values (${v.title}, ${v.desc}, ${v.groupId}) returning id`;
      docId = row.id as number;
    }
  });
  return r.ok ? { ...r, id: docId } : r;
}

export async function uploadDocumentFile(documentId: number, form: FormData): Promise<Result> {
  return mutation(async () => {
    const { managed } = await manager();
    const did = id(documentId);
    const [d] = await db()`select group_id, (select count(*)::int from document_files where document_id=${did}) as n from documents where id=${did}`;
    if (!d) return "Document introuvable.";
    assertManages(managed, d.group_id);
    if (d.n >= MAX_FILES) return `Un document peut contenir au plus ${MAX_FILES} fichiers.`;

    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return "Fichier vide.";
    if (file.size > MAX_FILE) return `« ${file.name} » dépasse 4 Mo.`;
    const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const name = text(file.name, 255) || "fichier";
    const mime = text(file.type, 120) || "application/octet-stream";
    await db()`insert into document_files (document_id, file_name, mime_type, size, content, position)
               values (${did}, ${name}, ${mime}, ${file.size}, decode(${b64}, 'base64'),
                       (select coalesce(max(position), 0) + 1 from document_files where document_id=${did}))`;
  });
}

// ---------- Prières & témoignages ----------
/**
 * Modifier/supprimer une prière ou un témoignage : son auteur, le berger de son groupe, ou un admin.
 * Le berger qui modifie la publication d’un autre ne peut la déplacer que vers un de ses groupes.
 */
async function assertCanEdit(table: "prayers" | "testimonies", itemId: number, user: SessionUser, newGroupId?: number) {
  const rows =
    table === "prayers"
      ? await db()`select created_by, group_id from prayers where id=${itemId}`
      : await db()`select created_by, group_id from testimonies where id=${itemId}`;
  if (!rows.length) throw new ValidationError("Élément introuvable.");
  if (rows[0].created_by === user.id) return;
  const managed = await getManaged(user);
  if (!manages(managed, rows[0].group_id) || (newGroupId != null && !manages(managed, newGroupId)))
    throw new ValidationError("Vous ne pouvez modifier que vos publications ou celles des groupes que vous gérez.");
}

export async function savePrayer(input: Input): Promise<Result> {
  return mutation(async () => {
    const user = await assertUser();
    const v = {
      author: text(input.author, 120),
      groupId: id(input.groupId, "Groupe"),
      date: date(input.date),
      desc: required(input.desc, "Description", 5000),
    };
    const pid = optionalId(input.id);
    if (pid) {
      await assertCanEdit("prayers", pid, user, v.groupId);
      await db()`update prayers set author=${v.author}, group_id=${v.groupId}, date=${v.date}, description=${v.desc} where id=${pid}`;
      // Les témoignages liés doivent rester dans le même groupe
      await db()`update testimonies set prayer_id=null where prayer_id=${pid} and group_id <> ${v.groupId}`;
    } else {
      await db()`insert into prayers (author, group_id, date, description, created_by) values (${v.author}, ${v.groupId}, ${v.date}, ${v.desc}, ${user.id})`;
    }
  });
}

export async function saveTestimony(input: Input): Promise<Result> {
  return mutation(async () => {
    const user = await assertUser();
    const v = {
      author: required(input.author, "Auteur", 120),
      groupId: id(input.groupId, "Groupe"),
      date: date(input.date),
      desc: required(input.desc, "Description", 5000),
      prayerId: optionalId(input.prayerId),
    };
    if (v.prayerId) {
      const [p] = await db()`select answered, group_id from prayers where id=${v.prayerId}`;
      if (!p?.answered || p.group_id !== v.groupId) return "Choisissez une prière exaucée du même groupe.";
    }
    const tid = optionalId(input.id);
    if (tid) {
      await assertCanEdit("testimonies", tid, user, v.groupId);
      await db()`update testimonies set author=${v.author}, group_id=${v.groupId}, date=${v.date}, description=${v.desc}, prayer_id=${v.prayerId} where id=${tid}`;
    } else {
      await db()`insert into testimonies (author, group_id, date, description, prayer_id, created_by)
                 values (${v.author}, ${v.groupId}, ${v.date}, ${v.desc}, ${v.prayerId}, ${user.id})`;
    }
  });
}

export async function toggleAnswered(kind: "prayers" | "testimonies", itemId: number): Promise<Result> {
  return mutation(async () => {
    const { managed } = await manager();
    const iid = id(itemId);
    const [row] = kind === "prayers" ? await db()`select group_id from prayers where id=${iid}` : await db()`select group_id from testimonies where id=${iid}`;
    if (!row) return "Élément introuvable.";
    assertManages(managed, row.group_id);
    if (kind === "prayers") {
      const [p] = await db()`update prayers set answered = not answered where id=${iid} returning answered`;
      // Une prière repassée « non exaucée » ne peut plus être liée à un témoignage
      if (!p.answered) await db()`update testimonies set prayer_id=null where prayer_id=${iid}`;
    } else {
      await db()`update testimonies set answered = not answered where id=${iid}`;
    }
  });
}

// ---------- Suppression ----------
export async function deleteItem(kind: CollectionKey, itemId: number): Promise<Result> {
  return mutation(async () => {
    const user = await assertUser();
    const iid = id(itemId);
    const sql = db();

    if (kind === "prayers" || kind === "testimonies") {
      await assertCanEdit(kind, iid, user);
      // ON DELETE SET NULL délie automatiquement les témoignages d’une prière supprimée
      if (kind === "prayers") await sql`delete from prayers where id=${iid}`;
      else await sql`delete from testimonies where id=${iid}`;
      return;
    }

    if (user.role === "membre") return "Action réservée au berger.";
    const managed = await getManaged(user);

    switch (kind) {
      case "groups": {
        if (managed !== "all") return "Seul un administrateur peut supprimer un groupe.";
        const [{ n }] = await sql`
          select (select count(*) from people where group_id=${iid}) + (select count(*) from events where group_id=${iid})
               + (select count(*) from documents where group_id=${iid}) + (select count(*) from prayers where group_id=${iid})
               + (select count(*) from testimonies where group_id=${iid}) as n`;
        if (Number(n) > 0) return "Ce groupe contient encore des éléments. Réaffectez ou supprimez-les avant de supprimer le groupe.";
        await sql`delete from groups where id=${iid}`;
        return;
      }
      case "people": {
        const [p] = await sql`select group_id, (select count(*)::int from groups where shepherd_id=${iid}) as leads from people where id=${iid}`;
        if (!p) return "Membre introuvable.";
        if (managed !== "all") {
          // Un berger ne supprime ni un membre d’un autre groupe, ni une fiche de berger (la sienne comprise)
          if (p.group_id == null || !manages(managed, p.group_id)) return "Vous ne pouvez supprimer que les membres de vos groupes.";
          if (p.leads > 0) return "Cette fiche est celle d’un berger : seul un administrateur peut la supprimer.";
        }
        await sql.transaction([
          sql`update events set attendance = attendance - ${String(iid)} where attendance ? ${String(iid)}`,
          sql`delete from people where id=${iid}`,
        ]);
        return;
      }
      case "events": {
        const ev = await managedEvent(iid);
        if (ev.locked) return "Débloquez cet événement avant de le supprimer.";
        await sql`delete from events where id=${iid}`;
        return;
      }
      case "docs": {
        const [d] = await sql`select group_id from documents where id=${iid}`;
        if (!d) return "Document introuvable.";
        assertManages(managed, d.group_id);
        await sql`delete from documents where id=${iid}`;
        return;
      }
    }
  });
}

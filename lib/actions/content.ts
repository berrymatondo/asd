"use server";

import { assertUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isManager, type CollectionKey, type Result, type SessionUser } from "@/lib/types";
import { date, id, mutation, optionalId, required, text, time, ValidationError } from "@/lib/validate";

type Input = Record<string, unknown>;
const MANAGERS = ["admin", "berger"] as const;
const MAX_FILE = 3 * 1024 * 1024;

// ---------- Groupes ----------
export async function saveGroup(input: Input): Promise<Result> {
  return mutation(async () => {
    await assertUser([...MANAGERS]);
    const v = {
      name: required(input.name, "Nom", 120),
      goal: required(input.goal, "Objectif", 300),
      desc: text(input.desc),
      shepherdId: optionalId(input.shepherdId),
    };
    if (v.shepherdId && !(await db()`select 1 from people where id=${v.shepherdId}`).length) return "Le berger choisi n’existe plus.";
    const gid = optionalId(input.id);
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
    await assertUser([...MANAGERS]);
    const v = {
      first: required(input.first, "Prénom", 80),
      last: text(input.last, 80),
      phone: text(input.phone, 40),
      groupId: optionalId(input.groupId),
      notes: text(input.notes, 5000),
    };
    const pid = optionalId(input.id);
    if (pid) {
      const r = await db()`update people set first_name=${v.first}, last_name=${v.last}, phone=${v.phone}, group_id=${v.groupId}, notes=${v.notes}
                          where id=${pid} returning id`;
      if (!r.length) return "Membre introuvable.";
    } else {
      await db()`insert into people (first_name, last_name, phone, group_id, notes) values (${v.first}, ${v.last}, ${v.phone}, ${v.groupId}, ${v.notes})`;
    }
  });
}

// ---------- Événements ----------
export async function saveEvent(input: Input): Promise<Result> {
  return mutation(async () => {
    await assertUser([...MANAGERS]);
    const v = {
      title: required(input.title, "Titre", 200),
      groupId: id(input.groupId, "Groupe"),
      date: date(input.date),
      start: time(input.start, "Heure de début"),
      end: time(input.end, "Heure de fin"),
    };
    if (v.end <= v.start) return "L’heure de fin doit être après le début.";
    const eid = optionalId(input.id);
    if (eid) {
      const [ev] = await db()`select locked from events where id=${eid}`;
      if (!ev) return "Événement introuvable.";
      if (ev.locked) return "Cet événement est verrouillé.";
      await db()`update events set title=${v.title}, group_id=${v.groupId}, date=${v.date}, start_time=${v.start}, end_time=${v.end} where id=${eid}`;
    } else {
      await db()`insert into events (title, date, start_time, end_time, group_id) values (${v.title}, ${v.date}, ${v.start}, ${v.end}, ${v.groupId})`;
    }
  });
}

export async function toggleEventLock(eventId: number): Promise<Result & { locked?: boolean }> {
  let locked: boolean | undefined;
  const r = await mutation(async () => {
    await assertUser([...MANAGERS]);
    const rows = await db()`update events set locked = not locked where id=${id(eventId)} returning locked`;
    if (!rows.length) return "Événement introuvable.";
    locked = rows[0].locked as boolean;
  });
  return r.ok ? { ...r, locked } : r;
}

export async function saveEventFollowup(eventId: number, summary: string, attendance: Record<string, boolean>): Promise<Result> {
  return mutation(async () => {
    await assertUser([...MANAGERS]);
    const eid = id(eventId);
    const [ev] = await db()`select locked, group_id from events where id=${eid}`;
    if (!ev) return "Événement introuvable.";
    if (ev.locked) return "Cet événement est verrouillé.";
    // Ne garder que les présences des membres du groupe de l’événement
    const members = await db()`select id from people where group_id=${ev.group_id}`;
    const clean: Record<string, boolean> = {};
    for (const m of members) clean[String(m.id)] = attendance?.[String(m.id)] === true;
    // Défense en profondeur : le HTML est aussi nettoyé à l’affichage
    const html = text(summary, 200_000).replace(/<\s*(script|style|iframe|object|embed)[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
    await db()`update events set summary=${html}, attendance=${JSON.stringify(clean)}::jsonb where id=${eid}`;
  });
}

// ---------- Documents ----------
export async function saveDocument(form: FormData): Promise<Result> {
  return mutation(async () => {
    await assertUser([...MANAGERS]);
    const v = {
      title: required(form.get("title"), "Titre", 200),
      desc: text(form.get("desc")),
      groupId: id(form.get("groupId"), "Groupe"),
    };
    const did = optionalId(form.get("id"));
    const file = form.get("upload");
    const hasFile = file instanceof File && file.size > 0;
    if (hasFile && file.size > MAX_FILE) return "Fichier trop volumineux (max. 3 Mo).";
    if (!did && !hasFile) return "Veuillez joindre un fichier.";

    if (hasFile) {
      const hex = Buffer.from(await file.arrayBuffer()).toString("hex");
      const name = text(file.name, 255) || "document";
      const mime = text(file.type, 120) || "application/octet-stream";
      if (did) {
        const r = await db()`update documents set title=${v.title}, description=${v.desc}, group_id=${v.groupId},
                              file_name=${name}, mime_type=${mime}, size=${file.size}, content=decode(${hex}, 'hex')
                            where id=${did} returning id`;
        if (!r.length) return "Document introuvable.";
      } else {
        await db()`insert into documents (title, description, group_id, file_name, mime_type, size, content)
                   values (${v.title}, ${v.desc}, ${v.groupId}, ${name}, ${mime}, ${file.size}, decode(${hex}, 'hex'))`;
      }
    } else {
      const r = await db()`update documents set title=${v.title}, description=${v.desc}, group_id=${v.groupId} where id=${did} returning id`;
      if (!r.length) return "Document introuvable.";
    }
  });
}

// ---------- Prières & témoignages ----------
/** Un membre ne peut modifier/supprimer que ce qu’il a lui-même publié. */
async function assertCanEditOwn(table: "prayers" | "testimonies", itemId: number, user: SessionUser) {
  const rows =
    table === "prayers"
      ? await db()`select created_by from prayers where id=${itemId}`
      : await db()`select created_by from testimonies where id=${itemId}`;
  if (!rows.length) throw new ValidationError("Élément introuvable.");
  if (!isManager(user.role) && rows[0].created_by !== user.id) throw new ValidationError("Vous ne pouvez modifier que vos propres publications.");
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
      await assertCanEditOwn("prayers", pid, user);
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
      await assertCanEditOwn("testimonies", tid, user);
      await db()`update testimonies set author=${v.author}, group_id=${v.groupId}, date=${v.date}, description=${v.desc}, prayer_id=${v.prayerId} where id=${tid}`;
    } else {
      await db()`insert into testimonies (author, group_id, date, description, prayer_id, created_by)
                 values (${v.author}, ${v.groupId}, ${v.date}, ${v.desc}, ${v.prayerId}, ${user.id})`;
    }
  });
}

export async function toggleAnswered(kind: "prayers" | "testimonies", itemId: number): Promise<Result> {
  return mutation(async () => {
    await assertUser([...MANAGERS]);
    const iid = id(itemId);
    if (kind === "prayers") {
      const [p] = await db()`update prayers set answered = not answered where id=${iid} returning answered`;
      if (!p) return "Élément introuvable.";
      // Une prière repassée « non exaucée » ne peut plus être liée à un témoignage
      if (!p.answered) await db()`update testimonies set prayer_id=null where prayer_id=${iid}`;
    } else {
      const r = await db()`update testimonies set answered = not answered where id=${iid} returning id`;
      if (!r.length) return "Élément introuvable.";
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
      await assertCanEditOwn(kind, iid, user);
      // ON DELETE SET NULL délie automatiquement les témoignages d’une prière supprimée
      if (kind === "prayers") await sql`delete from prayers where id=${iid}`;
      else await sql`delete from testimonies where id=${iid}`;
      return;
    }

    if (!isManager(user.role)) return "Action réservée au berger.";

    switch (kind) {
      case "groups": {
        const [{ n }] = await sql`
          select (select count(*) from people where group_id=${iid}) + (select count(*) from events where group_id=${iid})
               + (select count(*) from documents where group_id=${iid}) + (select count(*) from prayers where group_id=${iid})
               + (select count(*) from testimonies where group_id=${iid}) as n`;
        if (Number(n) > 0) return "Ce groupe contient encore des éléments. Réaffectez ou supprimez-les avant de supprimer le groupe.";
        await sql`delete from groups where id=${iid}`;
        return;
      }
      case "people":
        await sql.transaction([
          sql`update events set attendance = attendance - ${String(iid)} where attendance ? ${String(iid)}`,
          sql`delete from people where id=${iid}`,
        ]);
        return;
      case "events": {
        const [ev] = await sql`select locked from events where id=${iid}`;
        if (ev?.locked) return "Débloquez cet événement avant de le supprimer.";
        await sql`delete from events where id=${iid}`;
        return;
      }
      case "docs":
        await sql`delete from documents where id=${iid}`;
        return;
    }
  });
}

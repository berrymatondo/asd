// Crée les tables et, si la base est vide, les comptes et données de démonstration.
// Usage : npm run db:setup
import { randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL manquant (voir .env.example).");
  process.exit(1);
}
const sql = neon(url);

const schema = [
  `create table if not exists users (
    id serial primary key,
    name text not null,
    email text not null unique,
    password_hash text not null,
    role text not null check (role in ('admin','berger','membre')),
    active boolean not null default true,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists sessions (
    id text primary key,
    user_id integer not null references users(id) on delete cascade,
    expires_at timestamptz not null
  )`,
  `create index if not exists sessions_user_idx on sessions(user_id)`,
  `create table if not exists groups (
    id serial primary key,
    name text not null,
    goal text not null default '',
    description text not null default ''
  )`,
  `create table if not exists people (
    id serial primary key,
    first_name text not null,
    last_name text not null default '',
    phone text not null default '',
    group_id integer references groups(id) on delete restrict,
    notes text not null default ''
  )`,
  // Un membre peut n’appartenir à aucun groupe ; le berger d’un groupe est une fiche membre
  `alter table people alter column group_id drop not null`,
  `alter table groups add column if not exists shepherd_id integer references people(id) on delete set null`,
  // Un compte peut être relié à une fiche membre (une seule fiche par compte)
  `alter table users add column if not exists person_id integer unique references people(id) on delete set null`,
  // Compte rattaché à un groupe sans fiche membre (comptes partagés « membreX », supprimés avec leur groupe)
  `alter table users add column if not exists group_id integer references groups(id) on delete cascade`,
  `create table if not exists events (
    id serial primary key,
    title text not null,
    date date not null,
    start_time text not null,
    end_time text not null,
    group_id integer references groups(id) on delete restrict,
    locked boolean not null default false,
    attendance jsonb not null default '{}'::jsonb,
    summary text not null default ''
  )`,
  `create table if not exists documents (
    id serial primary key,
    title text not null,
    description text not null default '',
    group_id integer not null references groups(id) on delete restrict
  )`,
  // Événement sans groupe = visible dans tous les groupes (créé par un admin)
  `alter table events alter column group_id drop not null`,
  // Document sans groupe = partagé avec tous les groupes (créé par un admin)
  `alter table documents alter column group_id drop not null`,
  // Thème facultatif et date de fin (événements sur plusieurs jours, veillées de nuit)
  `alter table events add column if not exists theme text not null default ''`,
  `alter table events add column if not exists end_date date`,
  // Anciennes données : fin le jour même, ou le lendemain si l’heure de fin précède l’heure de début
  `update events set end_date = case when end_time <= start_time then date + 1 else date end where end_date is null`,
  `alter table events alter column end_date set not null`,
  // Prière / témoignage rattaché(e) à un membre (fiche), facultatif
  `alter table prayers add column if not exists person_id integer references people(id) on delete set null`,
  `alter table testimonies add column if not exists person_id integer references people(id) on delete set null`,
  // Un document peut regrouper plusieurs fichiers ou images
  `create table if not exists document_files (
    id serial primary key,
    document_id integer not null references documents(id) on delete cascade,
    file_name text not null,
    mime_type text not null default 'application/octet-stream',
    size integer not null default 0,
    content bytea not null,
    position integer not null default 0
  )`,
  `create index if not exists document_files_doc_idx on document_files(document_id)`,
  `create table if not exists prayers (
    id serial primary key,
    author text not null default '',
    date date not null,
    description text not null,
    answered boolean not null default false,
    group_id integer not null references groups(id) on delete restrict,
    created_by integer references users(id) on delete set null
  )`,
  `create table if not exists testimonies (
    id serial primary key,
    author text not null,
    date date not null,
    description text not null,
    answered boolean not null default false,
    group_id integer not null references groups(id) on delete restrict,
    prayer_id integer references prayers(id) on delete set null,
    created_by integer references users(id) on delete set null
  )`,
];

for (const q of schema) await sql.query(q);

// Migration : ancien berger saisi en texte libre → fiche membre (créée si besoin, rattachée à son groupe)
const [{ legacy }] = await sql`select exists (select 1 from information_schema.columns where table_name='groups' and column_name='shepherd') as legacy`;
if (legacy) {
  const groups = await sql`select id, shepherd from groups where shepherd_id is null and trim(shepherd) <> ''`;
  for (const g of groups) {
    const name = g.shepherd.trim();
    let [person] = await sql`select id from people where lower(trim(first_name || ' ' || last_name)) = lower(${name}) limit 1`;
    if (!person) {
      const [first, ...rest] = name.split(/\s+/);
      [person] = await sql`insert into people (first_name, last_name, group_id) values (${first}, ${rest.join(" ")}, ${g.id}) returning id`;
    }
    await sql`update groups set shepherd_id=${person.id} where id=${g.id}`;
  }
  await sql`alter table groups drop column shepherd`;
  console.log(`✓ Migration : ${groups.length} berger(s) convertis en fiches membres`);
}
// Migration : un fichier unique par document → table document_files
const [{ legacyDocs }] = await sql`select exists (select 1 from information_schema.columns where table_name='documents' and column_name='content') as "legacyDocs"`;
if (legacyDocs) {
  await sql.transaction([
    sql`insert into document_files (document_id, file_name, mime_type, size, content)
        select id, file_name, mime_type, size, content from documents`,
    sql`alter table documents drop column content, drop column file_name, drop column mime_type, drop column size`,
  ]);
  console.log("✓ Migration : fichiers des documents déplacés dans document_files");
}
// Rattachement automatique : l’auteur correspond à un seul membre du même groupe (nom complet ou prénom)
for (const table of ["prayers", "testimonies"]) {
  const r = await sql.query(`
    update ${table} t set person_id = m.id
    from people m
    where t.person_id is null and trim(t.author) <> '' and m.group_id = t.group_id
      and (lower(trim(m.first_name || ' ' || m.last_name)) = lower(trim(t.author)) or lower(m.first_name) = lower(trim(t.author)))
      and (select count(*) from people x where x.group_id = t.group_id
           and (lower(trim(x.first_name || ' ' || x.last_name)) = lower(trim(t.author)) or lower(x.first_name) = lower(trim(t.author)))) = 1
    returning t.id`);
  if (r.length) console.log(`✓ ${r.length} ${table === "prayers" ? "prière(s)" : "témoignage(s)"} rattaché(s) à un membre`);
}
console.log("✓ Tables prêtes");

// --- Comptes ---
const [{ n: userCount }] = await sql`select count(*)::int as n from users`;
if (userCount === 0) {
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@asd.local").toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || randomBytes(9).toString("base64url");
  const demoPassword = randomBytes(9).toString("base64url");
  const accounts = [
    ["Administrateur", adminEmail, adminPassword, "admin"],
    ["Pasteur Samuel", "berger@asd.local", demoPassword, "berger"],
    ["Marie Kouamé", "membre@asd.local", demoPassword, "membre"],
  ];
  for (const [name, email, pwd, role] of accounts) {
    const hash = await bcrypt.hash(pwd, 10);
    await sql`insert into users (name, email, password_hash, role) values (${name}, ${email}, ${hash}, ${role})`;
  }
  console.log("\n✓ Comptes créés (notez ces mots de passe, ils ne seront plus affichés) :");
  for (const [, email, pwd, role] of accounts) console.log(`  ${role.padEnd(7)} ${email.padEnd(22)} ${pwd}`);
} else {
  console.log(`✓ ${userCount} compte(s) existant(s), aucun compte créé`);
}

// --- Données de démonstration (uniquement si aucune donnée) ---
const [{ n: groupCount }] = await sql`select count(*)::int as n from groups`;
if (groupCount === 0) {
  const g = await sql`insert into groups (name, goal, description) values
    ('Les Oliviers', 'Grandir dans la foi et la fraternité', 'Un espace de partage, de prière et d’accompagnement.'),
    ('Source de Vie', 'Accompagner les nouveaux disciples', 'Un groupe pour apprendre et cheminer ensemble.'),
    ('Espérance', 'Servir et encourager notre communauté', 'Des rencontres pour grandir et agir.')
    returning id`;
  const [g1, g2, g3] = g.map((r) => r.id);
  const p = await sql`insert into people (first_name, last_name, phone, group_id, notes) values
    ('Marie', 'Kouamé', '0470 12 34 56', ${g1}, 'Suivi mensuel — disponible le samedi.'),
    ('Jean', 'Dupont', '0471 23 45 67', ${g1}, 'Souhaite participer aux études bibliques.'),
    ('Esther', 'N.', '', ${g2}, 'Premier entretien effectué.'),
    ('Paul', 'M.', '', ${g3}, '')
    returning id`;
  const [p1, p2, p3, p4] = p.map((r) => r.id);
  // Les bergers sont d’abord des membres
  const s = await sql`insert into people (first_name, last_name, group_id, notes) values
    ('Pasteur', 'Samuel', ${g1}, 'Berger des Oliviers.'),
    ('Sarah', 'Martin', ${g2}, 'Bergère de Source de Vie.'),
    ('David', 'K.', ${g3}, 'Berger d’Espérance.'),
    ('Ruth', 'B.', null, 'Nouvelle venue, pas encore de groupe.')
    returning id`;
  for (const [i, gid] of [g1, g2, g3].entries()) await sql`update groups set shepherd_id=${s[i].id} where id=${gid}`;
  await sql`insert into events (title, date, start_time, end_time, group_id, locked, attendance) values
    ('Rencontre de prière', '2026-11-07', '18:30', '20:00', ${g1}, false, ${JSON.stringify({ [p1]: true, [p2]: false })}),
    ('Étude biblique', '2026-11-14', '17:00', '18:30', ${g2}, true, ${JSON.stringify({ [p3]: true })}),
    ('Temps de partage', '2026-11-21', '15:00', '16:30', ${g3}, false, ${JSON.stringify({ [p4]: true })})`;
  const hex = (s) => Buffer.from(s, "utf8").toString("hex");
  const d = await sql`insert into documents (title, description, group_id) values
    ('Guide du disciple', 'Les premiers pas dans le parcours ASD.', ${g1}),
    ('Plan de prière', 'Propositions pour les temps de prière.', ${g2})
    returning id`;
  const files = [
    [d[0].id, "guide-disciple.txt", "Bienvenue dans votre parcours de disciple !"],
    [d[1].id, "plan-priere.txt", "Prière, gratitude, intercession, partage."],
  ];
  for (const [docId, name, txt] of files)
    await sql`insert into document_files (document_id, file_name, mime_type, size, content)
              values (${docId}, ${name}, 'text/plain', ${Buffer.byteLength(txt)}, decode(${hex(txt)}, 'hex'))`;
  await sql`insert into prayers (author, date, description, answered, group_id) values
    ('Marie', '2026-10-28', 'Prions pour les familles de notre communauté.', false, ${g1}),
    ('', '2026-10-25', 'Merci de prier pour une recherche d’emploi.', true, ${g1}),
    ('Esther', '2026-10-26', 'Prière pour la paix et la sagesse.', false, ${g2})`;
  await sql`insert into testimonies (author, date, description, answered, group_id) values
    ('Jean', '2026-10-23', 'Une belle réconciliation dans ma famille.', true, ${g1}),
    ('Esther', '2026-10-29', 'J’ai reçu beaucoup d’encouragement cette semaine.', false, ${g2})`;
  console.log("✓ Données de démonstration insérées");
} else {
  console.log("✓ Données existantes conservées");
}

// Comptes de démonstration reliés à leur fiche (uniquement s’ils ne le sont pas déjà)
for (const [email, fullName] of [["berger@asd.local", "Pasteur Samuel"], ["membre@asd.local", "Marie Kouamé"]]) {
  await sql`update users set person_id = (
              select p.id from people p where trim(p.first_name || ' ' || p.last_name) = ${fullName}
              and not exists (select 1 from users u where u.person_id = p.id) limit 1)
            where email = ${email} and person_id is null`;
}

// Comptes membres de groupe : « membreX@asd.be » / « passwordX », X = numéro du groupe
// (le nombre en fin de nom, ex. « Groupe 3 » → 3 ; à défaut, son identifiant)
const groupNumber = (g) => g.name.match(/(\d+)\s*$/)?.[1] ?? String(g.id);
const memberAccount = (g) => ({ email: `membre${groupNumber(g)}@asd.be`, password: `password${groupNumber(g)}` });
const created = [];
// Anciens comptes de groupe (autre format d’identifiant) : renommés, mot de passe réinitialisé
for (const g of await sql`select g.id, g.name, u.id as uid, u.email from groups g join users u on u.group_id = g.id`) {
  const { email, password } = memberAccount(g);
  if (g.email === email || (await sql`select 1 from users where email=${email}`).length) continue;
  await sql.transaction([
    sql`update users set email=${email}, password_hash=${await bcrypt.hash(password, 10)} where id=${g.uid}`,
    sql`delete from sessions where user_id=${g.uid}`,
  ]);
  console.log(`✓ Compte ${g.email} renommé en ${email} (mot de passe ${password})`);
}
for (const g of await sql`select id, name from groups g where not exists (select 1 from users u where u.group_id = g.id) order by id`) {
  const { email, password } = memberAccount(g);
  const r = await sql`insert into users (name, email, password_hash, role, group_id)
                      values (${`Membres — ${g.name}`}, ${email}, ${await bcrypt.hash(password, 10)}, 'membre', ${g.id})
                      on conflict (email) do nothing returning email`;
  if (r.length) created.push(`${email} / ${password}`);
}
if (created.length) console.log(`✓ Comptes membres de groupe créés : ${created.join(", ")}`);

await sql`delete from sessions where expires_at < now()`;

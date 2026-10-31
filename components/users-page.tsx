"use client";

import * as React from "react";
import { toast } from "sonner";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { deleteUser, saveUser } from "@/lib/actions/users";
import { useStore } from "@/lib/store";
import { ROLE_LABELS, type Id, type Role, type User } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";

const ROLE_HELP: Record<Role, string> = {
  admin: "Gère les comptes et tout le contenu.",
  berger: "Gère uniquement les groupes dont sa fiche membre est le berger (membres, événements, documents, prières, témoignages).",
  membre: "Consulte, télécharge, publie et modifie ses propres prières et témoignages.",
};

export function UsersPage({ users }: { users: User[] }) {
  const { user: me, person, shepherdOf } = useStore();
  const [search, setSearch] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState<string>("all");
  const [form, setForm] = React.useState<{ open: boolean; user?: User | null }>({ open: false });
  const [toDelete, setToDelete] = React.useState<User | null>(null);

  const list = users.filter(
    (u) => (roleFilter === "all" || u.role === roleFilter) && `${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase())
  );

  const doDelete = async () => {
    if (!toDelete) return;
    const r = await deleteUser(toDelete.id).catch(() => ({ ok: false as const, error: "Connexion au serveur impossible." }));
    setToDelete(null);
    if (!r.ok) return toast.error(r.error);
    toast("Utilisateur supprimé");
  };

  return (
    <>
      <div className="mb-7 flex items-start justify-between gap-5 sm:items-center">
        <div>
          <div className="text-xs font-extrabold tracking-[1.3px] text-primary uppercase">Administration</div>
          <h1 className="my-2 text-2xl font-bold tracking-tight md:text-[30px]">Utilisateurs</h1>
          <p className="text-sm text-muted-foreground">Créez les comptes et attribuez les rôles.</p>
        </div>
        <Button onClick={() => setForm({ open: true, user: null })}>
          <Plus /> <span className="hidden sm:inline">Nouvel utilisateur</span>
          <span className="sm:hidden">Ajouter</span>
        </Button>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="bg-card pl-9" placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full bg-card sm:w-52.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les rôles</SelectItem>
            {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {list.length ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((u) => (
            <Card key={u.id} className="gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-muted-foreground uppercase">{ROLE_LABELS[u.role]}</span>
                <Badge variant={u.active ? "success" : "pending"}>{u.active ? "Actif" : "Désactivé"}</Badge>
              </div>
              <h3 className="text-[17px] font-bold">
                {u.name} {u.id === me.id && <span className="text-xs font-semibold text-muted-foreground">(vous)</span>}
              </h3>
              <p className="text-[13px] break-all text-muted-foreground">{u.email}</p>
              <LinkedPerson personId={u.personId} role={u.role} person={person} shepherdOf={shepherdOf} />
              <p className="text-xs text-[#59677e]">Créé le {new Date(u.createdAt).toLocaleDateString("fr-FR")}</p>
              <div className="mt-auto flex flex-wrap gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setForm({ open: true, user: u })}>
                  <Pencil /> Modifier
                </Button>
                {u.id !== me.id && (
                  <Button variant="destructive" size="sm" onClick={() => setToDelete(u)}>
                    <Trash2 /> Supprimer
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed bg-card p-14 text-center text-muted-foreground">Aucun utilisateur trouvé.</div>
      )}

      <Dialog open={form.open} onOpenChange={(open) => setForm((f) => ({ ...f, open }))}>
        <DialogContent>
          {form.open && (
            <UserForm
              key={form.user?.id ?? "new"}
              user={form.user}
              selfId={me.id}
              takenPersonIds={users.filter((u) => u.id !== form.user?.id && u.personId != null).map((u) => u.personId!)}
              onDone={() => setForm({ open: false })}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={toDelete != null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Supprimer ${toDelete?.name ?? "cet utilisateur"} ?`}
        description="Le compte sera supprimé définitivement. Ses prières et témoignages sont conservés."
        confirmLabel="Supprimer"
        destructive
        onConfirm={doDelete}
      />
    </>
  );
}

function LinkedPerson({
  personId,
  role,
  person,
  shepherdOf,
}: {
  personId: Id | null;
  role: Role;
  person: ReturnType<typeof useStore>["person"];
  shepherdOf: ReturnType<typeof useStore>["shepherdOf"];
}) {
  const p = person(personId);
  if (!p) {
    return (
      <p className={role === "berger" ? "text-xs font-semibold text-amber-700" : "text-xs text-[#59677e]"}>
        {role === "berger" ? "⚠ Aucune fiche membre reliée : ce berger ne gère aucun groupe." : "Aucune fiche membre reliée"}
      </p>
    );
  }
  const leads = shepherdOf(p.id);
  return (
    <p className="text-xs text-[#59677e]">
      ♙ Fiche : {p.first} {p.last}
      {role === "berger" && (leads.length ? ` · Berger de ${leads.map((g) => g.name).join(", ")}` : " · Berger d’aucun groupe")}
    </p>
  );
}

function UserForm({ user, selfId, takenPersonIds, onDone }: { user?: User | null; selfId: Id; takenPersonIds: Id[]; onDone: () => void }) {
  const { data, group } = useStore();
  const [role, setRole] = React.useState<Role>(user?.role ?? "membre");
  const [personId, setPersonId] = React.useState<string>(user?.personId != null ? String(user.personId) : "none");
  const people = data.people.filter((p) => !takenPersonIds.includes(p.id));
  const [active, setActive] = React.useState(user?.active ?? true);
  const [saving, setSaving] = React.useState(false);
  const isSelf = user?.id === selfId;

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    const r = await saveUser({
      id: user?.id,
      name: f.get("name"),
      email: f.get("email"),
      password: f.get("password"),
      role,
      active,
      personId: personId !== "none" ? Number(personId) : null,
    }).catch(() => ({ ok: false as const, error: "Connexion au serveur impossible." }));
    setSaving(false);
    if (!r.ok) return toast.error(r.error);
    onDone();
    toast.success(user ? "Utilisateur mis à jour" : "Utilisateur créé");
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{user ? "Modifier l’utilisateur" : "Nouvel utilisateur"}</DialogTitle>
        <DialogDescription>{user ? "Laissez le mot de passe vide pour le conserver." : "Communiquez le mot de passe à la personne."}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor="u_name">Nom *</Label>
        <Input id="u_name" name="name" defaultValue={user?.name} required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="u_email">E-mail *</Label>
        <Input id="u_email" name="email" type="email" defaultValue={user?.email} required autoComplete="off" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="u_password">{user ? "Nouveau mot de passe" : "Mot de passe *"}</Label>
        <Input id="u_password" name="password" type="password" minLength={8} required={!user} autoComplete="new-password" />
        <p className="text-xs text-muted-foreground">8 caractères minimum.</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="u_role">Rôle *</Label>
        <Select value={role} onValueChange={(v) => setRole(v as Role)} disabled={isSelf}>
          <SelectTrigger id="u_role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{isSelf ? "Vous ne pouvez pas modifier votre propre rôle." : ROLE_HELP[role]}</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="u_person">Fiche membre reliée</Label>
        <Select value={personId} onValueChange={setPersonId}>
          <SelectTrigger id="u_person">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Aucune fiche</SelectItem>
            {people.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.first} {p.last} — {group(p.groupId)?.name ?? "Sans groupe"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Un berger gère les groupes dont cette fiche est le berger (à définir dans « Groupes »).
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={active} disabled={isSelf} onCheckedChange={(v) => setActive(v === true)} />
        Compte actif
      </label>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </DialogFooter>
    </form>
  );
}

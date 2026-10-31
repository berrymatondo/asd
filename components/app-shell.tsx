"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { KeyRound, LogOut, Sprout } from "lucide-react";
import { NAV } from "@/lib/nav";
import { useStore } from "@/lib/store";
import { changeOwnPassword, logout } from "@/lib/actions/auth";
import { ROLE_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isBerger, isAdmin } = useStore();
  const [pwdOpen, setPwdOpen] = React.useState(false);

  const items = NAV.filter((n) => (!n.bergerOnly || isBerger) && (!n.adminOnly || isAdmin));
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const current = NAV.find((n) => isActive(n.href));

  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b bg-card p-3 md:sticky md:top-0 md:flex md:h-screen md:w-63 md:shrink-0 md:flex-col md:border-r md:border-b-0 md:px-4.5 md:py-7.5">
        <div className="flex items-center gap-3 px-1.5 pb-3 md:px-3 md:pb-8">
          <div className="grid size-10.5 place-items-center rounded-[13px] bg-primary text-2xl text-primary-foreground">✦</div>
          <div>
            <b className="text-xl">ASD</b>
            <small className="mt-0.5 block text-[11px] text-muted-foreground">Faiseur de disciples</small>
          </div>
        </div>
        <div className="mx-3 my-3 hidden text-[10px] font-extrabold tracking-[2px] text-[#a3adbe] md:block">ESPACE DE SUIVI</div>
        <nav className="flex gap-1 overflow-x-auto md:block">
          {items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "my-0.5 flex items-center gap-2 rounded-xl px-2.5 py-2.5 text-xs font-semibold whitespace-nowrap text-[#68758d] transition-colors hover:bg-accent/60 md:w-full md:gap-3 md:px-3.5 md:py-3.5 md:text-sm",
                isActive(href) && "bg-accent text-primary"
              )}
            >
              <Icon className="size-4 md:size-4.5" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto hidden rounded-2xl border border-[#e7e8ff] bg-[#f5f6ff] p-3.5 md:block">
          <b className="flex items-center gap-1.5 text-[13px]">
            <Sprout className="size-4 text-success" /> Grandir ensemble
          </b>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Accompagner chaque personne, cultiver la prière et célébrer les progrès.
          </p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex h-16 items-center justify-between gap-3 border-b bg-card px-4.5 md:h-21 md:px-10.5">
          <span className="truncate text-[13px] text-muted-foreground">
            Plateforme ASD <span className="text-[#c0c7d3]"> / </span>
            <b className="text-foreground">{current?.label ?? "Vue d'ensemble"}</b>
          </span>
          <div className="flex items-center gap-2">
            <div className="hidden text-right leading-tight sm:block">
              <b className="block text-[13px]">{user.name}</b>
              <small className="text-[11px] text-muted-foreground">{ROLE_LABELS[user.role]}</small>
            </div>
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#e5dfff] text-sm font-extrabold text-primary" title={user.email}>
              {initials(user.name)}
            </span>
            <Button variant="ghost" size="icon" title="Changer mon mot de passe" aria-label="Changer mon mot de passe" onClick={() => setPwdOpen(true)}>
              <KeyRound />
            </Button>
            <form action={logout}>
              <Button variant="ghost" size="icon" type="submit" title="Se déconnecter" aria-label="Se déconnecter">
                <LogOut />
              </Button>
            </form>
          </div>
        </header>
        <main className="mx-auto max-w-[1390px] px-4 py-6 md:px-10.5 md:pt-9 md:pb-16">{children}</main>
      </div>

      <Dialog open={pwdOpen} onOpenChange={setPwdOpen}>
        <DialogContent>{pwdOpen && <PasswordForm onDone={() => setPwdOpen(false)} />}</DialogContent>
      </Dialog>
    </div>
  );
}

function PasswordForm({ onDone }: { onDone: () => void }) {
  const [saving, setSaving] = React.useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const next = String(f.get("next"));
    if (next !== f.get("confirm")) return toast.error("Les deux mots de passe ne correspondent pas.");
    setSaving(true);
    const r = await changeOwnPassword(String(f.get("current")), next).catch(() => ({ ok: false as const, error: "Connexion au serveur impossible." }));
    setSaving(false);
    if (!r.ok) return toast.error(r.error);
    onDone();
    toast.success("Mot de passe modifié");
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Changer mon mot de passe</DialogTitle>
        <DialogDescription>8 caractères minimum.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor="p_current">Mot de passe actuel</Label>
        <Input id="p_current" name="current" type="password" autoComplete="current-password" required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="p_next">Nouveau mot de passe</Label>
        <Input id="p_next" name="next" type="password" minLength={8} autoComplete="new-password" required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="p_confirm">Confirmer</Label>
        <Input id="p_confirm" name="confirm" type="password" minLength={8} autoComplete="new-password" required />
      </div>
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

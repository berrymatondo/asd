"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { KeyRound, LogOut, Menu, Sprout } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NAV } from "@/lib/nav";
import { useStore } from "@/lib/store";
import { changeOwnPassword, logout } from "@/lib/actions/auth";
import { ROLE_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Logo } from "@/components/logo";

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

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <Logo className="size-11" priority />
      <div>
        <b className="text-lg leading-tight">Famille ASD</b>
        <small className="mt-0.5 block text-[11px] text-muted-foreground">Faiseurs de disciples</small>
      </div>
    </div>
  );
}

function NavLinks({ items, isActive, onNavigate }: { items: typeof NAV; isActive: (href: string) => boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="Navigation principale">
      {items.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          aria-current={isActive(href) ? "page" : undefined}
          className={cn(
            "my-0.5 flex w-full items-center gap-3 rounded-xl px-3.5 py-3.5 text-sm font-semibold text-[#68758d] transition-colors hover:bg-accent/60",
            isActive(href) && "bg-accent text-primary"
          )}
        >
          <Icon className="size-4.5" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

function GrowCard() {
  return (
    <div className="rounded-2xl border border-[#e7e8ff] bg-[#f5f6ff] p-3.5">
      <b className="flex items-center gap-1.5 text-[13px]">
        <Sprout className="size-4 text-success" /> Grandir ensemble
      </b>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Accompagner chaque personne, cultiver la prière et célébrer les progrès.</p>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isBerger, isAdmin } = useStore();
  const [pwdOpen, setPwdOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);

  const items = NAV.filter((n) => (!n.bergerOnly || isBerger) && (!n.adminOnly || isAdmin));
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const current = NAV.find((n) => isActive(n.href));
  const pageLabel = current?.label ?? "Vue d’ensemble";

  // Ferme le menu mobile après un changement de page
  React.useEffect(() => setMenuOpen(false), [pathname]);

  const avatar = (
    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#e5dfff] text-sm font-extrabold text-primary" title={user.email}>
      {initials(user.name)}
    </span>
  );

  return (
    <div className="min-h-screen md:flex">
      {/* Barre latérale : écrans moyens et larges */}
      <aside className="hidden md:sticky md:top-0 md:flex md:h-screen md:w-63 md:shrink-0 md:flex-col md:border-r md:bg-card md:px-4.5 md:py-7.5">
        <div className="px-3 pb-8">
          <Brand />
        </div>
        <div className="mx-3 my-3 text-[10px] font-extrabold tracking-[2px] text-[#a3adbe]">ESPACE DE SUIVI</div>
        <NavLinks items={items} isActive={isActive} />
        <div className="mt-auto">
          <GrowCard />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* En-tête mobile : menu burger */}
        <header className="sticky top-0 z-40 flex h-15 items-center gap-2 border-b bg-card/95 px-3 backdrop-blur md:hidden">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Ouvrir le menu" className="size-10">
                <Menu className="size-5.5" />
              </Button>
            </SheetTrigger>
            <SheetContent className="p-4">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <SheetDescription className="sr-only">Navigation et compte</SheetDescription>
              <div className="px-1 pt-1 pb-5">
                <Brand />
              </div>
              <div className="mb-4 flex items-center gap-3 rounded-xl border bg-background px-3 py-2.5">
                {avatar}
                <div className="min-w-0 leading-tight">
                  <b className="block truncate text-[13px]">{user.name}</b>
                  <small className="block truncate text-[11px] text-muted-foreground">
                    {ROLE_LABELS[user.role]} · {user.email}
                  </small>
                </div>
              </div>
              <NavLinks items={items} isActive={isActive} onNavigate={() => setMenuOpen(false)} />
              <div className="my-4 border-t" />
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setPwdOpen(true);
                }}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold text-[#68758d] hover:bg-accent/60"
              >
                <KeyRound className="size-4.5" /> Changer mon mot de passe
              </button>
              <form action={logout}>
                <button
                  type="submit"
                  className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="size-4.5" /> Se déconnecter
                </button>
              </form>
              <div className="mt-auto pt-6">
                <GrowCard />
              </div>
            </SheetContent>
          </Sheet>
          <Link href="/" className="flex shrink-0 items-center" aria-label="Accueil ASD">
            <Logo className="size-9" />
          </Link>
          <b className="min-w-0 flex-1 truncate text-[15px]">{pageLabel}</b>
          {avatar}
        </header>

        {/* En-tête écrans moyens et larges */}
        <header className="hidden h-21 items-center justify-between gap-3 border-b bg-card px-10.5 md:flex">
          <span className="truncate text-[13px] text-muted-foreground">
            Plateforme ASD <span className="text-[#c0c7d3]"> / </span>
            <b className="text-foreground">{pageLabel}</b>
          </span>
          <div className="flex items-center gap-2">
            <div className="text-right leading-tight">
              <b className="block text-[13px]">{user.name}</b>
              <small className="text-[11px] text-muted-foreground">{ROLE_LABELS[user.role]}</small>
            </div>
            {avatar}
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
        <main className="mx-auto max-w-[1390px] px-4 pt-5 pb-10 md:px-10.5 md:pt-9 md:pb-16">{children}</main>
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

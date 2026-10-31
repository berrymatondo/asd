"use client";

import * as React from "react";
import { LogIn } from "lucide-react";
import { login } from "@/lib/actions/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = React.useActionState(login, undefined);

  return (
    <Card className="w-full max-w-sm gap-5 p-7">
      <div className="flex items-center gap-3">
        <div className="grid size-10.5 place-items-center rounded-[13px] bg-primary text-2xl text-primary-foreground">✦</div>
        <div>
          <b className="text-xl">ASD</b>
          <small className="mt-0.5 block text-[11px] text-muted-foreground">Faiseur de disciples</small>
        </div>
      </div>
      <div>
        <h1 className="text-xl font-bold">Connexion</h1>
        <p className="mt-1 text-sm text-muted-foreground">Accédez à votre espace de suivi.</p>
      </div>
      <form action={action} className="grid gap-4">
        <input type="hidden" name="next" value={next} />
        <div className="grid gap-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="password">Mot de passe</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {state?.error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          <LogIn /> {pending ? "Connexion…" : "Se connecter"}
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">Pas de compte ? Demandez à un administrateur de vous en créer un.</p>
    </Card>
  );
}

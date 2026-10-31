import { CalendarDays, FileText, Heart, Layers, LayoutGrid, ShieldCheck, Sparkles, Users, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Berger ou administrateur */
  bergerOnly?: boolean;
  adminOnly?: boolean;
}

export const NAV: NavItem[] = [
  { href: "/", label: "Tableau de bord", icon: LayoutGrid },
  { href: "/groupes", label: "Groupes", icon: Layers },
  { href: "/membres", label: "Membres", icon: Users, bergerOnly: true },
  { href: "/evenements", label: "Événements", icon: CalendarDays },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/prieres", label: "Sujets de prière", icon: Heart },
  { href: "/temoignages", label: "Témoignages", icon: Sparkles },
  { href: "/utilisateurs", label: "Utilisateurs", icon: ShieldCheck, adminOnly: true },
];

import { CalendarDays, FileText, Heart, Layers, LayoutGrid, ShieldCheck, Sparkles, Users, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Berger ou administrateur */
  bergerOnly?: boolean;
  adminOnly?: boolean;
  /** Accessible aux comptes « membre » */
  member?: boolean;
}

/** Page d’arrivée d’un membre après connexion */
export const MEMBER_HOME = "/documents";

export const NAV: NavItem[] = [
  { href: "/", label: "Tableau de bord", icon: LayoutGrid },
  { href: "/groupes", label: "Groupes", icon: Layers },
  { href: "/membres", label: "Membres", icon: Users, bergerOnly: true },
  { href: "/evenements", label: "Événements", icon: CalendarDays, member: true },
  { href: "/documents", label: "Documents", icon: FileText, member: true },
  { href: "/prieres", label: "Sujets de prière", icon: Heart, member: true },
  { href: "/temoignages", label: "Témoignages", icon: Sparkles, member: true },
  { href: "/utilisateurs", label: "Utilisateurs", icon: ShieldCheck, adminOnly: true },
];

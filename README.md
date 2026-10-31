# ASD — Faiseur de disciples (Next.js + shadcn/ui + Neon)

Plateforme de suivi des groupes, membres, événements, documents, prières et témoignages.
**Next.js 16 (App Router)**, **Tailwind CSS v4**, **shadcn/ui**, base **Postgres Neon**, authentification par session.

## Démarrer

```bash
npm install
cp .env.example .env.local   # puis renseigner DATABASE_URL
npm run db:setup             # crée les tables ; si la base est vide : comptes + données d’exemple
npm run dev                  # http://localhost:3000
```

`db:setup` peut être relancé sans risque : il ne recrée rien d’existant. Lors du premier lancement, il affiche les mots de passe des comptes créés (`admin@asd.local`, `berger@asd.local`, `membre@asd.local`). Définissez `ADMIN_EMAIL` / `ADMIN_PASSWORD` avant le premier lancement pour choisir le compte administrateur.

## Rôles

Chaque compte peut être relié à **une fiche membre** (page Utilisateurs). Un berger gère uniquement **ses groupes** : ceux dont sa fiche est le berger.

| Action | Admin | Berger | Membre |
|---|:-:|:-:|:-:|
| Gérer les utilisateurs, leurs rôles et leur fiche reliée (`/utilisateurs`) | ✓ | | |
| Créer / supprimer un groupe | ✓ | | |
| Modifier un groupe | tous | ses groupes | |
| Désigner ou changer le berger d’un groupe | ✓ | | |
| Voir et gérer les fiches privées (`/membres`) | toutes | ses groupes + membres sans groupe | |
| Événements, documents, synthèse & présences, blocage | tous | ses groupes | |
| Événement commun à **tous les groupes** | ✓ | | |
| Tableau de bord administrateur (indicateurs, activité par groupe, points à traiter) | ✓ | | |
| Rapports PDF et Excel (mensuel, par période, par événement) | ✓ | | |
| Voir un événement ou un document de groupe | tous | ses groupes + le groupe de sa fiche | le groupe de sa fiche |
| Partager un document avec **tous les groupes** | ✓ | | |
| Marquer une prière / un témoignage « exaucé » | tous | ses groupes | |
| Consulter, télécharger les documents, ouvrir les rapports | ✓ | ✓ | ✓ |
| Publier une prière ou un témoignage | ✓ | ✓ | ✓ |
| Modifier / supprimer une prière ou un témoignage | tous | ses groupes + les siens | les siens |

Un berger ne peut pas supprimer une fiche de berger (la sienne comprise). Un compte « berger » sans fiche reliée, ou dont la fiche ne mène aucun groupe, ne gère rien : un message l’explique dans l’interface.
Les droits sont vérifiés **côté serveur** (pages et actions) ; l’interface masque seulement les boutons inutiles.
Garde-fous : un administrateur ne peut ni se supprimer ni retirer son propre rôle, et il reste toujours au moins un administrateur actif. Désactiver un compte ou réinitialiser son mot de passe ferme ses sessions.

## Pages

| Route | Contenu |
|---|---|
| `/connexion` | Connexion (e-mail + mot de passe) |
| `/` | Tableau de bord |
| `/groupes`, `/membres`, `/evenements`, `/documents`, `/prieres`, `/temoignages` | Listes avec recherche, filtre par groupe et CRUD |
| `/utilisateurs` | Gestion des comptes (admin) |
| `/rapport/[id]` | Rapport d’événement imprimable |
| `/api/documents/fichiers/[id]` | Téléchargement d’un fichier (`?apercu=1` : aperçu d’image), utilisateur connecté |

## Règles métier
- Un membre peut exister sans groupe (filtre « Sans groupe » sur la page Membres).
- Un berger est d’abord un membre : le berger d’un groupe se choisit parmi les fiches membres. Supprimer sa fiche laisse le groupe « sans berger désigné ».
- Événement verrouillé : ni modification, ni suppression ; synthèse et présences en lecture seule.
- L’heure de fin doit suivre l’heure de début.
- Un groupe non vide ne peut pas être supprimé.
- Un témoignage ne peut être lié qu’à une prière exaucée du même groupe ; supprimer la prière ou la repasser « non exaucée » délie ses témoignages.
- Documents : jusqu’à 10 fichiers ou images par document, 4 Mo chacun, stockés en base (table `document_files`) et envoyés un par un. Les images ont un aperçu.
- Un événement sans groupe est commun : visible dans tous les groupes, présences sur l’ensemble des membres.

## Rapports (admin)
Depuis le tableau de bord, panneau « Rapports » → `/api/rapports?type=mensuel|periode|evenement&format=pdf|xlsx`.
- **PDF** : couverture, indicateurs, activité par groupe, événements par mois, synthèse mensuelle, détail des événements regroupés par groupe, synthèses, assiduité des membres, prières et témoignages.
- **Excel** : feuilles Synthèse, Événements (regroupés et repliables par groupe), Présences (matrice membres × événements), Assiduité (filtrable), Prières, Témoignages ; taux colorés (vert ≥ 75 %, orange ≥ 50 %, rouge en dessous).
- Les présences attendues se basent sur la composition **actuelle** des groupes.

## Structure
```
proxy.ts                 redirection vers /connexion sans cookie de session
app/(platform)/…         pages avec barre latérale (le layout charge les données depuis la base)
app/connexion            page de connexion
lib/db.ts                client SQL Neon
lib/auth.ts              sessions (cookie httpOnly, jeton haché en base), contrôle des rôles
lib/data.ts              lectures (fiches privées masquées pour les membres)
lib/actions/             actions serveur : content.ts (CRUD), users.ts, auth.ts
lib/store.tsx            contexte client : données du serveur + appels aux actions
scripts/db-setup.mjs     schéma SQL et données initiales
```

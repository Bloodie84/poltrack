# Prospect — carnet de terrain géographique

Application de suivi des sorties de détection de métaux : traces GPS réelles,
zones réellement prospectées, découvertes géolocalisées, cartographie, analyse
du terrain.

> **État actuel : phase 1 terminée.** Les fondations sont posées et
> fonctionnelles : base PostGIS avec sécurité au niveau des lignes,
> authentification, carte, géolocalisation, réglages, matériel.
> Les sorties, les traces et les découvertes arrivent en phase 2.
> Voir [ROADMAP.md](./ROADMAP.md) pour le détail phase par phase.

---

## Ce qui fonctionne aujourd'hui

| Fonction | État |
| --- | --- |
| Carte interactive MapLibre (OpenStreetMap) | ✅ |
| Position GPS en direct, cercle d'incertitude à l'échelle du terrain | ✅ |
| Altitude, vitesse, cap, nombre de fixes, coordonnées DD ↔ DMS | ✅ |
| Recentrage, suivi automatique, zoom, plein écran, échelle | ✅ |
| Connexion par lien magique (e-mail, sans mot de passe) | ✅ |
| Profil, unités, confidentialité par défaut | ✅ |
| Largeur de prospection et stratégie d'échantillonnage GPS | ✅ |
| Matériel : détecteurs (ajout, modification, défaut, retrait) | ✅ |
| 18 catégories de découvertes système + catégories personnelles | ✅ |
| Point d'ouverture de la carte enregistré en PostGIS | ✅ |
| PWA installable, coque disponible hors ligne | ✅ |
| Interface responsive mobile / ordinateur, thème sombre | ✅ |

**Sans configuration Supabase, l'application reste utilisable** : la carte et le
GPS fonctionnent entièrement côté client. Un bandeau indique alors explicitement
que **rien n'est enregistré**. Aucun bouton ne fait semblant de sauvegarder.

## Ce qui n'existe pas encore

Sorties, chronomètre, traces GPS enregistrées, historique des passages,
découvertes, photos, parcelles, couverture, mode tondeuse, hors ligne complet,
partage, statistiques, replay, IGN, LiDAR, cartes historiques, 3D.
Ces fonctions sont planifiées dans [ROADMAP.md](./ROADMAP.md) — aucune n'est
présentée comme disponible.

---

## Démarrage

### Prérequis

* Node.js 20.9+
* PostgreSQL 15+ avec **PostGIS** — soit un projet [Supabase](https://supabase.com),
  soit une instance locale

### 1. Installation

```bash
cd prospect
npm install
```

### 2. Sans backend (carte et GPS uniquement)

```bash
npm run dev
```

→ http://localhost:3000 · la carte et la géolocalisation fonctionnent, rien
n'est enregistré.

### 3. Avec backend (installation complète)

```bash
cp .env.example .env.local
# renseignez NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, DATABASE_URL
npm run db:migrate     # crée les tables, index, fonctions et policies RLS
npm run dev
```

Dans Supabase, ajoutez `http://localhost:3000` aux **Redirect URLs**
(Authentication → URL Configuration), sinon les liens de connexion seront
refusés. La page `/configuration` reprend cette procédure dans l'application.

> La géolocalisation du navigateur exige HTTPS, sauf sur `localhost`. Pour
> tester depuis un téléphone sur le réseau local, servez l'application derrière
> un tunnel HTTPS.

---

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` / `npm start` | Build et serveur de production |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript strict, sans émission |
| `npm test` | Tests unitaires (géométrie, formatage, validation) |
| `npm run test:db` | Tests d'intégration PostgreSQL/PostGIS (nécessite `DATABASE_URL`) |
| `npm run test:e2e` | Tests de bout en bout Playwright (nécessite un build) |
| `npm run db:migrate` | Applique les migrations en attente |
| `npm run db:status` | Affiche l'état des migrations, sans rien écrire |
| `npm run icons:generate` | Régénère les icônes PWA |
| `npm run maplibre:worker` | Recopie le worker MapLibre dans `public/maplibre/` (automatique via `postinstall`, `predev` et `prebuild`) |

### Tests d'intégration base de données

```bash
createdb prospect_test
psql -d prospect_test -c 'create extension postgis'
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/prospect_test npm run test:db
```

Ces tests appliquent les **vraies** migrations puis vérifient l'isolation RLS
entre utilisateurs et les calculs PostGIS. Ils ne simulent rien.

---

## Documentation

* [ARCHITECTURE.md](./ARCHITECTURE.md) — choix techniques, structure, stratégies
  GPS / hors ligne / sécurité, difficultés identifiées
* [DATABASE.md](./DATABASE.md) — schéma détaillé, migrations, requêtes visées
* [ROADMAP.md](./ROADMAP.md) — phases 1 à 10
* [CHANGELOG.md](./CHANGELOG.md) — historique des versions

---

## Confidentialité et cadre légal

Les coordonnées sont **privées par défaut**. La sécurité au niveau des lignes
est active sur toutes les tables : un utilisateur ne peut ni lire ni écrire les
données d'un autre, et cette garantie est vérifiée par des tests automatisés.

La pratique de la détection de métaux est réglementée. Elle suppose
l'autorisation du propriétaire du terrain et le respect de la législation
applicable, notamment en matière de protection du patrimoine archéologique.
Cette application est un carnet personnel : elle n'autorise rien et ne remplace
aucune démarche.

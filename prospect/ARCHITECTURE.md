# Architecture

> Document vivant. Il décrit les choix techniques, ce qui est **implémenté**
> aujourd'hui et ce qui est **prévu**. Les deux ne sont jamais mélangés.

---

## 1. Choix de la pile technique

| Domaine | Choix | Pourquoi |
| --- | --- | --- |
| Framework | **Next.js 16 (App Router) + React 19 + TypeScript strict** | Un seul projet pour l'interface, les Server Actions et les routes serveur. Le rendu serveur garde les secrets côté serveur ; le rendu client garde la carte fluide. |
| Style | **Tailwind CSS v4** | Thème sombre par tokens (`@theme`), pas de feuille de style parallèle à maintenir. |
| Carte | **MapLibre GL JS 6** | Choisi plutôt que Leaflet : rendu WebGL vectoriel, sources raster **et** raster-DEM, `hillshade` natif, terrain 3D, changement de style à chaud. Les phases 8 à 10 (LiDAR, ombrage dynamique, X-ray, 3D) sont impossibles avec Leaflet sans empiler des greffons. |
| Base de données | **PostgreSQL + PostGIS** | Les questions du produit (« où ne suis-je jamais passé ? », « quelle surface reste-t-il ? ») sont des requêtes spatiales : `ST_Buffer`, `ST_Union`, `ST_Difference`, `ST_Area` sur le type `geography`. |
| Backend | **Supabase** | PostgreSQL managé avec PostGIS, authentification, stockage objet et **RLS** — la confidentialité est appliquée par la base, pas seulement par le code. |
| Validation | **Zod 4** | Un schéma partagé client/serveur, aux mêmes bornes que les contraintes `CHECK`. |
| Tests | **Vitest** (unitaires + intégration base) et **Playwright** (bout en bout) | Les calculs géométriques et la RLS sont testés contre une vraie base PostGIS, pas contre une simulation. |
| Hors ligne | **IndexedDB + Service Worker** (phase 5) | Une sortie en forêt doit continuer à enregistrer sans réseau. |

### Pourquoi pas une autre pile ?

* **Leaflet** : plus simple, mais aucun support natif du relief, de l'ombrage
  ni de la 3D. Le produit vise explicitement le LiDAR HD.
* **Firebase / MongoDB** : pas d'indexation spatiale comparable à PostGIS ni de
  requêtes de géométrie ; les calculs de couverture devraient remonter côté client.
* **Backend séparé (NestJS, Go…)** : pertinent à plus grande échelle, inutile ici.
  Les Server Actions et les routes Next.js couvrent le besoin sans second déploiement.

---

## 2. Structure des dossiers

```
prospect/
├── src/
│   ├── app/                        Routes (App Router)
│   │   ├── layout.tsx              Coque HTML, métadonnées, PWA
│   │   ├── page.tsx                Redirection vers /carte
│   │   ├── manifest.ts             Manifeste PWA (/manifest.webmanifest)
│   │   ├── (app)/                  Espace applicatif (navigation commune)
│   │   │   ├── layout.tsx          Navigation + bandeau d'état, rendu dynamique
│   │   │   ├── carte/              Carte principale + action « point d'ouverture »
│   │   │   ├── materiel/           Détecteurs (CRUD complet)
│   │   │   └── parametres/         Profil, préférences, échantillonnage GPS
│   │   ├── connexion/              Lien magique par e-mail
│   │   ├── auth/                   Routes de confirmation et de déconnexion
│   │   ├── configuration/          Procédure de mise en service de Supabase
│   │   └── hors-ligne/             Page de repli du service worker
│   ├── components/
│   │   ├── map/                    MapLibre : canevas, contrôles, lecture GPS
│   │   ├── layout/                 Navigation, bandeau d'état, service worker
│   │   └── ui/                     Primitives (bouton, champ, carte)
│   ├── hooks/                      useGeolocation
│   ├── lib/
│   │   ├── env.ts                  Lecture et validation de la configuration
│   │   ├── supabase/               Clients navigateur / serveur / proxy + types
│   │   ├── geo/                    Géométrie, formatage, qualité GPS
│   │   ├── validation/             Schémas Zod
│   │   ├── data/                   Chargement du contexte applicatif
│   │   └── forms.ts                Contrat commun des Server Actions
│   └── proxy.ts                    Session et protection des routes
├── supabase/migrations/            Migrations SQL versionnées et immuables
├── scripts/                        Migrations, génération des icônes
├── tests/
│   ├── db/                         Intégration PostgreSQL/PostGIS
│   ├── e2e/                        Parcours réels sans backend (Playwright)
│   ├── connected/                  Parcours réels avec base (Playwright)
│   └── harness/                    Banc d'essai exposant la base via l'API Supabase
└── public/                         Icônes PWA, service worker
```

**Règle :** un fichier = une responsabilité. Aucun fichier « fourre-tout ».
La logique testable (géométrie, validation, construction GeoJSON) vit dans
`lib/`, jamais dans un composant.

---

## 3. Modèle de données

Voir [DATABASE.md](./DATABASE.md) pour le schéma détaillé, table par table.

Principes appliqués à **toutes** les tables :

* clé primaire `uuid` (`gen_random_uuid()`) — indispensable pour créer une
  entité hors ligne puis la synchroniser sans collision ;
* `created_at` / `updated_at` (`timestamptz`), `updated_at` maintenu par trigger ;
* `deleted_at` pour la suppression logique là où l'historique doit survivre
  (matériel, découvertes, parcelles) ;
* `user_id` sur chaque table personnelle, avec RLS ;
* contraintes `CHECK` explicites, reprises à l'identique dans les schémas Zod ;
* coordonnées en `geography(…, 4326)` : les distances et surfaces sont en
  mètres réels, sans projection à choisir.

---

## 4. Architecture cartographique

```
page serveur (carte)
   └── MapScreenLoader ......... chargement client uniquement (pas de SSR)
        └── MapScreen .......... état : suivi, plein écran, position
             ├── MapCanvas ..... cycle de vie MapLibre + couches de position
             ├── MapControls ... recentrer / zoom / plein écran
             └── PositionReadout coordonnées, incertitude, altitude, cap
```

* **`MapCanvas` ne connaît pas le GPS.** Il expose l'instance MapLibre et
  installe les couches ; le parent pousse les données.
* **Les couches sont réinstallées après chaque changement de style**
  (`setStyle` repart d'un style vierge).
* **Le cercle d'incertitude est un polygone géodésique** (`circlePolygon`),
  pas un cercle en pixels : il reste à l'échelle du terrain à tout zoom.
* **Registre de fonds de carte** (`components/map/basemaps.ts`) : point
  d'extension unique pour les couches IGN / Géoplateforme de la phase 8, qui
  seront lues depuis le `GetCapabilities` du service, pas codées en dur.

### Worker MapLibre

MapLibre charge toutes les sources GeoJSON dans un **Web Worker** dont il déduit
l'URL de `import.meta.url`. Après empaquetage, cette URL désigne un chunk du
bundle : le worker ne démarre pas et plus aucune donnée vectorielle ne s'affiche,
**sans la moindre erreur**. Le worker est donc copié dans `public/maplibre/` par
`scripts/copy-maplibre-worker.mjs` (exécuté par `predev`, `prebuild` et
`postinstall`) et déclaré via `setWorkerUrl()`. Un test de bout en bout lit les
pixels du canevas pour garantir que le marqueur est réellement peint.

### Rotation et cap

La rotation de la carte est désactivée : le nord reste en haut. Sur le terrain,
une carte qui tourne désoriente ; le cap est indiqué par la lecture GPS.

---

## 5. Stratégie de stockage des traces GPS *(appliquée)*

Les points bruts sont conservés — jamais une simple polyligne dessinée.

**Échantillonnage** (réglable par utilisateur, déjà stocké dans `user_settings`) :

| Réglage | Défaut | Rôle |
| --- | --- | --- |
| `gps_min_interval_s` | 3 s | Intervalle minimal entre deux points retenus. |
| `gps_min_distance_m` | 2 m | Distance minimale parcourue depuis le dernier point. |
| `gps_max_accuracy_m` | 30 m | Au-delà, le point est marqué peu fiable. |

Un point est retenu lorsque l'intervalle **et** la distance sont atteints ; un
changement de cap marqué force également un point, pour ne pas couper les virages.

À ces trois critères s'ajoutent deux règles qui évitent de perdre l'essentiel :

* **changement de cap ≥ 30°** : sans elle, les virages seraient coupés en ligne
  droite et la surface prospectée serait fausse ;
* **battement toutes les 30 s** : à l'arrêt, un point atteste tout de même de la
  présence sur place.

Un fix dont l'incertitude dépasse quatre fois le seuil est rejeté (une mesure à
500 m n'apporte rien) ; entre le seuil et cette limite, il est **conservé mais
marqué `is_reliable = false`** et exclu de la trace et des distances. On ne jette
pas une mesure, on la qualifie.

**Modèle** : `gps_points` conserve chaque fix
(`position geography(Point,4326)`, `recorded_at`, `accuracy_m`, `altitude_m`,
`speed_ms`, `heading_deg`, `session_id`), et `tracks` porte la géométrie
consolidée (`geography(LineString,4326)`) plus une version simplifiée pour
l'affichage. Le détail brut sert aux recalculs, la ligne consolidée sert au rendu.

### Ne jamais perdre un point

L'identifiant d'un point est un **UUID généré par le client**. Le point est
d'abord écrit dans un tampon local (`localStorage`), envoyé au serveur par lots,
et n'en est retiré qu'une fois accepté. Conséquences :

* une coupure réseau ne perd rien : le lot repart au prochain cycle ;
* un rechargement de page ne perd rien : le tampon survit ;
* renvoyer un lot déjà reçu n'insère aucun doublon (`ON CONFLICT DO NOTHING`).

Ce tampon n'est pas le mode hors ligne complet (découvertes, photos, file de
synchronisation) : celui-ci arrive en phase 5 et reposera sur IndexedDB.

**Volumétrie** : à 1 point / 3 s, une sortie de 4 h produit ~4 800 points ;
200 sorties par an ≈ 1 M de points. C'est pourquoi l'affichage passe par la
géométrie consolidée et simplifiée (`ST_SimplifyPreserveTopology`) filtrée par
emprise, jamais par le détail brut.

---

## 6. Stratégie hors ligne *(phase 5)*

Trois niveaux, du plus simple au plus complet :

1. **Coque applicative et points GPS** *(implémenté)* — voir « Ne jamais perdre
   un point » ci-dessus pour le tampon des traces.
   Pour le reste : — service worker limité aux fichiers
   statiques versionnés, page de repli hors ligne. **Aucune réponse HTML ni
   donnée applicative n'est mise en cache** : sur un appareil partagé, un cache
   de pages exposerait les données d'un compte à l'autre.
2. **Écriture locale d'abord** *(phase 5)* — toute écriture (point GPS,
   découverte, photo) va dans IndexedDB avec un `uuid` généré localement et un
   état `pending`. L'interface affiche « ENREGISTRÉ LOCALEMENT ».
3. **File de synchronisation** *(phase 5)* — au retour du réseau, la file est
   rejouée dans l'ordre. Les identifiants étant générés côté client, le rejeu
   est idempotent (`upsert` sur la clé primaire). L'état passe à « SYNCHRONISÉ ».

**Conflits** : la règle par défaut est « le plus récent gagne par champ »
(`updated_at` par entité) ; les points GPS ne peuvent pas entrer en conflit
(insertion seule, clé unique). Toute résolution destructive est journalisée
pour rester réversible.

---

## 7. Sécurité

* **Authentification** : Supabase Auth, lien magique par e-mail. Aucun mot de
  passe stocké. La route de confirmation n'accepte que des redirections
  internes (protection contre l'*open redirect*).
* **Autorisation** : **RLS activée sur toutes les tables métier**, sans
  exception. Chaque policy compare `user_id` à `(select auth.uid())`. Les tests
  d'intégration vérifient qu'un utilisateur ne peut ni lire ni écrire les
  données d'un autre.
* **Vérification de session** : `getUser()` (qui valide le jeton auprès du
  serveur d'auth), jamais `getSession()` (qui fait confiance au cookie).
* **Secrets** : seules les clés publiques (`NEXT_PUBLIC_*`) atteignent le
  navigateur. `DATABASE_URL` et la clé `service_role` restent côté serveur.
* **Coordonnées** : privées par défaut (`user_settings.default_privacy = 'private'`).
* **Partage flou** *(phase 6)* : lorsqu'une position est partagée en approché,
  le décalage sera appliqué **côté serveur avant l'envoi**. Le destinataire ne
  recevra jamais les coordonnées exactes — la protection ne peut pas être
  seulement visuelle.
* **Écriture géométrique par RPC** : le client envoie lat/lon, le serveur valide
  les bornes et construit la géométrie (`set_home_point`).

---

## 8. Performance

* Index GiST sur toutes les colonnes géographiques.
* Requêtes bornées par emprise (`ST_Intersects` sur la bbox visible).
* Pagination systématique des listes.
* Simplification géométrique pour l'affichage, détail brut conservé en base.
* Regroupement (*clustering*) des découvertes à petite échelle *(phase 3)*.
* Les couvertures agrégées seront matérialisées plutôt que recalculées à chaque
  affichage *(phase 4)*.

---

## 9. Principales difficultés techniques identifiées

| Difficulté | Nature du risque | Approche |
| --- | --- | --- |
| **Précision GPS** | Un smartphone donne 3 à 15 m d'incertitude, jamais le centimètre. Le mode tondeuse ne peut pas garantir des bandes jointives. | Afficher systématiquement l'incertitude, dimensionner le cercle en mètres réels, ne jamais annoncer une précision qui n'existe pas. |
| **Volume de points GPS** | Des millions de lignes à afficher sur mobile. | Échantillonnage à l'écriture, géométrie consolidée pour le rendu, filtrage par emprise, tuilage si nécessaire. |
| **Couverture réelle** | `ST_Union` sur des milliers de tampons est coûteux. | Agrégats matérialisés par parcelle, recalcul en tâche de fond après une sortie. |
| **Synchronisation hors ligne** | Perte ou duplication de données. | UUID générés côté client, file rejouable, écritures idempotentes, journal des conflits. |
| **Photos hors ligne** | Le stockage navigateur est limité et peut être purgé. | Blobs en IndexedDB, téléversement dès le retour du réseau, avertissement explicite tant que la photo n'est pas synchronisée. |
| **LiDAR HD** | Dalles volumineuses, services IGN évolutifs. | Lire le `GetCapabilities` plutôt que coder les URLs en dur ; traitements lourds (relief local) côté serveur. |
| **Confidentialité du partage** | Un partage flou naïf reste réversible côté client. | Décalage appliqué en base avant l'envoi, jeton révocable, expiration. |
| **Worker du moteur cartographique** | Une URL de worker cassée vide la carte en silence. | Worker servi depuis `public/`, URL explicite, test au pixel près. |
| **Batterie** | `watchPosition` en continu + écran allumé. | Échantillonnage configurable, `Screen Wake Lock` optionnel, aucune animation superflue. |
| **Cadre légal** | La détection est réglementée. | Fiche d'autorisation par terrain *(phase 4)* et rappel discret ; l'application n'encourage aucun usage illégal. |

---

## 10. Vérification de bout en bout

Aucun projet Supabase n'étant joignable depuis l'environnement de développement,
`tests/harness/supabase-stub.mjs` expose la **vraie** base PostgreSQL/PostGIS via
le sous-ensemble de l'API que le client Supabase utilise (PostgREST et
`/auth/v1/user`). Chaque requête est jouée sous le rôle `authenticated` avec le
claim JWT de l'utilisateur de test : le SQL, les fonctions et la RLS exercés sont
ceux du produit.

Ce banc d'essai ne sert qu'aux tests ; il n'est jamais inclus dans le build. Il
ne prouve pas le comportement exact de PostgREST ni de GoTrue — seule une
instance Supabase réelle le fait — mais il permet de dérouler un parcours complet
(démarrer une sortie, marcher, mettre en pause, terminer, consulter la fiche) et
de vérifier ensuite les données directement en base.

Un test de contrat complète le dispositif : il extrait du code tous les appels
`supabase.rpc('nom', { … })` et vérifie que chaque argument nommé existe dans la
signature SQL correspondante. Une faute de frappe ne peut plus attendre la
production pour se manifester.

## 11. Conventions de code

* TypeScript **strict**, aucun `any` de complaisance.
* Aucune désactivation d'ESLint pour contourner un problème ; la seule
  exception commentée concerne le montage unique de MapLibre.
* Les Server Actions renvoient toutes le même contrat (`ActionState`) :
  `status`, `message`, `fieldErrors`.
* Interface en français, identifiants de code en anglais.
* Un commentaire n'existe que s'il explique un **pourquoi** non évident.

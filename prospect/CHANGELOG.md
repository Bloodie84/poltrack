# Journal des modifications

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).
Versionnage sémantique.

## [0.1.0] — Phase 1 : fondations

### Ajouté

**Infrastructure**
- Projet Next.js 16 (App Router), React 19, TypeScript strict, Tailwind CSS v4.
- Migrations SQL versionnées avec registre d'empreintes SHA-256 : une migration
  déjà appliquée ne peut plus être modifiée silencieusement.
- Substitut local du schéma `auth` permettant de tester la RLS sans Supabase.
- Génération des icônes PWA sans dépendance native (`scripts/generate-icons.mjs`).

**Base de données**
- PostGIS, schéma technique `app`, types `privacy_level` et `unit_system`,
  trigger `updated_at` réutilisable.
- `profiles` (avec `home_point geography`, colonnes générées `home_lat`/`home_lon`,
  index GiST) et `user_settings`, provisionnés automatiquement à l'inscription.
- `detectors` et `detector_presets`, avec suppression logique et détecteur par
  défaut unique garanti par index partiel.
- `find_categories` : 18 catégories système partagées + catégories personnelles.
- Fonctions `set_home_point()` et `set_default_detector()`, validées côté serveur.
- RLS activée sur toutes les tables métier.

**Application**
- Authentification par lien magique, confirmation OTP et PKCE, protection contre
  la redirection ouverte, déconnexion en POST uniquement.
- Protection des routes via `proxy.ts` (convention Next.js 16), avec
  vérification du jeton par `getUser()`.
- Carte MapLibre : position GPS, cercle d'incertitude géodésique, cap, altitude,
  vitesse, coordonnées DD ↔ DMS, recentrage, suivi, plein écran, échelle.
- Enregistrement du point d'ouverture de la carte depuis le terrain.
- Écran Réglages : profil, unités, langue, confidentialité, largeur de
  prospection, échantillonnage GPS.
- Écran Matériel : gestion complète des détecteurs.
- Page Configuration décrivant la mise en service de Supabase.
- Mode dégradé explicite sans backend : la carte fonctionne, un bandeau indique
  que rien n'est enregistré.
- PWA : manifeste, icônes, service worker limité à la coque applicative, page de
  repli hors ligne.

**Tests**
- 59 tests unitaires : géodésie (haversine, cap, point destination, cercle
  géodésique, emprise), formatage, qualité GPS, schémas de validation.
- 25 tests d'intégration sur PostgreSQL/PostGIS : migrations rejouables, RLS,
  isolation entre utilisateurs, cascade de suppression, bornes des RPC,
  fondations des calculs de couverture.
- 13 tests de bout en bout Playwright : rendu de la carte, activation du GPS,
  cadrage sur la première position, boutons de zoom réellement actifs,
  déplacement manuel coupant le suivi, affichage de l'incertitude, bascule
  DD/DMS, navigation, et vérification au pixel près que le marqueur de position
  est bien peint par WebGL (décodeur PNG minimal, sans dépendance ajoutée).

### Corrigé
- `installPositionLayers` était appelée sur `styledata` avant que le style soit
  exploitable : l'exception levée interrompait la séquence de chargement de
  MapLibre, l'événement `load` n'aboutissait pas et la carte restait non
  pilotable (zoom et recentrage sans effet). Détecté par les tests de bout en
  bout, corrigé par un garde `isStyleLoaded()`.
- Le recadrage automatique déclenchait `zoomstart`, interprété comme un geste de
  l'utilisateur : le suivi se désactivait immédiatement après avoir été demandé.
  Les déplacements programmatiques sont désormais distingués des gestes réels
  via `originalEvent`.
- Les contrôles de carte (zoom, recentrage) étaient cliquables avant la fin du
  chargement de MapLibre et restaient alors sans effet : ils sont désormais
  explicitement désactivés jusqu'à ce que la carte accepte des commandes.
- MapLibre déduit l'URL de son worker de `import.meta.url` ; une fois le paquet
  empaqueté, cette URL désignait un chunk du bundle et le worker ne démarrait
  pas. Conséquence silencieuse et sérieuse : **aucune source GeoJSON n'était
  chargée**, le marqueur de position n'apparaissait jamais et rien n'était
  signalé — ce qui aurait aussi bloqué les traces et les parcelles des phases
  suivantes. Le worker est désormais servi depuis `public/maplibre/`
  (`scripts/copy-maplibre-worker.mjs`, exécuté avant chaque build) et déclaré
  via `setWorkerUrl()`. Un test de bout en bout lit les pixels du canevas pour
  empêcher toute régression.

### Sécurité
- Aucune clé secrète exposée au navigateur.
- Coordonnées privées par défaut.
- Pas de mise en cache des réponses HTML par le service worker, pour éviter
  toute fuite de données entre comptes sur un appareil partagé.

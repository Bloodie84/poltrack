# Base de données

PostgreSQL 15+ avec **PostGIS**. Toutes les géométries sont en `geography`
(SRID 4326) : les distances et les surfaces sortent directement en mètres et en
mètres carrés, sans choix de projection.

---

## Conventions communes

| Colonne | Type | Rôle |
| --- | --- | --- |
| `id` | `uuid` (`gen_random_uuid()`) | Générable hors ligne, sans collision à la synchronisation. |
| `user_id` | `uuid` → `profiles.id` | Propriétaire. Base de toutes les policies RLS. |
| `created_at` | `timestamptz` | Date de création. |
| `updated_at` | `timestamptz` | Maintenue par le trigger `app.set_updated_at()`. |
| `deleted_at` | `timestamptz` | Suppression logique, là où l'historique doit survivre. |

* **RLS activée sur toutes les tables métier**, sans exception.
* Les policies utilisent `(select auth.uid())` — évaluée une fois par requête
  au lieu d'une fois par ligne.
* Les contraintes `CHECK` sont la source de vérité ; les schémas Zod du
  frontend reprennent exactement les mêmes bornes.

---

## Migrations

Fichiers SQL numérotés dans `supabase/migrations/`, appliqués par
`npm run db:migrate`.

```
0001_extensions_and_helpers.sql   PostGIS, schéma app, types, trigger updated_at
0002_auth_compat.sql              Substitut local de auth.* (no-op sur Supabase)
0003_profiles_and_settings.sql    profiles, user_settings, set_home_point()
0004_detectors.sql                detectors, detector_presets
0005_find_categories.sql          Catégories système + personnelles
0006_default_detector.sql         set_default_detector() atomique
0007_sessions.sql                 sessions (cycle de vie, largeur figée, retour)
0008_gps_points_and_tracks.sql    gps_points bruts, tracks consolidées
0009_session_functions.sql        cycle de vie, append_gps_points, session_overview
0010_session_reads.sql            session_geojson (trace complète d'une sortie)
```

**Les migrations sont immuables.** Le registre `public.app_migrations`
mémorise une empreinte SHA-256 par fichier : modifier une migration déjà
appliquée provoque une erreur explicite au lieu d'une dérive silencieuse du
schéma. Une correction se fait toujours par un **nouveau** fichier.

`0002_auth_compat.sql` ne fait rien sur Supabase (le schéma `auth` y existe
déjà). En local, il recrée un `auth.users`, une fonction `auth.uid()` et les
rôles `anon` / `authenticated` / `service_role`, ce qui rend les policies RLS
réellement testables sans dépendre du service hébergé.

---

## Tables — phase 1 (implémentées)

### `profiles`
Extension applicative de `auth.users`, créée automatiquement à l'inscription
par le trigger `on_auth_user_created`.

| Colonne | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | → `auth.users(id)` `ON DELETE CASCADE`. |
| `display_name` | `text` | 1 à 80 caractères. |
| `avatar_url` | `text` | |
| `home_point` | `geography(Point,4326)` | Point d'ouverture de la carte. **Donnée privée.** Index GiST. |
| `home_lat` / `home_lon` | `double precision` | Colonnes **générées** depuis `home_point`. PostgREST sérialise `geography` en EWKB hexadécimal : ces colonnes donnent au client des coordonnées exploitables. |
| `home_zoom` | `real` | 0 → 22. |

*Écriture* : `public.set_home_point(lat, lon, zoom)` — le serveur valide les
bornes et construit la géométrie. `NULL, NULL` efface le point.

### `user_settings`
Une ligne par profil. Préférences valables sur tous les appareils.

| Colonne | Défaut | Bornes |
| --- | --- | --- |
| `units` | `metric` | `metric` \| `imperial` |
| `locale` | `fr` | `fr` \| `en` |
| `theme` | `dark` | `dark` \| `light` \| `system` |
| `default_basemap` | `osm` | |
| `default_sweep_width_m` | `2.00` | 0,20 → 10,00 |
| `gps_min_interval_s` | `3` | 1 → 60 |
| `gps_min_distance_m` | `2.00` | 0 → 100 |
| `gps_max_accuracy_m` | `30.00` | 1 → 500 |
| `keep_screen_awake` | `true` | |
| `default_privacy` | `private` | `private` \| `friends` \| `shared` |

### `detectors`
Matériel. Suppression **logique** : les sorties et découvertes des phases
suivantes conservent une référence valide vers le détecteur utilisé à l'époque.

Index unique partiel `detectors_one_default_per_user` : un seul détecteur par
défaut par utilisateur. Le basculement passe par
`public.set_default_detector(id)`, atomique.

### `detector_presets`
Réglages nommés d'un détecteur : `program`, `sensitivity`, `discrimination`,
`ground_balance`, `iron_volume`, plus un champ `extra jsonb` pour les
paramètres propres à une marque, conservés sans perte.

### `find_categories`
Deux origines cohabitent :

* **système** — `user_id IS NULL`, `is_system = true`, visibles par tous, non
  modifiables. 18 catégories installées par la migration : monnaie, bague,
  bijou, bouton, médaille, boucle, plomb, objet militaire, objet ancien, objet
  moderne, fer, bronze, cuivre, argent, or, déchet, indéterminé, autre ;
* **personnelles** — `user_id = propriétaire`, librement gérées.

`is_waste` alimentera le ratio déchets / trouvailles du tableau de bord.
Une contrainte empêche de créer une catégorie « système » usurpée.

---

## Tables — phase 2 (implémentées)

### `sessions`
Une sortie, de son démarrage à sa fin.

| Colonne | Type | Notes |
| --- | --- | --- |
| `status` | `session_status` | `active` \| `paused` \| `finished`. |
| `started_at` / `ended_at` | `timestamptz` | `ended_at` non nul ⇔ `finished`. |
| `paused_seconds` | `integer` | Pauses déjà soldées. |
| `paused_at` | `timestamptz` | Début de la pause en cours ⇔ `paused`. |
| `sweep_width_m` | `numeric(4,2)` | **Figée au démarrage** : changer le réglage plus tard ne doit pas réécrire la couverture des sorties passées. |
| `start_point` | `geography(Point,4326)` | Position de départ. Index GiST. |
| `vehicle_point` | `geography(Point,4326)` | Point de retour (voiture, entrée du terrain). |
| `detector_id` | `uuid` | `ON DELETE SET NULL` : retirer un détecteur n'efface pas une sortie. |

Index unique partiel `sessions_one_open_per_user` : **une seule sortie ouverte à
la fois**. Trois contraintes `CHECK` garantissent la cohérence de l'état
(`paused` ⇔ `paused_at`, `finished` ⇔ `ended_at`, fin après début).

### `gps_points`
La donnée source, jamais reconstruite.

| Colonne | Notes |
| --- | --- |
| `id` | **Généré par le client** : c'est ce qui rend l'envoi idempotent après une coupure réseau. |
| `position` | `geography(Point,4326)`, index GiST. `lat`/`lon` en colonnes générées. |
| `recorded_at` | Horodatage du fix, pas de son enregistrement. |
| `accuracy_m`, `altitude_m`, `altitude_accuracy_m`, `speed_ms`, `heading_deg` | Mesures brutes, telles que fournies par le navigateur. |
| `is_reliable` | Faux si l'incertitude dépasse le seuil de l'utilisateur : le point est **conservé** mais exclu de la trace et des distances. |

### `tracks`
Projection destinée à l'affichage, entièrement reconstructible par
`rebuild_track()` : `line` (complète), `simplified` (~2 m de tolérance),
`point_count`, `distance_m`.

### Fonctions

| Fonction | Rôle |
| --- | --- |
| `start_session(...)` | Démarre une sortie, refuse s'il en existe déjà une ouverte. |
| `pause_session` / `resume_session` | Bascule d'état, cumule le temps de pause. |
| `finish_session` | Solde la pause en cours, clôt la sortie, reconstruit la trace. |
| `append_gps_points(id, jsonb)` | Insère un lot, ignore les doublons et les coordonnées hors bornes, reconstruit la trace. |
| `set_vehicle_point` | Définit ou efface le point de retour. |
| `rebuild_track` | Recalcule `tracks` depuis les points fiables. |
| `tracks_in_bbox(...)` | Traces simplifiées d'une emprise et d'une période, en GeoJSON, bornées à 500 résultats. |
| `session_geojson(id)` | Trace complète, départ et point de retour d'une sortie. |

### Vue `session_overview`
Sorties enrichies de `distance_m`, `point_count`, `elapsed_seconds` et
`active_seconds` (temps écoulé moins toutes les pauses, pause en cours
comprise). Déclarée `security_invoker = true` : la RLS des tables sous-jacentes
s'applique.

---

## Tables — phases suivantes (prévues, non créées)

Le schéma ci-dessous est le cap visé. Chaque table sera créée par la migration
de sa phase, pas avant.

| Phase | Tables | Points spatiaux clés |
| --- | --- | --- |
| 3 | `finds`, `find_photos`, `collections`, `collection_items` | `finds.position geography(Point,4326)` + `accuracy_m` conservée. |
| 4 | `areas`, `area_coverage`, `points_of_interest`, `land_permissions` | `areas.boundary geography(Polygon,4326)`, couverture = `ST_Union` des tampons de largeur de balayage, restant = `ST_Difference`. |
| 5 | `sync_queue` (côté client, IndexedDB) | Pas de table serveur : l'idempotence repose sur les UUID clients. |
| 6 | `shares`, `share_items` | Position floutée calculée **en base** avant l'envoi. |
| 7 | vues matérialisées de statistiques | Agrégats par parcelle, par mois, par catégorie. |
| 8+ | `terrain_cache` | Dalles LiDAR / MNT mises en cache. |

### Requêtes de couverture visées (phase 4)

```sql
-- Surface réellement prospectée d'une parcelle, sans double comptage.
select st_area(
         st_intersection(
           st_union(st_buffer(t.line, s.default_sweep_width_m / 2)::geometry),
           a.boundary::geometry
         )::geography
       ) as covered_m2
  from tracks t
  join areas a on st_intersects(t.line::geometry, a.boundary::geometry)
  join user_settings s on s.user_id = t.user_id
 where a.id = $1;
```

Le résultat sera **matérialisé** par parcelle et recalculé en tâche de fond
après chaque sortie : recalculer un `ST_Union` de milliers de tampons à chaque
affichage ne tiendrait pas sur mobile.

---

## Tests

`npm run test:db` applique les migrations réelles sur une base PostGIS puis
vérifie :

* l'installation de PostGIS et la présence de toutes les tables ;
* la RLS active sur chaque table métier (hors tables d'extension) ;
* la rejouabilité des migrations, sans effet de bord ;
* le provisionnement automatique du profil et des préférences ;
* la cascade de suppression d'un compte ;
* l'isolation stricte entre deux utilisateurs (lecture **et** écriture) ;
* le partage des catégories système et l'isolement des catégories personnelles ;
* la validation des bornes de `set_home_point` ;
* le cycle complet d'une sortie : démarrage, unicité de la sortie ouverte,
  pauses cumulées, clôture depuis la pause ;
* l'idempotence de `append_gps_points`, le rejet des coordonnées hors bornes et
  la reconstruction de la trace après une synchronisation différée ;
* la conservation des points peu fiables et leur exclusion de la trace ;
* le filtrage par emprise et par période de `tracks_in_bbox`, et son isolation
  entre utilisateurs ;
* le contrat entre le code et le SQL : chaque argument nommé de chaque appel
  `supabase.rpc(...)` du code existe bien dans la signature de la fonction ;
* l'atomicité de `set_default_detector`, y compris le refus d'agir sur le
  matériel d'autrui ;
* les fondations PostGIS de la couverture : distances en mètres, surface d'un
  tampon de largeur de balayage, fusion de deux passages qui se recouvrent.

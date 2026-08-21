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

## Tables — phases suivantes (prévues, non créées)

Le schéma ci-dessous est le cap visé. Chaque table sera créée par la migration
de sa phase, pas avant.

| Phase | Tables | Points spatiaux clés |
| --- | --- | --- |
| 2 | `sessions`, `gps_points`, `tracks` | `gps_points.position geography(Point,4326)` (index GiST), `tracks.line geography(LineString,4326)`. |
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
* l'atomicité de `set_default_detector`, y compris le refus d'agir sur le
  matériel d'autrui ;
* les fondations PostGIS de la couverture : distances en mètres, surface d'un
  tampon de largeur de balayage, fusion de deux passages qui se recouvrent.

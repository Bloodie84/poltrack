# Feuille de route

Chaque phase n'est ouverte que lorsque la précédente **fonctionne**. Aucune
fonctionnalité n'est annoncée tant qu'elle n'est pas réellement utilisable.

Légende : ✅ terminé · 🚧 en cours · ⬜ à faire

---

## Phase 1 — Fondations ✅

Projet, base de données, authentification, carte.

- ✅ Next.js 16 + React 19 + TypeScript strict + Tailwind v4
- ✅ PostgreSQL + PostGIS, migrations versionnées et immuables, registre d'empreintes
- ✅ RLS sur toutes les tables métier, testée contre une vraie base
- ✅ Authentification par lien magique (Supabase Auth)
- ✅ Profil, préférences, échantillonnage GPS, largeur de balayage par défaut
- ✅ Matériel : détecteurs (création, modification, défaut atomique, retrait logique)
- ✅ Catégories de découvertes : 18 catégories système + personnalisables
- ✅ Carte MapLibre, position GPS, cercle d'incertitude géodésique, cap, altitude,
     vitesse, recentrage, suivi, plein écran, échelle
- ✅ Point d'ouverture de la carte stocké en PostGIS (RPC validée côté serveur)
- ✅ Interface responsive (barre basse mobile / colonne latérale ordinateur)
- ✅ PWA installable : manifeste, icônes, service worker de coque
- ✅ Tests : 59 unitaires, 25 d'intégration base, 13 de bout en bout

## Phase 2 — Sorties et traces GPS ⬜

- ⬜ `sessions` : démarrer / pause / reprendre / terminer, chronomètre
- ⬜ `gps_points` : enregistrement réel des fixes, échantillonnage temps + distance + cap
- ⬜ `tracks` : géométrie consolidée pour l'affichage
- ⬜ Distance parcourue, durée, vitesse moyenne
- ⬜ Écran LIVE utilisable à une main
- ⬜ Historique des passages, filtres (jour / semaine / mois / année / sortie)
- ⬜ Retour à la voiture : point de départ, cap et distance
- ⬜ `Screen Wake Lock` pendant une sortie

## Phase 3 — Découvertes et photos ⬜

- ⬜ Bouton TROUVAILLE : position capturée immédiatement avec son incertitude
- ⬜ Ajout ultra-rapide (Monnaie / Bijou / Objet / Déchet / À identifier)
- ⬜ Fiche complète : métal, profondeur, VDI, époque, état, valeur, réglages
- ⬜ Photos : téléversement, vignettes, URLs signées
- ⬜ Galerie et filtres, collections, favoris et « à revoir »
- ⬜ Points d'intérêt (mur, chemin, puits, entrée du terrain…)

## Phase 4 — Parcelles et couverture ⬜

- ⬜ Dessin et modification de polygones, import GeoJSON / GPX / KML
- ⬜ Tampons de largeur de balayage (`ST_Buffer` sur `geography`)
- ⬜ Carte de couverture : jamais / une fois / plusieurs fois
- ⬜ Zones oubliées : `ST_Difference`, surfaces et pourcentage d'avancement
- ⬜ Mode tondeuse : bandes parallèles, état à faire / en cours / terminé
- ⬜ Fiche terrain : propriétaire, autorisation, restrictions

## Phase 5 — Hors ligne et synchronisation ⬜

- ⬜ IndexedDB : écriture locale d'abord pour points, découvertes et photos
- ⬜ File de synchronisation rejouable et idempotente
- ⬜ États explicites « ENREGISTRÉ LOCALEMENT » puis « SYNCHRONISÉ »
- ⬜ Résolution de conflits journalisée
- ⬜ Mise en cache des tuiles pour une zone préparée

## Phase 6 — Partage ⬜

- ⬜ Liens privés révocables, QR code, expiration (1 h / 24 h / 7 j / permanent)
- ⬜ Position exacte ou approchée (± 25 / 100 / 500 m), **floutage côté serveur**
- ⬜ Partage d'une sélection, d'une sortie, d'une zone

## Phase 7 — Statistiques et replay ⬜

- ⬜ Tableau de bord : heures, kilomètres, hectares, découvertes par heure
- ⬜ Répartition par catégorie, métal, profondeur, VDI, détecteur
- ⬜ Ratio déchets / trouvailles, zones les plus productives
- ⬜ Replay animé d'une sortie (play / pause / ×2 / ×5 / ×10)
- ⬜ Rapport automatique de fin de sortie

## Phase 8 — IGN et LiDAR HD ⬜

- ⬜ Couches Géoplateforme lues depuis le `GetCapabilities` (jamais codées en dur)
- ⬜ Plan IGN, orthophoto, cadastre
- ⬜ LiDAR HD : MNT, MNS, MNH, ombrage — chargement automatique selon l'emprise
- ⬜ Ombrage dynamique (azimut, hauteur, exagération) et multidirectionnel
- ⬜ Profil altimétrique A → B

## Phase 9 — Cartes historiques et comparaison ⬜

- ⬜ Curseur temporel, photos aériennes anciennes, cartes d'état-major, Cassini
- ⬜ Mode X-ray (curseur satellite ↔ LiDAR)
- ⬜ Comparaison multi-cartes synchronisées (jusqu'à 4 sur ordinateur)

## Phase 10 — 3D et analyses avancées ⬜

- ⬜ Terrain 3D (rotation, inclinaison, exagération)
- ⬜ Relief local (suppression de la pente générale)
- ⬜ Pente, orientation, courbure, ruptures de pente
- ⬜ Croisement des données personnelles, indice personnel de zone
- ⬜ Mission Control : préparation de sortie sur ordinateur
- ⬜ Mode équipe, notes vocales, suggestions IA sur photo

---

## Engagements permanents

* Aucun bouton sans effet réel.
* Aucune donnée simulée présentée comme réelle.
* La précision du GPS d'un smartphone est toujours affichée, jamais embellie.
* Une anomalie de terrain est une « anomalie topographique potentielle », jamais
  un site archéologique identifié.
* L'application rappelle que la détection est soumise à autorisation et à la loi.

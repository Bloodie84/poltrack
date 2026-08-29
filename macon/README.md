# Site vitrine — Artisan maçon

Site statique en une page (HTML/CSS/JS, aucune dépendance à installer, aucun build).
Il fonctionne tel quel en ouvrant `index.html` dans un navigateur, et se déploie sur
n'importe quel hébergeur statique (GitHub Pages, Netlify, Vercel, OVH, o2switch…).

```
macon/
├── index.html              page principale
├── mentions-legales.html   mentions légales + RGPD
├── assets/
│   ├── styles.css          styles (palette en haut du fichier)
│   ├── script.js           menu, animations, formulaire
│   └── img/                images (placeholders SVG à remplacer)
└── README.md
```

## 1. Ce qu'il faut remplacer

Toutes les valeurs de démonstration sont signalées dans le code par un commentaire
`<!-- À REMPLACER : … -->`. Pour les retrouver :

```bash
grep -rn "À REMPLACER" macon/
```

Récapitulatif des informations à fournir :

| Élément | Valeur de démo actuelle | Où |
|---|---|---|
| Nom de l'entreprise | Maçonnerie Dubreuil | `index.html`, `mentions-legales.html`, `README` |
| Accroche / ancienneté | Artisan maçon depuis 1998 | en-tête, pied de page |
| Téléphone | 06 00 00 00 00 / `tel:+33600000000` | barre du haut, hero, contact, pied de page, barre mobile |
| E-mail | contact@exemple-maconnerie.fr | contact, pied de page, `script.js` (`CONTACT_EMAIL`) |
| Adresse | 12 route des Carrières, 00000 Villeneuve | contact, zone, pied de page |
| Horaires | Lun–ven 7 h 30 – 18 h | zone, contact |
| Communes desservies | liste de démo | section « Zone d'intervention » |
| Chiffres clés | 25 ans / 400+ / 48 h / 40 km | section « stats » |
| Avis clients | 3 avis fictifs | section « Ce que disent nos clients » |
| SIRET, TVA, assureur, hébergeur | zéros | `mentions-legales.html` + pied de page |
| Nom de domaine | www.exemple-maconnerie.fr | balises `canonical`, `og:*`, JSON-LD |

> ⚠️ Les avis clients affichés sont des exemples. Il faut les remplacer par de vrais
> avis (Google, PagesJaunes…) avant la mise en ligne : publier de faux avis est
> une pratique commerciale trompeuse sanctionnée par la loi.

## 2. Les photos

`assets/img/` contient des visuels de remplacement (SVG gris) pour que la mise en page
soit visible sans photo. À remplacer par de vraies photos de chantier :

| Fichier | Usage | Format conseillé |
|---|---|---|
| `hero.svg` | grande image d'arrière-plan | 1600 × 1000 px, paysage |
| `realisation-1 … 6.svg` | galerie | 900 × 675 px (4/3) |
| `equipe.svg` | section « Garanties » | 900 × 700 px |
| `og-image.svg` | aperçu lors d'un partage | 1200 × 630 px |

Déposer les fichiers en `.jpg` (compressés, < 300 ko) puis corriger l'extension dans
les attributs `src` de `index.html`. Penser à mettre à jour les attributs `alt`,
qui décrivent l'image pour le référencement et les lecteurs d'écran.

## 3. Le formulaire de devis

Par défaut, le formulaire **ouvre le logiciel de messagerie du visiteur** avec la
demande pré-remplie : aucun serveur n'est nécessaire, mais c'est moins fluide.

Pour recevoir les demandes directement par e-mail :

1. Créer un formulaire gratuit sur [Formspree](https://formspree.io) (ou Web3Forms, Basin…).
2. Ouvrir `assets/script.js` et renseigner l'URL fournie :
   ```js
   var FORM_ENDPOINT = 'https://formspree.io/f/xxxxxxxx';
   ```

Un champ piège invisible (`_gotcha`) bloque déjà une bonne partie des robots spammeurs.

## 4. Personnaliser l'apparence

Toutes les couleurs et polices sont regroupées en haut de `assets/styles.css` :

```css
:root {
  --brand:      #b4551f;  /* ocre / brique : couleur principale */
  --brand-dark: #8f3f14;  /* survol des boutons */
  --ink:        #17191c;  /* texte */
  ...
}
```

Changer `--brand` suffit à re-décliner tout le site (boutons, icônes, bandeau de chiffres).

## 5. Mise en ligne

**GitHub Pages** — activer Pages sur la branche voulue, le site sera servi à
l'adresse `https://<utilisateur>.github.io/<dépôt>/macon/`.

**Netlify / Vercel** — glisser-déposer le dossier `macon/`, ou connecter le dépôt en
indiquant `macon` comme répertoire de publication. Aucune commande de build.

**Hébergeur classique (FTP)** — copier le contenu de `macon/` à la racine du site.

Après la mise en ligne : déclarer le site dans
[Google Search Console](https://search.google.com/search-console) et créer/compléter
une fiche **Google Business Profile** — pour un artisan local, c'est le levier de
visibilité le plus efficace, devant le site lui-même.

## 6. Accessibilité et performance

- Aucune bibliothèque externe : le site pèse quelques dizaines de ko.
- Navigation au clavier, lien d'évitement, contrastes conformes AA.
- Animations désactivées si le visiteur a activé « réduire les animations ».
- Données structurées `GeneralContractor` (JSON-LD) pour le référencement local.
- Seule ressource tierce : Google Fonts. Pour s'en passer (et supprimer le paragraphe
  « Cookies » des mentions légales), télécharger les polices dans `assets/fonts/`,
  les déclarer en `@font-face` et retirer les balises `<link>` vers `fonts.googleapis.com`.

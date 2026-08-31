# Wingman

Assistant privé pour gérer les matchs Tinder : scoring des profils selon mes goûts,
suivi des conversations, aide à la rédaction des réponses.

## Utilisation

Ouvrir `wingman/index.html` dans un navigateur (double-clic, ou via l'URL `/wingman/`
si le site est servi). Aucune installation, aucun serveur, aucun compte.

Ordre conseillé :

1. **Mes goûts** — critères (âge, distance, taille), poids de chaque critère,
   centres d'intérêt recherchés, red flags, et surtout *mon style de message*
   (ton, longueur, emojis, exemples de vrais messages). Tout le reste s'appuie dessus.
2. **Scanner un profil** — recopier ce qu'on voit sur son profil → score /100,
   détail critère par critère, verdict, puis enregistrement dans les matchs.
3. **Mes matchs** — statut (nouveau → conversation → numéro → date), notes,
   conversation collée message par message. Badges automatiques : « à toi » de
   répondre, « relance » après 3 jours sans activité.
4. **Écrire ma réponse** — objectif (ouverture, relance, flirt, proposer un date,
   débloquer une conversation qui s'éteint…), ton, longueur → 3 propositions
   différentes, avec le pourquoi et le risque de chacune.

## Données

Tout est stocké dans le `localStorage` du navigateur, rien n'est envoyé nulle part.
Vider les données du site efface tout : exporter le `.json` de temps en temps
(Réglages → Exporter).

## Aide IA (optionnelle)

Sans clé API, le générateur fonctionne en **mode local** : banque de formulations
par objectif et par ton, remplies avec le prénom, ses centres d'intérêt et son
dernier message, plus une analyse mécanique de la conversation (qui écrit le plus,
qui pose les questions, délai depuis le dernier message).

Avec une clé API Anthropic (Réglages), les suggestions sont écrites sur mesure par
Claude à partir de la conversation complète, de son profil et du style renseigné.
La requête part directement du navigateur vers `api.anthropic.com` — la clé est
stockée en clair dans le navigateur, donc : appareil personnel uniquement, et
ne jamais publier la page en ligne avec la clé dedans.

Modèles proposés : Claude Opus 5 (défaut), Sonnet 5, Haiku 4.5.

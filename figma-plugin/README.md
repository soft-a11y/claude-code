# Prisme — plugin Figma

Génère les dégradés de Prisme **directement dans Figma**, en remplissages natifs
modifiables — pas en images importées.

## Installation

1. Cloner ce dépôt (ou télécharger le dossier `figma-plugin/`).
2. Dans Figma : menu **Plugins → Development → Import plugin from manifest…**
3. Choisir `figma-plugin/manifest.json`.
4. Le plugin apparaît alors dans **Plugins → Development → Prisme — dégradés**.

Aucune compilation, aucune dépendance : trois fichiers, du JavaScript simple.
Le plugin ne fait aucun appel réseau (`networkAccess: none`).

## Ce qu'il fait

- **Quatre types** — linéaire, radial, conique, et maille.
- **13 familles de génération** — les mêmes que Prisme : la structure varie
  (nombre d'arrêts, espacement, courbe, coupes nettes), pas seulement la palette.
- **Créer un cadre** — pose un rectangle (ou un frame pour une maille) aux
  dimensions choisies, au centre de la vue.
- **Appliquer à la sélection** — remplit les calques sélectionnés. Une maille
  demande un frame, puisqu'elle a besoin d'enfants.
- **Contraste WCAG** — pire ratio du texte blanc et du texte noir sur le dégradé.

## Comment la maille est construite

Figma n'a pas de mesh gradient natif. Le plugin crée un frame au fond uni, plus
une ellipse par tache, chacune remplie d'un dégradé radial qui s'éteint en
alpha 0. Le rendu est celui de Prisme, et chaque tache reste sélectionnable et
modifiable dans Figma. Les taches sont ajoutées du dernier au premier, parce que
le premier calque CSS est celui du dessus.

Une nouvelle application sur un frame supprime d'abord les taches précédentes
(reconnues à leur nom `Tache #…`) pour ne pas les empiler.

## Géométrie des dégradés — état de la vérification

`gradientTransform` envoie l'espace normalisé de l'objet vers l'espace du
dégradé. Les conventions ne sont pas celles du CSS, elles ont donc été mesurées
dans un vrai fichier Figma plutôt que supposées :

| Cas | État |
|---|---|
| Linéaire, tous angles | **Vérifié** — identique au rendu CSS à 0°, 45°, 90°, 180° |
| Radial cercle et ellipse | **Vérifié** — identique au rendu CSS, centre décentré compris |
| Conique, cadre carré | **Vérifié** — l'identité Figma démarre à 3 h, le conique CSS à midi, d'où le décalage de 90° ; confirmé à deux angles |
| Conique, cadre non carré | **Dérivé, pas encore confirmé** — la compensation de format (`k = H / W`) suit la démonstration mais la mire de contrôle n'a pas pu être relancée |

Sur un cadre carré le conique est exact. Sur un cadre très allongé, les angles
intermédiaires peuvent être légèrement décalés ; le point de départ, lui, est bon.

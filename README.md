# Prisme

Générateur de dégradés CSS avec animation, en un seul fichier HTML autonome.
Aucune dépendance, aucune installation : ouvrez `index.html` dans un navigateur.

## Ce que ça fait

- **Quatre types de dégradé** — `linear`, `radial`, `conic`, et **maille** : plusieurs
  `radial-gradient` transparents superposés sur un fond uni, pour ces nappes lumineuses
  qu'un dégradé simple ne sait pas produire. Les taches se déplacent à la souris
  directement sur l'aperçu, ou aux flèches du clavier.
- **Générateur à 13 familles** — chaque famille a sa propre structure, pas seulement sa
  palette : nombre d'arrêts, espacement, courbe de répartition, type de dégradé et coupes
  nettes changent de l'une à l'autre. Maille profonde, bandes nettes, halo, spectre,
  crépuscule, monochrome, triade, pastel givré, terre cuite… Tirage au hasard ou famille
  imposée, avec animation assortie en option.
- **Cinq mouvements** — flux, rotation d'angle, pulsation, défilement de teintes, ou fixe.
  Durée, courbe d'accélération et aller-retour réglables.
- **Contrôle de lisibilité** — ratio de contraste WCAG du texte blanc et du texte noir
  dans le pire cas du dégradé, avec superposition de texte d'essai sur l'aperçu.
- **Téléchargement** — image PNG jusqu'en 3840 × 2160 (le dégradé est redessiné sur un
  canevas, pas capturé à l'écran) et fichier CSS.
- **Mémoire** — enregistrement nommé des dégradés dans le navigateur, rappel en un clic,
  et reprise automatique du dernier réglage à la réouverture.
- **CSS prêt à coller** — l'aperçu et le code exporté partagent exactement les mêmes règles,
  y compris les `@keyframes` et le repli `prefers-reduced-motion`.

## Notes techniques

La rotation d'angle utilise `@property` pour rendre une variable `<angle>` interpolable
(Chrome, Edge, Safari 16.4+, Firefox 128+). Sans ce support, le dégradé s'affiche
correctement mais reste fixe.

Les taches de la maille fondent vers `rgba(<couleur>, 0)` et non vers `transparent` :
l'interpolation sRGB vers `transparent` ferait virer la tache au gris en cours de route.

L'accent de l'interface est dérivé de la couleur la plus saturée du dégradé en cours, avec
une luminosité bornée par thème pour rester lisible en clair comme en sombre.

Publié comme Artifact, le téléchargement passe par la capacité `downloads` de l'hôte ;
ouvert en local ou hébergé, il passe par un lien de téléchargement classique.

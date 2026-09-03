# Prisme

Générateur de dégradés CSS avec animation, en un seul fichier HTML autonome.
Aucune dépendance, aucune installation : ouvrez `index.html` dans un navigateur.

## Ce que ça fait

- **Cinq types de dégradé** — `linear`, `radial`, `conic`, **maille**, et **onde** :
  un dégradé répété puis déformé par une onde (dents de scie, sinusoïde ou râteau)
  et flouté. Calculé sur un canevas, sans équivalent CSS — la sortie devient alors
  une fonction JavaScript réutilisable telle quelle.
- **La maille** : plusieurs
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
- **Téléchargement** — image PNG jusqu'en 3840 × 2160, **vidéo MP4 en boucle** (WebM en
  repli) relue dans un lecteur avant d'être enregistrée, et fichier CSS. Le dégradé est redessiné sur un canevas, pas capturé à l'écran :
  la vidéo couvre exactement un cycle complet, donc elle boucle sans à-coup.
- **Mémoire** — enregistrement nommé des dégradés dans le navigateur, rappel en un clic,
  et reprise automatique du dernier réglage à la réouverture.
- **CSS prêt à coller** — l'aperçu et le code exporté partagent exactement les mêmes règles,
  y compris les `@keyframes` et le repli `prefers-reduced-motion`.

## L'onde, en deux mots

Le long de l'axe du dégradé, toutes les lignes portent la même rampe, simplement
décalée par l'onde. Le rendu peint donc la rampe une seule fois dans une bande
d'un pixel de haut, puis la recopie ligne par ligne avec son décalage — ce qui
rend l'aperçu animable en temps réel là où un calcul pixel par pixel ramerait.

## Ce qui garde l'aperçu vif

Trois choix pèsent sur la réactivité :

- **Rendu paresseux.** Sans animation, le canevas de l'onde n'est repeint qu'au
  changement de réglage. Repeindre soixante fois par seconde une image fixe
  chauffait la machine pour rien.
- **Chemin léger pendant qu'on fait glisser un curseur.** L'aperçu suit
  immédiatement ; la reconstruction de la liste des couleurs, le calcul du
  contraste et la réécriture du CSS attendent la fin du geste.
- **Surface peinte réduite.** Une tache de maille s'éteint en alpha 0 bien avant
  le bord : la peindre sur trois fois la largeur du cadre déposait neuf fois trop
  de pixels. Et l'onde, quand elle est floue, est calculée en réduit puis
  agrandie — son coût cesse alors de dépendre de la taille d'export.

## Notes techniques

La rotation d'angle utilise `@property` pour rendre une variable `<angle>` interpolable
(Chrome, Edge, Safari 16.4+, Firefox 128+). Sans ce support, le dégradé s'affiche
correctement mais reste fixe.

Les taches de la maille fondent vers `rgba(<couleur>, 0)` et non vers `transparent` :
l'interpolation sRGB vers `transparent` ferait virer la tache au gris en cours de route.

L'accent de l'interface est dérivé de la couleur la plus saturée du dégradé en cours, avec
une luminosité bornée par thème pour rester lisible en clair comme en sombre.

La vidéo est produite par `MediaRecorder` sur un canevas redessiné image par image. Les
courbes d'accélération CSS sont réimplémentées en JavaScript (résolution de Bézier cubique)
et `hue-rotate` est appliqué via sa matrice de la spécification Filter Effects, pour que la
vidéo suive exactement le rythme et les teintes de l'aperçu. L'enregistrement se fait en
temps réel : une boucle de 20 s prend 20 s.

Publié comme Artifact, le téléchargement passe par la capacité `downloads` de l'hôte ;
ouvert en local ou hébergé, il passe par un lien de téléchargement classique.

---

## Autres outils du dépôt

- `figma-plugin/` — Prisme en plugin Figma.
- `magnific/` — passer une page d'illustrations Figma dans Magnific en lot,
  par clé API ou par le MCP Magnific. Voir [`magnific/README.md`](magnific/README.md).

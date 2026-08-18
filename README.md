# Prisme

Générateur de dégradés CSS avec animation, en un seul fichier HTML autonome.
Aucune dépendance, aucune installation : ouvrez `index.html` dans un navigateur.

## Ce que ça fait

- **Trois types de dégradé** — `linear-gradient`, `radial-gradient`, `conic-gradient`,
  avec angle, forme du foyer et position du centre.
- **Jusqu'à six arrêts de couleur** — glissés à la souris sur le rail, réglés au clavier
  (flèches, `Home`/`Fin`, `Suppr`), ou saisis en hexadécimal. Un clic sur le rail insère
  un arrêt à la couleur interpolée, sans casser le dégradé.
- **Cinq mouvements** — flux, rotation d'angle, pulsation, défilement de teintes, ou fixe.
  Durée, courbe d'accélération et aller-retour réglables.
- **Contrôle de lisibilité** — ratio de contraste WCAG du texte blanc et du texte noir
  dans le pire cas du dégradé, avec superposition de texte d'essai sur l'aperçu.
- **CSS prêt à coller** — l'aperçu et le code exporté partagent exactement les mêmes règles,
  y compris les `@keyframes` et le repli `prefers-reduced-motion`.

## Notes techniques

La rotation d'angle utilise `@property` pour rendre une variable `<angle>` interpolable
(Chrome, Edge, Safari 16.4+, Firefox 128+). Sans ce support, le dégradé s'affiche
correctement mais reste fixe.

L'accent de l'interface est dérivé de l'arrêt le plus saturé du dégradé en cours, avec
une luminosité bornée par thème pour rester lisible en clair comme en sombre.

# Règles d'illustration Mezze

Dérivées des illustrations existantes, par mesure et non à l'œil. Chaque chiffre
vient d'un relevé sur six fichiers : carotte, tomate, brocoli, banane, croissant,
aubergine.

Les règles se partagent en deux. Certaines, Magnific sait les tenir si on les lui
demande — la composition, le cadrage, la nature du trait. D'autres, il ne les
tient pas, quoi qu'on écrive dans le prompt : un rendu porte 15 000 à 20 000
teintes là où une illustration Mezze en porte huit, et son contour ondule. Celles-là
sont **imposées après coup** par `vectoriser.py`.

---

## Ce qu'on demande au modèle

### Cadrage

- Carré, sujet **centré**.
- Le sujet occupe **~70 % du cadre** (relevé : 58 % à 84 %).
- Boîte englobante proche du carré — ratio largeur/hauteur médian **1,00**
  (relevé : 0,83 à 1,31).
- Marge nette sur les quatre côtés. **Rien n'est rogné.**
- Fond **blanc uni**. Aucune ombre portée, aucun reflet, aucune texture.

### Trait

- Un **contour noir fermé** autour de la silhouette.
- **Et autour de chaque élément distinct qui se superpose** : chaque foliole des
  fanes, chaque pointe du calice. Ce ne sont pas des hachures, ce sont des
  contours d'objets.
- **Épaisseur constante.** Le trait ne s'affine ni ne s'épaissit.

### Couleur et modelé

- **Aplats francs**, deux à trois tons par teinte. Aucun dégradé, aucun flou.
- Les marques intérieures — stries, pépins, reflets — sont peintes dans un ton
  **plus sombre ou plus clair de la même teinte**, jamais en noir.
- **Pas de hachure noire décorative.**
- **5 à 15 aplats** hors contour, médiane 8.

### Le prompt

```text
A single {ingredient}, centred, seen from a simple three-quarter or side angle.

Flat vector food illustration. Uniform black outline of constant thickness
around the silhouette, and a separate closed outline around each distinct
overlapping element. Flat colour fills with two or three hard-edged tone
steps — no gradients, no blur. Interior marks such as ridges, seeds or
highlights are drawn in a darker or lighter tint of the same hue, never in
black. No decorative black hatching.

Plain white background. No cast shadow, no reflection, no texture. The whole
object is visible with clear margin on every side, filling about 70% of the
square frame. Nothing is cropped.
```

Modèle **recraft-v4-1**, format **1:1**, avec **12 illustrations existantes en
référence de style** — le maximum accepté. Une seule référence ne suffit pas à
ancrer le langage de trait.

---

## Ce qu'on impose après coup

Ces règles-là ne se négocient pas avec le modèle, elles s'appliquent au rendu.

### Palette

Chaque pixel est projeté sur l'emplacement de palette le plus proche, jugé en
Lab. **Les familles autorisées sont déclarées par ingrédient** : sans cette
restriction, un citron finit orange et un champignon rose saumon — la distance
colorimétrique ne sait pas ce qu'elle regarde.

    --familles jaune,vert     citron
    --familles brun,creme     champignon
    --familles rouge,vert     tomate

### Contour

Reconstruit, jamais décalqué. Les pixels noirs sont rendus aux couleurs
voisines, la silhouette reçoit un aplat de fondation — plus aucun trou possible —
et le trait est retracé par-dessus à **26 unités sur 1600**, soit 1,6 % du côté.

C'est la médiane du relevé (22,8 à 30,5) et l'épaisseur de la banane et du
croissant, les deux illustrations dont le trait était déjà le plus régulier.

### Noir unique

**`#1E1E1D`**, le noir de la charte, pour toutes les illustrations. Il remplace
à lui seul les 24 noirs de contour relevés sur six fichiers.

---

## Le relevé, en un tableau

| | mesuré sur les originaux | règle retenue |
|---|---|---|
| contour | 22,8 à 30,5 — écart ×1,34 | **26**, écart ×1,01 |
| traits intérieurs | 7,2 à 28,1 — écart ×3,89 | aucun trait décoratif |
| noirs de contour | 24 teintes différentes | **#1E1E1D** seul |
| aplats hors contour | 5 à 15 | 5 à 15, médiane 8 |
| occupation du cadre | 58 % à 84 % | **~70 %** |
| ratio de la boîte | 0,83 à 1,31 | **~1,00** |
| teintes par rendu brut | 15 000 à 20 000 | ramenées à 8 |

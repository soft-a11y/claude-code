# Illustrations Mezze

Illustrations vectorielles reprenant le style de la maquette Figma
[👨‍🍳 Mezze | Searchings](https://www.figma.com/design/nreRbYivAHcFn4LQTHHaHL/?node-id=3731-4880).

Ouvrir `index.html` pour la planche-contact.

## Contenu

`svg/` — une illustration par fichier, contours et aplats éditables.

| Fichier | Catégorie |
| --- | --- |
| `fruits.svg` | Fruits |
| `legumes.svg` | Légumes |
| `laitages.svg` | Laitages |
| `pain.svg` | Pain |
| `graine.svg` | Graine |
| `pates-riz-semoule.svg` | Pâtes / Riz / Semoules (en bocal) |
| `epices.svg` | Épices |
| `noix.svg` | Graine genre noix |
| `boissons.svg` | Boissons |
| `carotte.svg` | Carotte — planche d'essai ayant servi à caler le style |

## Règles de style

Relevées sur les 14 illustrations d'origine (carotte, saumon, lait, cheddar,
riz, farine, œufs, sauce tomate, sauce soja, épinard, pâtes, bacon, pain).

- **Format** : `viewBox="0 0 2048 1152"`, fond transparent. Dans Figma les
  illustrations sont posées sur `#444444` ; le fond ne fait pas partie du dessin.
- **Contour** : 22 px sur les silhouettes, 16–20 px sur les détails internes.
  Toujours `stroke-linejoin="round"` et `stroke-linecap="round"`.
- **Couleur du contour** : jamais du noir pur — une version très sombre et
  teintée de la couleur de l'objet (`#1F1E1B` sur l'orange, `#2A4B1A` sur le
  vert, `#231C15` sur le pain, `#2B1D0E` sur les fruits secs).
- **Aplats** : deux tons par matière (base + ombre), plus un éclat clair
  ponctuel. Aucun dégradé, aucune ombre portée.
- **Ombres et éclats** : posés en `clip-path` sur la silhouette, jamais
  détourés à la main.

Les originaux sont exportés avec les contours vectorisés (des formes pleines).
Ici les contours sont de vrais `stroke`, ce qui permet de changer l'épaisseur ou
la couleur du trait sans redessiner.

### Palette

| Rôle | Couleurs |
| --- | --- |
| Orange (carotte, agrume, jus) | `#FF8C11` `#FA7104` `#FFB45C` `#984D16` |
| Verts | `#9CBF4A` `#87B452` `#819D44` `#5E8F3A` `#4C7A2A` `#303D1C` `#2A4B1A` |
| Rouges | `#E5372C` `#E8402F` `#B62B22` `#F2705F` `#C0392B` |
| Crèmes et laitages | `#FAF0D9` `#E7DFCC` `#F0E1CB` `#E8E3D5` `#CABFAA` |
| Pains et céréales | `#C77C36` `#9B561B` `#E0A055` `#FDECCF` `#F0BE7C` |
| Fruits secs | `#A9793C` `#7E5426` `#E8CFA8` `#C9A46E` `#C98A57` |
| Bleu (lait) | `#82C9F9` `#3C8EC9` |

## Contrôle visuel

```sh
node tools/render.mjs              # toutes les illustrations
node tools/render.mjs fruits pain  # une sélection
```

Génère `tools/out/sheet.png`, une planche sur fond `#444444` — le même que Figma,
indispensable pour juger les contours sombres.

# Illustrations Mezze

Illustrations de catégorie pour la maquette Figma
[👨‍🍳 Mezze | Searchings](https://www.figma.com/design/nreRbYivAHcFn4LQTHHaHL/?node-id=3731-4880).

Ouvrir `index.html` pour la planche-contact.

## `svg/` — validées

Recomposées à partir des **tracés vectoriels d'origine** extraits de Figma. Le
style est exact parce que c'est le dessin d'origine : rien n'a été redessiné,
seuls le cadrage et la mise en scène changent.

| Fichier | Catégorie | Éléments d'origine réutilisés |
| --- | --- | --- |
| `legumes.svg` | Légumes | `CARROT`, `ÉPINARD` |
| `laitages.svg` | Laitages | `MILK`, `CHEDDAR`, `EGGS` |
| `pain.svg` | Pain | `BREAD` |
| `pates-riz-semoule.svg` | Pâtes / Riz / Semoules | `PASTA`, `RICE`, `FLOUR` |

## `brouillons/` — non validées

Illustrations **redessinées à la main** en SVG, faute d'élément d'origine
correspondant. Elles respectent les règles de trait ci-dessous mais n'ont pas la
qualité de dessin des originales : elles lisent comme des icônes plates, pas
comme les illustrations Mezze. À reprendre par un illustrateur.

`fruits.svg` · `graine.svg` · `epices.svg` · `noix.svg` · `boissons.svg`
· `carotte.svg` (essai de style)

Les 14 illustrations d'origine ne couvrent aucune de ces cinq catégories :
aucun fruit, aucune graine, aucune épice, aucun fruit à coque, aucune boisson
hors lait.

## Règles de style

Relevées sur les 14 illustrations d'origine (carotte, saumon, lait, cheddar,
riz, farine, œufs ×2, sauce tomate, sauce soja, épinard, pâtes, bacon, pain).

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

### Palette

| Rôle | Couleurs |
| --- | --- |
| Orange (carotte, cheddar) | `#FF8C11` `#FA7104` `#E87B0A` `#984D16` |
| Verts | `#9CBF4A` `#87B452` `#819D44` `#303D1C` `#2A4B1A` |
| Rouges | `#E71314` `#FD181A` `#D40307` |
| Crèmes et laitages | `#FAF0D9` `#E7DFCC` `#F0E1CB` `#E8E3D5` `#CABFAA` |
| Pains et céréales | `#C77C36` `#9B561B` `#EFC081` `#FDECCF` `#7C4012` |
| Bleu (lait) | `#82C9F9` `#3C8EC9` |

## Contrôle visuel

```sh
node tools/render.mjs                 # tout
node tools/render.mjs legumes pain    # une sélection
```

Génère `tools/out/sheet.png`, une planche sur fond `#444444` — le même que Figma.
Indispensable : sur un fond plus sombre, les contours disparaissent et on juge mal.

---
type: fiche-de-production
projet: Mezze — illustrations d'ingrédients
version: 2
maj: 2026-09-04
statut: vivante — s'améliore par essais ratifiés
---

# Fiche — illustration d'ingrédient Mezze (recette d'appel Magnific)

> Pour l'agent : **cette fiche n'est pas un prompt, c'est une recette d'appel.**
> Le style Mezze ne se décrit pas en texte, il se transmet par **image de référence + modèle fixe**.
> Ne réécris jamais le prompt en anglais « pour aider ». N'invente aucune description de style.
> Change UNIQUEMENT le nom de l'ingrédient.
>
> **Cette fiche est vivante.** Tu la mets à jour, mais selon le protocole du § 7 : les essais s'enregistrent
> librement (§ 5), les amendements se proposent (§ 6), et seule une ratification humaine touche aux § 1 à 4.

---

## PARTIE A — La recette (figée ; ne change que par amendement ratifié, § 6)

### 1. Paramètres

| Paramètre | Valeur | Pourquoi |
|---|---|---|
| Outil | `images_generate` (MCP Magnific) | — |
| `mode` | `gpt-2` | Modèle des 14 validées. Un autre modèle = un autre trait. |
| `references` | voir § 2 | Le style est DANS les images, pas dans le texte. |
| `aspectRatio` | `1:1` | Objet centré sur fond blanc ; le 16:9 obligeait à recadrer. |
| `count` | `3` | Trois variantes par appel, choix à l'œil. Jamais 3 appels séparés. |
| `folderReference` | `11e9cd40-50af-4815-bf3d-12e468fdba93` (projet MEZZE) | Tout au même endroit. À repasser à CHAQUE appel. |
| `prompt` | `dans le même style crée moi <ingrédient>` | Mot pour mot. Rien d'autre. |

**Nommer l'ingrédient, pas le style.** Le seul mot qui change est le nom, et il doit désigner la chose
comestible sans ambiguïté : `un avocat (le fruit)` et non `un avocat` (le modèle a dessiné un juriste) ;
`des carrés de chocolat noir` et non `du chocolat noir` (il a dessiné une tablette emballée avec du texte).
Préciser la forme reste dans le nom ; décrire le trait, non.

### 2. Références (le vrai « style »)

Toujours passer, dans cet ordre :

```json
[
  { "type": "image", "identifier": "bxUXbCH5Y2" },
  { "type": "image", "identifier": "<validée la plus proche par nature, voir § 8>" }
]
```

- `bxUXbCH5Y2` = `reference-img1`, la carotte validée. **Ancre de style, ne jamais l'enlever.**
- 🔴 **Type `image`, jamais `style`** (amendement A1). Le type `style` transfère la PALETTE de la carotte
  (fonds orange, verts sombres, emballages), pas sa manière de dessiner. Le type `image` reproduit le trait.
- La deuxième référence est une **validée proche par nature** de l'ingrédient demandé
  (légume-racine pour la pomme de terre, flacon pour l'huile, herbe pour le persil). Elle guide la forme.
- Maximum 12 références ; trois ou quatre bien choisies valent mieux que douze.

### 3. Appel type

```
images_generate(
  prompt: "dans le même style crée moi un poireau",
  mode: "gpt-2",
  aspectRatio: "1:1",
  count: 3,
  folderReference: "11e9cd40-50af-4815-bf3d-12e468fdba93",
  references: [
    { type: "image", identifier: "bxUXbCH5Y2" },
    { type: "image", identifier: "<id de l'épinard validé>" }
  ]
)
```

Puis `creations_show` sur les 3 identifiants, puis `creations_wait`. Puis § 4, puis enregistrer l'essai au § 5.

### 4. Grille de contrôle (à l'œil, AVANT de proposer)

Une variante passe si TOUT est vrai. Sinon elle ne se corrige pas par retouche : on relance.

Témoins visuels, à regarder avant de juger : `temoins/set-valide-figma.png` (les 14 validées) et
`temoins/carotte-reference-bxUXbCH5Y2.jpg` (l'ancre de style, en grand).

- [ ] **Contour** : noir, épais, uniforme, fermé sur toute la silhouette.
- [ ] **Remplissage** : aplats, une couleur de base + une seule zone d'ombre plus foncée, plate. Aucun dégradé, aucune aquarelle, aucun grain.
- [ ] **Texture** : quelques traits fins de la couleur foncée (nervures, stries, hachures courtes). Pas de reflets blancs brillants.
- [ ] **Fond** : blanc uni, rien d'autre. Pas d'ombre portée au sol.
- [ ] **Cadrage** : un seul objet, centré, légèrement en trois-quarts, marges égales.
- [ ] **Lecture** : identifiable en un coup d'œil à 60 px de large (taille d'usage dans l'app).
- [ ] **Pas de texte**, sauf si l'objet en porte dans le set validé (la brique « LAIT »).

Si aucune des 3 variantes ne passe : changer la **deuxième** référence (§ 2), pas le prompt. Deux relances maximum, ensuite on remonte à l'humain.

### Ce que l'agent ne fait pas

- Il ne réécrit pas le prompt, ne le traduit pas, n'ajoute pas de « flat vector, thick outline… ». Ces mots sont déjà dans les images.
- Il ne change pas de modèle, même si une génération échoue.
- Il n'enchaîne pas `images_retouch` ou `images_variations` sur un raté : on relance.
- Il ne détoure pas (`images_remove_background`) avant validation.
- Il ne génère jamais plus de 3 variantes par appel ni plus de 3 appels par ingrédient sans demander.
- **Il ne modifie jamais la Partie A de lui-même.**

---

## PARTIE B — La mémoire (vivante ; l'agent y écrit à chaque essai)

### 5. Journal des essais

Une ligne par appel, rempli **immédiatement après** `creations_wait`, avant même de montrer les images.
Le verdict est celui de l'humain, jamais celui de l'agent. Tant qu'il n'a pas tranché : `en attente`.

| Date | Ingrédient | Identifiants | 2ᵉ référence utilisée | Verdict humain | Remarque |
|---|---|---|---|---|---|
| 04/09 | poireau | `4RYyHfS9Aa` `Sy3lv86Ub8` `eICD47LdqL` | aucune (carotte en type `style`) | rejeté | 1 sur 3 proche du style, les autres fond orange : palette transférée |
| 04/09 | avocat | `gOishENSXO` `lJ6LmCMgv9` `KL7be8akqp` | aucune (carotte en type `style`) | rejeté | deux juristes, un avocat-mascotte en costume ; nom ambigu + palette |
| 04/09 | chocolat noir | `UPRgaxGwny` `dtEp90zXSL` `xSP1ob3jfW` | aucune (carotte en type `style`) | rejeté | tablettes emballées avec texte, fonds orange/vert |
| 04/09 | poireau (test A1) | `lJ6Lqnfgv9` `O6G7xMJynm` | aucune (carotte en type `image`) | en attente | les deux dans le style : fond blanc, contour, aplats, ombre plate |
| 04/09 | avocat (le fruit) — test A1+A2 | `nVBzB72YQD` `KL757I4kqp` | aucune (carotte en type `image`) | en attente | 2/2 dans le style : fond blanc, contour noir épais et fermé, aplat + une ombre plate, stries fines sur la peau, objet unique centré. Le juriste a disparu. Réserve : le noyau porte une tache claire qui tire vers le dégradé. Appel parti à 2 variantes sur 3, plafond d'usage `gpt-2` atteint. |
| 04/09 | carrés de chocolat noir | — | — | non lancé | Plafond d'usage `gpt-2` atteint, rien facturé. À reprendre. |

### 6. Amendements proposés

Quand plusieurs essais montrent la même chose (une référence qui guide mieux, un ingrédient qui refuse le 1:1,
une exception à la grille), l'agent **propose** ici. Il ne l'applique pas.

| N° | Date | Ce que ça change (§ visé) | Preuve (lignes du § 5) | Statut |
|---|---|---|---|---|
| A1 | 04/09 | § 2 : références en type `image`, plus jamais `style` | poireau `style` (1/3) vs poireau `image` (2/2) | appliqué sur test comparatif ; à confirmer par Rémy |
| A2 | 04/09 | § 1 : le nom désigne la chose comestible sans ambiguïté (forme incluse) | avocat → juristes ; chocolat → tablette emballée. **Contre-épreuve du 04/09 : « un avocat (le fruit) » donne 2/2 dans le style, contre 0/3 pour « un avocat ».** | proposé — preuve faite sur l'avocat, reste à confirmer sur le chocolat |
| A3 | 04/09 | § 4 : les deux témoins visuels sont introuvables. Le nœud Figma `4080:57730` n'existe plus dans le fichier, et `temoins/set-valide-figma.png` comme `temoins/carotte-reference-bxUXbCH5Y2.jpg` ne sont pas versionnés. La grille se juge donc à l'aveugle. | Essai avocat du 04/09 | proposé |
| A4 | 04/09 | § 1 ou § 3 : `gpt-2` a un plafond d'usage propre, distinct du solde de crédits. Il coupe un appel en cours de route — l'avocat est sorti à 2 variantes sur 3 — et rejette les suivants sans rien facturer. Prévoir la reprise. | Essais avocat et chocolat du 04/09 | proposé |

Un amendement `ratifié` est ensuite reporté dans la Partie A par l'agent, **en citant son numéro** dans la colonne « Pourquoi »
ou en note sous le paragraphe modifié. `version` en tête de fiche s'incrémente.

### 7. Protocole de mise à jour

1. **Chaque appel** → une ligne au § 5, verdict `en attente`.
2. **L'humain tranche** → l'agent reporte le verdict au § 5 et, si `retenu`, ajoute l'identifiant au § 8.
3. **Une régularité se dégage** (≥ 2 essais concordants) → l'agent rédige une ligne au § 6, statut `proposé`, et le dit à l'humain.
4. **L'humain ratifie** → l'agent modifie la Partie A, cite le numéro d'amendement, incrémente `version` et `maj`.
5. **L'humain refuse** → statut `refusé`, la ligne reste : c'est une piste qu'on ne rouvre pas.

Ce qui ne passe jamais par ce protocole : la ratification elle-même. L'agent propose, l'humain ratifie.

### 8. Registre des validées

Point de départ : le set validé dans Figma (frame « Illus ingrédients », node `4080:57730`, 14 pièces) :
carotte · lait · saumon · cheddar · pain · riz · farine · œufs (×2) · sauce tomate · sauce soja · épinard · pâtes · bacon.

| Ingrédient | Identifiant Magnific | Validé par | Date | Sert de 2ᵉ référence pour… |
|---|---|---|---|---|
| carotte | `bxUXbCH5Y2` (upload de référence) | — | — | ancre de style (toujours) |
| | | | | |

Une validée neuve devient une **référence candidate** pour les ingrédients qui lui ressemblent. La dernière colonne
se remplit au fil des essais du § 5 : c'est ainsi que la fiche apprend quelle référence guide quoi.

---

## Historique de la fiche

| Version | Date | Changement | Amendement |
|---|---|---|---|
| 1 | 2026-09-04 | Création : recette déduite des 14 validées et des 51 générations du 03/09. Non testée. | — |
| 2 | 2026-09-04 | Références en type `image` ; règle de nommage de l'ingrédient ; journal des 4 premiers essais. | A1, A2 |

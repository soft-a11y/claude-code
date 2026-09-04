---
type: fiche-de-production
projet: Mezze — illustrations d'ingrédients
version: 1
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

### 2. Références (le vrai « style »)

Toujours passer, dans cet ordre :

```json
[
  { "type": "style", "identifier": "bxUXbCH5Y2" },
  { "type": "image", "identifier": "<validée la plus proche par nature, voir § 4>" }
]
```

- `bxUXbCH5Y2` = `reference-img1`, la carotte validée. **Ancre de style, ne jamais l'enlever.**
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
    { type: "style", identifier: "bxUXbCH5Y2" },
    { type: "image", identifier: "<id de l'épinard validé>" }
  ]
)
```

Puis `creations_show` sur les 3 identifiants, puis `creations_wait`. Puis § 4, puis enregistrer l'essai au § 5.

### 4. Grille de contrôle (à l'œil, AVANT de proposer)

Une variante passe si TOUT est vrai. Sinon elle ne se corrige pas par retouche : on relance.

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

| Date | Ingrédient | Identifiants (3) | 2ᵉ référence utilisée | Verdict humain | Remarque |
|---|---|---|---|---|---|
| 2026-09-04 | Poireau | `4RYyHfS9Aa` `Sy3lv86Ub8` `eICD47LdqL` | aucune — registre § 8 vide | `en attente` | Recette suivie sinon à la lettre. |
| 2026-09-04 | Avocat | `gOishENSXO` `lJ6LmCMgv9` `KL7be8akqp` | aucune — registre § 8 vide | `en attente` | Fruit à noyau, coupé ou entier laissé au modèle. |
| 2026-09-04 | Chocolat noir | `UPRgaxGwny` `dtEp90zXSL` `xSP1ob3jfW` | aucune — registre § 8 vide | `en attente` | Choisi pour éprouver les tons sombres, absents de la palette. |

### 6. Amendements proposés

Quand plusieurs essais montrent la même chose (une référence qui guide mieux, un ingrédient qui refuse le 1:1,
une exception à la grille), l'agent **propose** ici. Il ne l'applique pas.

| N° | Date | Ce que ça change (§ visé) | Preuve (lignes du § 5) | Statut |
|---|---|---|---|---|
| A1 | 2026-09-04 | § 2 — prévoir le cas où aucune validée n'existe encore pour la nature demandée : autoriser l'ancre seule, ou nommer une validée de repli. En l'état la recette n'est pas applicable telle quelle tant que le § 8 est vide. | Les 3 essais du 2026-09-04 | `proposé` |

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

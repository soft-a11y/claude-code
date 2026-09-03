# Figma → Magnific

Passer toute une page d'illustrations Figma dans Magnific en un seul geste,
plutôt qu'une par une dans l'interface.

L'outil lit les frames de premier niveau d'une page Figma, les exporte en PNG,
les envoie à Magnific avec les mêmes réglages pour toutes, attend les tâches et
range les rendus. Il reprend là où il s'est arrêté et ne repaie jamais deux fois
la même génération.

Aucune dépendance, rien à installer : Node 18 ou plus suffit.

## Deux voies

Magnific propose deux authentifications, et l'outil couvre les deux.

| | Voie **clé API** | Voie **MCP** (OAuth) |
|---|---|---|
| Authentification | `MAGNIFIC_API_KEY` | connexion à votre compte, pas de clé |
| Lancement | `magnific.mjs lancer` | `magnific.mjs exporter`, puis Claude Code |
| Sans surveillance | oui, de bout en bout | non, Claude Code pilote |
| Bon pour | les lots réguliers, un cron | un lot ponctuel, l'exploration des réglages |

Les deux partent du même export Figma et des mêmes recettes.

## Mise en route

### 1. Le jeton Figma (les deux voies)

Figma → *Settings* → *Security* → *Personal access tokens* → nouveau jeton avec
la portée **File content: read**.

```bash
export FIGMA_TOKEN=figd_…
```

### 2. Vérifier ce qui sera traité

```bash
node magnific/magnific.mjs liste
```

Affiche les frames de la page, leur identifiant et le nom de fichier qui sera
utilisé. Les noms en double dans Figma (« Rice », « Pasta », « Eggs »…) sont
suffixés `-2`, `-3` dans l'ordre du document, donc stables d'un passage à l'autre.

### 3a. Voie clé API

Créez une clé sur [magnific.com/user/organization/api-keys](https://www.magnific.com/user/organization/api-keys).

```bash
export MAGNIFIC_API_KEY=…

# répétition générale : exporte tout, n'appelle pas Magnific, ne coûte rien
node magnific/magnific.mjs lancer --sec

# un seul essai, pour juger du rendu avant d'engager le lot
node magnific/magnific.mjs lancer --seulement Carrots

# le lot complet
node magnific/magnific.mjs lancer
```

### 3b. Voie MCP

```bash
claude mcp add --transport http magnific https://mcp.magnific.com -s user
# puis, dans Claude Code : /mcp → magnific → Authenticate
```

```bash
node magnific/magnific.mjs exporter
```

Puis, dans Claude Code : **« Suis magnific/PILOTE-MCP.md »**. Le fichier dit à
Claude de vérifier le solde, de faire un essai avant le lot, et de ranger les
rendus au bon endroit.

## Résultat

```
magnific/sortie/
  source/      les PNG exportés de Figma (cache : réutilisés au passage suivant)
  rendu/       les images renvoyées par Magnific
  etat.json    ce qui est fait, en cours, en échec
  taches.json  le carnet lu par la voie MCP
```

`node magnific/magnific.mjs etat` résume le dernier passage et détaille les échecs.

## Recettes

Une recette, c'est un point d'entrée Magnific et ses réglages, dans
`config.json`. Trois sont fournies :

- **`net-fidele`** — *Upscaler Precision*. Plus grand, plus net, rien d'inventé.
  Le choix sûr quand l'illustration doit rester exactement elle-même.
- **`illustration-detaillee`** *(par défaut)* — *Upscaler Creative* réglé pour
  l'illustration : `resemblance` haute, `creativity` basse. Garde le trait noir
  et les aplats, ajoute de la matière.
- **`illustration-realiste`** — *Upscaler Creative* lâché : pousse l'illustration
  vers un rendu photo. Change beaucoup l'image, à réserver aux essais.

```bash
node magnific/magnific.mjs lancer --recette net-fidele
```

Dans le champ `prompt`, `{nom}` est remplacé par le nom de la frame Figma :
chaque illustration reçoit donc son propre prompt (« Carrots, flat vector food
illustration… ») sans que vous ayez à les écrire à la main.

Pour ajouter une recette, copiez un bloc de `recettes` et changez `endpoint` et
`params`. Tout point d'entrée Magnific en `/v1/ai/<endpoint>` qui suit le schéma
POST → `task_id` → GET fonctionne tel quel — `image-style-transfer`, par exemple.

Les réglages `creativity`, `hdr`, `resemblance` et `fractality` vont de −10 à
+10. Sur des aplats vectoriels, `smart_grain` est laissé à 0 : le grain se voit
comme du bruit sur une couleur unie.

## La limite des 25,3 Mpx

Magnific refuse une sortie de plus de 25,3 millions de pixels. Vos frames font
1600 × 1600, soit 2,56 Mpx :

| `figma.echelle` | source | `2x` | `4x` | `8x` |
|---|---|---|---|---|
| 1 | 1600 px | 10,2 Mpx ✅ | 41 Mpx ❌ | ❌ |
| 0,5 | 800 px | 2,6 Mpx ✅ | 10,2 Mpx ✅ | 41 Mpx ❌ |

L'outil calcule ce produit avant le premier appel et s'arrête net s'il dépasse,
plutôt que de vous faire découvrir l'erreur après trente crédits dépensés. Pour
monter à `4x`, baissez `figma.echelle` à `0.5`.

## Crédits

Chaque génération débite le compte Magnific. Deux réflexes :

- `--sec` et `--seulement <nom>` avant le lot complet ;
- sur la voie MCP, `account_balance` et surtout le champ `unlimitedAppliesHere` :
  s'il vaut `false`, un plan illimité ne couvre pas les appels MCP et chaque
  génération est facturée.

Un passage interrompu est repris à partir des `task_id` enregistrés dans
`etat.json` : les tâches déjà payées sont récupérées, pas relancées.

## Options

| | |
|---|---|
| `--config <fichier>` | autre configuration (défaut `magnific/config.json`) |
| `--recette <nom>` | remplace la recette de la configuration |
| `--filtre <regex>` | ne garder que les frames dont le nom correspond |
| `--seulement a,b,c` | ne garder que ces noms de frames |
| `--limite <n>` | les `n` premières — pratique pour un essai |
| `--sec` | tout préparer sans appeler Magnific |
| `--refaire` | ignorer le cache, relancer les tâches |
| `--reexporter` | forcer le réexport des PNG depuis Figma |

## Remettre les rendus dans Figma

L'API REST de Figma est en lecture seule pour les images : elle ne peut pas
réinjecter les rendus dans le fichier. Deux chemins :

- glisser le contenu de `rendu/` dans la page Figma — les noms de fichiers
  reprennent ceux des frames, l'appariement est immédiat ;
- ou un petit plugin Figma qui lit le dossier et remplit chaque frame, sur le
  modèle de `figma-plugin/` à la racine du dépôt.

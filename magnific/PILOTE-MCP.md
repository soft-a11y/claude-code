# Pilote MCP — passer le lot dans Magnific sans clé API

Marche à suivre pour Claude Code, une fois le serveur `magnific` connecté
(`claude mcp add --transport http magnific https://mcp.magnific.com -s user`,
puis `/mcp` → `magnific` → *Authenticate*).

Les PNG et le carnet de tâches viennent de :

```bash
FIGMA_TOKEN=… node magnific/magnific.mjs exporter
```

Pour lancer, il suffit de dire à Claude Code : **« Suis magnific/PILOTE-MCP.md ».**

---

## Instructions

1. **Vérifier le solde avant tout.** Appelle `account_balance`. Affiche le solde et
   le champ `unlimitedAppliesHere`. **S'il vaut `false`, chaque génération débite
   des crédits même sur un plan illimité** : annonce le nombre de tâches et le
   coût probable, et attends une confirmation explicite avant de continuer.

2. **Lire le carnet.** Ouvre `magnific/sortie/taches.json`. Il contient
   `outilMcp`, `dossierRendu`, et un tableau `taches`, chacune avec `nom`,
   `source` (chemin du PNG exporté), `rendu` (chemin de sortie attendu) et
   `params` (les réglages Magnific, prompt déjà personnalisé par illustration).

3. **Faire un essai d'abord.** Traite **une seule** tâche, montre le rendu, et
   demande validation avant de lancer le reste. Un lot de quarante mal réglé,
   ce sont quarante crédits perdus.

4. **Estimer avant de dépenser.** `simulate_cost` avec `tool: "images_upscale"`
   et les mêmes arguments : il ne facture rien. Le coût dépend de la taille de
   sortie, par paliers (S / M / L / XL). Multiplie par le nombre de tâches et
   compare au solde avant d'engager le lot.

5. **Pour chaque tâche :**
   - téléverse `source` (`creations_request_upload` → `creations_finalize_upload` ;
     `creations_upload_image` ne prend qu'une URL publique) ;
   - appelle l'outil nommé dans `outil` (`images_upscale`) avec le
     `creationIdentifier` obtenu et les `params` de la tâche ;
   - attends la fin avec `creations_wait` (1 à 8 identifiants par appel) ;
   - enregistre le résultat dans le chemin `rendu` de la tâche.

   Les `params` du carnet sont **déjà au nommage MCP**, qui n'est pas celui de
   l'API REST. Pour mémoire, si vous comparez les deux :

   | API REST | outil MCP |
   |---|---|
   | `scale_factor` | `scale` |
   | `optimized_for: "art_n_illustration"` | `optimised: "ArtAndIllustration"` |
   | `/v1/ai/image-upscaler` | `mode: "creative"` |
   | `/v1/ai/image-upscaler-precision` | `mode: "ultra-sublime"` (ou `ultra-photo`) |
   | `sharpen`, `smart_grain`, `ultra_detail` | `sharpness`, `grain`, `ultraDetail` |

   Attention : les curseurs Precision n'ont pas la même échelle par défaut d'un
   côté et de l'autre (REST `sharpen` vaut 50 par défaut, MCP `sharpness` vaut 7).
   Ne transposez pas les valeurs d'un nommage à l'autre.

   Vérifie tout de même le schéma vivant avec `images_upscale_modes_list` avant
   le lot, et signale toute option que tu n'as pas pu transmettre.

6. **Ne refais pas le travail déjà fait.** Si le fichier `rendu` existe déjà,
   passe la tâche — sauf demande explicite de refaire.

7. **Y aller doucement.** Trois tâches en parallèle au plus, pour ne pas
   saturer le compte.

8. **Rendre compte à la fin :** ce qui est passé, ce qui a échoué et pourquoi,
   et le solde de crédits restant.

## Garde-fous

- Ne touche à rien en dehors de `magnific/sortie/`.
- N'invente pas de tâche absente du carnet : la liste des illustrations vient
  de Figma, pas de toi.
- En cas d'échec sur une illustration, note-le et continue les autres.

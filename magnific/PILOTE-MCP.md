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

4. **Pour chaque tâche :**
   - téléverse `source` (`creations_request_upload` → `creations_upload` →
     `creations_finalize_upload`) ;
   - appelle l'outil nommé dans `outilMcp` (`images_upscale` par défaut) avec
     l'image téléversée et les `params` de la tâche ;
   - attends la fin avec `creations_wait` (ou `creation_status` en boucle) ;
   - enregistre le résultat dans le chemin `rendu` de la tâche.

   Les `params` du carnet suivent le nommage de l'API REST Magnific
   (`scale_factor`, `optimized_for`, `engine`, `creativity`, `hdr`,
   `resemblance`, `fractality`, `prompt`). Le schéma de l'outil MCP peut
   différer : **lis le schéma exposé par `tools/list` et fais la correspondance**
   plutôt que de recopier les clés à l'aveugle. Signale toute option que tu n'as
   pas pu transmettre.

5. **Ne refais pas le travail déjà fait.** Si le fichier `rendu` existe déjà,
   passe la tâche — sauf demande explicite de refaire.

6. **Y aller doucement.** Trois tâches en parallèle au plus, pour ne pas
   saturer le compte.

7. **Rendre compte à la fin :** ce qui est passé, ce qui a échoué et pourquoi,
   et le solde de crédits restant.

## Garde-fous

- Ne touche à rien en dehors de `magnific/sortie/`.
- N'invente pas de tâche absente du carnet : la liste des illustrations vient
  de Figma, pas de toi.
- En cas d'échec sur une illustration, note-le et continue les autres.

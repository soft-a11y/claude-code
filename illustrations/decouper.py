#!/usr/bin/env python3
"""Découpe une planche d'illustrations légendée en vignettes carrées.

Magnific rend un lot entier sur une seule image : une grille d'ingrédients,
chacun sous-titré. Pour les verser dans Figma au format des illustrations
existantes, il faut les séparer — et laisser la légende de côté, puisque le nom
est déjà connu par le prompt.

Le découpage ne se fie pas aux intervalles blancs : d'une planche à l'autre ils
vont de 75 pixels à 20, et un seuil qui marche ici fait fusionner toutes les
rangées là. Il passe par les formes elles-mêmes — chaque tache d'encre est
isolée, les légendes sont écartées parce qu'elles ne portent aucune couleur et
qu'elles sont basses, puis les taches restantes sont regroupées en grille par
leurs centres. Les noms sont attribués dans l'ordre de lecture, celui du prompt.

    python3 illustrations/decouper.py planche.png --noms "Oignon,Ail,..." -o vignettes/
"""

import argparse
import signal
import sys
import unicodedata
from pathlib import Path

import numpy as np
from PIL import Image
from skimage.measure import label, regionprops
from skimage.morphology import dilation, disk

SEUIL_BLANC = 235


def slug(nom):
    base = unicodedata.normalize("NFD", nom)
    base = "".join(c for c in base if unicodedata.category(c) != "Mn").lower()
    return "".join(c if c.isalnum() else "-" for c in base).strip("-").replace("--", "-") or "sans-nom"


def grouper(centres, ecart_min):
    """Range des positions en groupes, en coupant sur les grands écarts."""
    ordre = sorted(range(len(centres)), key=lambda i: centres[i])
    groupes, courant = [], [ordre[0]]
    for precedent, i in zip(ordre, ordre[1:]):
        if centres[i] - centres[precedent] > ecart_min:
            groupes.append(courant)
            courant = []
        courant.append(i)
    groupes.append(courant)
    return groupes


def decouper(image, noms, cote, marge):
    a = np.asarray(image.convert("RGB"), dtype=np.int16)
    masque = a.min(axis=2) < SEUIL_BLANC
    sature = (a.max(axis=2) - a.min(axis=2)) > 30
    h, w = masque.shape

    # Un dessin est fait de plusieurs taches — l'ananas et ses tranches, la
    # bouteille et ses olives. On les rapproche avant de les compter comme une.
    liees = label(dilation(masque, disk(max(3, h // 200))))

    formes = []
    for region in regionprops(liees):
        y0, x0, y1, x1 = region.bbox
        tache = masque[y0:y1, x0:x1]
        if tache.sum() < (h * w) // 20000:
            continue                                   # poussière de rendu
        colore = np.logical_and(sature[y0:y1, x0:x1], tache).sum() / max(1, tache.sum())
        # Une légende n'a pas de couleur et reste basse ; un aplat blanc peut
        # être sans couleur lui aussi, mais il occupe de la hauteur.
        if colore < 0.02 and (y1 - y0) < 0.09 * h:
            continue
        formes.append((y0, x0, y1, x1))

    if not formes:
        return []

    rangees = grouper([(y0 + y1) / 2 for y0, _, y1, _ in formes], ecart_min=0.10 * h)
    cellules = []
    for rangee in rangees:
        colonnes = grouper([(formes[i][1] + formes[i][3]) / 2 for i in rangee],
                           ecart_min=0.06 * w)
        for colonne in colonnes:
            groupe = [formes[rangee[i]] for i in colonne]
            cellules.append((min(f[1] for f in groupe), min(f[0] for f in groupe),
                             max(f[3] for f in groupe), max(f[2] for f in groupe)))

    # Quand les noms sont donnés, leur nombre est une contrainte utile : les
    # grains épars à côté d'un bol se détachent volontiers en cellule propre, et
    # on les rend à leur voisin le plus proche plutôt que d'inventer un
    # ingrédient. On ne recolle jamais au-delà du compte attendu.
    if noms:
        while len(cellules) > len(noms):
            ecarts = []
            for i in range(len(cellules) - 1):
                a_, b_ = cellules[i], cellules[i + 1]
                meme_rangee = min(a_[3], b_[3]) - max(a_[1], b_[1]) > 0
                if meme_rangee:
                    ecarts.append((b_[0] - a_[2], i))
            if not ecarts:
                break
            _, i = min(ecarts)
            a_, b_ = cellules[i], cellules[i + 1]
            cellules[i:i + 2] = [(min(a_[0], b_[0]), min(a_[1], b_[1]),
                                  max(a_[2], b_[2]), max(a_[3], b_[3]))]
        if len(cellules) != len(noms):
            print(f"  ⚠ {len(cellules)} vignettes détectées pour {len(noms)} noms — "
                  f"vérifiez la planche avant de verser dans Figma", file=sys.stderr)

    decoupes = []
    for i, (x0, y0, x1, y1) in enumerate(cellules):
        nom = noms[i] if noms and i < len(noms) else f"vignette-{i + 1:02d}"
        # Chaque dessin est posé au centre d'un carré, à l'échelle de sa plus
        # grande dimension : les proportions sont gardées, le cadre est commun.
        vignette = image.crop((x0, y0, x1, y1))
        utile = cote - 2 * marge
        facteur = min(utile / vignette.width, utile / vignette.height)
        taille = (max(1, round(vignette.width * facteur)), max(1, round(vignette.height * facteur)))
        carre = Image.new("RGB", (cote, cote), "white")
        carre.paste(vignette.resize(taille, Image.LANCZOS),
                    ((cote - taille[0]) // 2, (cote - taille[1]) // 2))
        decoupes.append((nom, carre, (x1 - x0, y1 - y0)))
    return decoupes


def main():
    a = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument("planche")
    a.add_argument("-o", "--sortie", default="vignettes", help="dossier de sortie")
    a.add_argument("--noms", help="noms des ingrédients, séparés par des virgules, "
                                  "dans l'ordre de lecture")
    a.add_argument("--cote", type=int, default=1600, help="côté de la vignette produite")
    a.add_argument("--marge", type=int, default=190,
                   help="marge blanche autour du dessin ; 190 sur 1600 reprend celle "
                        "des illustrations existantes")
    args = a.parse_args()

    noms = [n.strip() for n in args.noms.split(",")] if args.noms else None
    sortie = Path(args.sortie)
    sortie.mkdir(parents=True, exist_ok=True)

    image = Image.open(args.planche)
    decoupes = decouper(image, noms, args.cote, args.marge)
    print(f"{args.planche} {image.size} → {len(decoupes)} vignette(s)\n")
    for nom, carre, (lg, ht) in decoupes:
        chemin = sortie / f"{slug(nom)}.png"
        carre.save(chemin)
        print(f"  {nom:20s} {lg:5d}×{ht:<5d} → {chemin}")


if __name__ == "__main__":
    signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    main()

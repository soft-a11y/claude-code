#!/usr/bin/env python3
"""Découpe une planche d'illustrations légendée en vignettes carrées.

Magnific rend un lot entier sur une seule image : une grille d'ingrédients,
chacun sous-titré. Pour les verser dans Figma au format des illustrations
existantes, il faut les séparer — et laisser la légende de côté, puisque le nom
est déjà connu par le prompt.

Les bandes horizontales non blanches donnent les rangées ; dans chaque rangée,
la légende se reconnaît à son absence de couleur et se retire ; les bandes
verticales donnent alors les colonnes. Les noms sont attribués dans l'ordre de
lecture, celui du prompt.

    python3 illustrations/decouper.py planche.png --noms "Oignon,Ail,..." -o vignettes/
"""

import argparse
import signal
import sys
import unicodedata
from pathlib import Path

import numpy as np
from PIL import Image

SEUIL_BLANC = 235


def slug(nom):
    base = unicodedata.normalize("NFD", nom)
    base = "".join(c for c in base if unicodedata.category(c) != "Mn").lower()
    return "".join(c if c.isalnum() else "-" for c in base).strip("-").replace("--", "-") or "sans-nom"


def bandes(presence, ecart_min):
    """Regroupe les indices occupés en bandes, en tolérant les petits trous."""
    (occupes,) = np.where(presence)
    if occupes.size == 0:
        return []
    coupures = np.where(np.diff(occupes) > ecart_min)[0]
    debuts = np.r_[occupes[0], occupes[coupures + 1]]
    fins = np.r_[occupes[coupures], occupes[-1]]
    return list(zip(debuts, fins))


def separer_legende(rvb_rangee, masque_rangee):
    """Rend la hauteur où s'arrêtent les dessins, avant la légende.

    Ni l'espace blanc ni la noirceur ne tranchent : dans une rangée les dessins
    n'ont pas la même hauteur, si bien que l'intervalle sous le plus haut est
    plus large que celui qui précède la légende ; et l'anticrénelage du texte
    laisse assez de gris pour brouiller un critère de noir pur.

    Ce qui sépare vraiment, c'est la couleur. Une ligne de légende n'en porte
    aucune, un dessin en porte toujours — une rangée entière de dessins sans le
    moindre pixel saturé n'existe pas dans ces planches.
    """
    sature = (rvb_rangee.max(axis=2) - rvb_rangee.min(axis=2)) > 30
    encre = masque_rangee.sum(axis=1)
    part_coloree = np.divide(np.logical_and(sature, masque_rangee).sum(axis=1), encre,
                             out=np.zeros(encre.shape, dtype=float), where=encre > 0)
    grise = part_coloree < 0.08

    bas = len(encre) - 1
    while bas >= 0 and encre[bas] == 0:
        bas -= 1
    if bas < 0 or not grise[bas]:
        return masque_rangee.shape[0]   # pas de légende sous cette rangée

    haut = bas
    while haut > 0 and (encre[haut - 1] == 0 or grise[haut - 1]):
        haut -= 1
    return haut


def decouper(image, noms, cote, marge):
    a = np.asarray(image.convert("RGB"), dtype=np.int16)
    masque = a.min(axis=2) < SEUIL_BLANC
    h, w = masque.shape

    vignettes = []
    for haut, bas in bandes(masque.any(axis=1), ecart_min=max(8, h // 60)):
        rangee = masque[haut:bas + 1]
        fin_dessins = separer_legende(a[haut:bas + 1], rangee)
        dessins = rangee[:fin_dessins]
        if not dessins.any():
            continue
        for gauche, droite in bandes(dessins.any(axis=0), ecart_min=max(12, w // 40)):
            colonne = dessins[:, gauche:droite + 1]
            (lignes_pleines,) = np.where(colonne.any(axis=1))
            y0, y1 = haut + lignes_pleines[0], haut + lignes_pleines[-1]
            vignettes.append((gauche, y0, droite, y1))

    if noms and len(noms) != len(vignettes):
        print(f"  ⚠ {len(vignettes)} vignettes détectées pour {len(noms)} noms — "
              f"vérifiez la planche avant de verser dans Figma", file=sys.stderr)

    decoupes = []
    for i, (x0, y0, x1, y1) in enumerate(vignettes):
        nom = noms[i] if noms and i < len(noms) else f"vignette-{i + 1:02d}"
        # Chaque dessin est posé au centre d'un carré, à l'échelle de sa plus
        # grande dimension : les proportions sont gardées, le cadre est commun.
        vignette = image.crop((x0, y0, x1 + 1, y1 + 1))
        utile = cote - 2 * marge
        facteur = min(utile / vignette.width, utile / vignette.height)
        taille = (max(1, round(vignette.width * facteur)), max(1, round(vignette.height * facteur)))
        carre = Image.new("RGB", (cote, cote), "white")
        carre.paste(vignette.resize(taille, Image.LANCZOS),
                    ((cote - taille[0]) // 2, (cote - taille[1]) // 2))
        decoupes.append((nom, carre, (x1 - x0 + 1, y1 - y0 + 1)))
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

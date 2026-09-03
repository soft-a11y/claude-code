#!/usr/bin/env python3
"""Mesure l'épaisseur du contour dans des illustrations SVG.

Les illustrations Mezze ont été dessinées une par une, et le trait n'a pas la
même épaisseur de l'une à l'autre — parfois pas même d'un bout à l'autre d'une
seule. Ce script la mesure, pour qu'on décide d'une valeur commune sur des
chiffres plutôt qu'à l'œil.

La méthode : on rend le SVG, on isole le noir, puis on réduit chaque forme
noire à sa ligne médiane. En chaque point de cette ligne, la distance au bord
le plus proche vaut la demi-épaisseur du trait à cet endroit. La médiane de ces
mesures donne l'épaisseur du trait ; leur dispersion dit si elle est régulière.

    python3 illustrations/traits.py svg/*.svg
"""

import argparse
import io
import signal
import sys
from pathlib import Path

import numpy as np

try:
    import cairosvg
except ImportError:
    sys.exit("cairosvg est requis : pip install cairosvg")

from PIL import Image
from scipy.ndimage import distance_transform_edt
from skimage.morphology import skeletonize

# Les noirs relevés vont de #101213 à #3F3E3E. Le seuil doit les prendre tous
# sans mordre sur les aplats sombres — le vert du brocoli #194C1F culmine à 76,
# et le laisser entrer ferait passer une feuille entière pour un trait.
SEUIL_NOIR = 70


def mesurer(chemin, cote):
    png = cairosvg.svg2png(url=str(chemin), output_width=cote, output_height=cote,
                           background_color="white")
    image = np.asarray(Image.open(io.BytesIO(png)).convert("RGB"), dtype=np.int16)

    noir = image.max(axis=2) < SEUIL_NOIR
    if not noir.any():
        return None

    demi = distance_transform_edt(noir)
    ligne = skeletonize(noir)
    if not ligne.any():
        return None

    # Contour extérieur ou trait intérieur ? Un point de la ligne médiane du
    # contour est adossé au fond : sa distance au blanc vaut sa demi-épaisseur.
    # Un trait intérieur, lui, court au cœur du dessin, loin du fond.
    blanc = image.min(axis=2) > 225
    profondeur = distance_transform_edt(~blanc)
    sur_le_bord = np.abs(profondeur - demi) < 3.0

    def resume(selection):
        e = 2 * demi[ligne & selection]
        e = e[e >= 2.0]  # en deçà, c'est du bruit de rendu, pas du trait
        if e.size < 20:
            return None
        return {"mediane": float(np.median(e)),
                "p10": float(np.percentile(e, 10)),
                "p90": float(np.percentile(e, 90))}

    return {"contour": resume(sur_le_bord),
            "interieur": resume(~sur_le_bord),
            "part_noire": float(noir.mean() * 100)}


def main():
    a = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument("svg", nargs="+")
    a.add_argument("--cote", type=int, default=1600,
                   help="côté du rendu, en pixels ; 1600 pour lire en unités du dessin")
    args = a.parse_args()

    print(f"Épaisseur du trait, en unités du dessin (rendu {args.cote} px)\n")
    entete = (f"  {'illustration':22s} {'CONTOUR':>8s} {'p10':>6s} {'p90':>6s}"
              f"   {'INTÉRIEUR':>9s} {'p10':>6s} {'p90':>6s}")
    print(entete)
    print("  " + "-" * (len(entete) - 2))

    contours, interieurs = [], []
    for chemin in sorted(args.svg):
        m = mesurer(Path(chemin), args.cote)
        nom = Path(chemin).stem
        if m is None:
            print(f"  {nom:22s}      —   aucun trait noir détecté")
            continue

        def colonnes(bloc, largeur):
            if bloc is None:
                return f"{'—':>{largeur}s} {'':>6s} {'':>6s}"
            return f"{bloc['mediane']:{largeur}.1f} {bloc['p10']:6.1f} {bloc['p90']:6.1f}"

        if m["contour"]:
            contours.append(m["contour"]["mediane"])
        if m["interieur"]:
            interieurs.append(m["interieur"]["mediane"])
        print(f"  {nom:22s} {colonnes(m['contour'], 8)}   {colonnes(m['interieur'], 9)}")

    for titre, valeurs in (("Contour extérieur", contours), ("Traits intérieurs", interieurs)):
        if len(valeurs) > 1:
            v = np.array(valeurs)
            print(f"\n  {titre} : de {v.min():.1f} à {v.max():.1f}, médiane {np.median(v):.1f}"
                  f"  —  écart ×{v.max() / v.min():.2f}")


if __name__ == "__main__":
    signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    main()

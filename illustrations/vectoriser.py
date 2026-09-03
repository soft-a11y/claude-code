#!/usr/bin/env python3
"""Ramène un rendu bitmap sur la palette Mezze, puis le retrace en SVG simple.

Un rendu de Magnific porte 15 000 à 20 000 teintes ; une illustration Mezze en
porte huit. Ce script fait le pont : il projette chaque pixel sur l'emplacement
de palette le plus proche — en Lab, pour juger comme l'œil — nettoie le semis
laissé par l'anticrénelage, puis retrace chaque zone de couleur en tracés.

Le SVG qui sort n'a qu'un groupe par emplacement de palette. C'est ce qui rend
les illustrations modifiables d'un bloc : changer un emplacement les repeint
toutes.

    python3 illustrations/vectoriser.py rendu.png -o illu.svg
"""

import argparse
import colorsys
import json
import signal
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from skimage import measure
from skimage.color import rgb2lab
from skimage.filters import rank
from skimage.morphology import disk

RACINE = Path(__file__).resolve().parent


# ─── palette ───────────────────────────────────────────────────────────────

def hex_vers_rvb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def decliner(base, clarte, saturation):
    """Décline une teinte de marque en ombre ou en lumière, sans la dénaturer."""
    r, g, b = (c / 255 for c in hex_vers_rvb(base))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    l = min(1.0, max(0.0, l * clarte))
    s = min(1.0, s * saturation)
    return "#%02X%02X%02X" % tuple(round(c * 255) for c in colorsys.hls_to_rgb(h, l, s))


def construire_palette(chemin, familles=None):
    """Déplie le fichier de palette en emplacements nommés → couleur.

    `familles` restreint le jeu proposé. Sans restriction, la projection choisit
    la teinte la plus proche parmi toutes — et un citron finit orange, faute de
    savoir qu'il est jaune. Nommer les familles d'un ingrédient est ce qui rend
    la couleur juste, et c'est aussi là qu'on décide quelle couleur de marque
    le concerne.
    """
    d = json.loads(Path(chemin).read_text(encoding="utf-8"))
    emplacements = {"contour": d["contour"], "fond": d["fond"]}
    retenues = d["familles"] if familles is None else {
        k: v for k, v in d["familles"].items() if k in familles
    }
    if familles:
        inconnues = set(familles) - set(d["familles"])
        if inconnues:
            sys.exit(f"famille inconnue : {', '.join(sorted(inconnues))}. "
                     f"Disponibles : {', '.join(d['familles'])}")
    for nom, fam in retenues.items():
        for palier, reglage in d["paliers"].items():
            if palier.startswith("_"):
                continue
            emplacements[f"{nom}-{palier}"] = decliner(
                fam["base"], reglage["clarte"], reglage["saturation"]
            )
    return emplacements


# ─── quantification ────────────────────────────────────────────────────────

def quantifier(image, palette, adoucir=3):
    """Projette chaque pixel sur l'emplacement le plus proche, jugé en Lab."""
    noms = list(palette)
    cibles = np.array([hex_vers_rvb(palette[n]) for n in noms], dtype=np.uint8)
    cibles_lab = rgb2lab(cibles.reshape(-1, 1, 3)).reshape(-1, 3)

    pixels_lab = rgb2lab(np.asarray(image, dtype=np.uint8))
    h, w, _ = pixels_lab.shape
    plat = pixels_lab.reshape(-1, 3)

    # Par tranches : l'image entière contre toute la palette saturerait la mémoire.
    indices = np.empty(plat.shape[0], dtype=np.int32)
    for debut in range(0, plat.shape[0], 200_000):
        bloc = plat[debut:debut + 200_000]
        d = ((bloc[:, None, :] - cibles_lab[None, :, :]) ** 2).sum(axis=2)
        indices[debut:debut + 200_000] = d.argmin(axis=1)
    carte = indices.reshape(h, w).astype(np.uint8)

    if adoucir:
        # L'anticrénelage sème des pixels isolés le long des contours ; un vote
        # majoritaire local les absorbe sans ronger les formes.
        carte = rank.majority(carte, disk(adoucir))
    return carte, noms


# ─── traçage ───────────────────────────────────────────────────────────────

def tracer(masque, tolerance):
    """Retrace une zone en contours polygonaux, trous compris."""
    borde = np.pad(masque.astype(float), 1)
    chemins = []
    for contour in measure.find_contours(borde, 0.5):
        poly = measure.approximate_polygon(contour, tolerance=tolerance)
        if len(poly) < 3:
            continue
        # find_contours rend du (ligne, colonne) ; le SVG attend du (x, y).
        pts = [(round(c - 1, 1), round(l - 1, 1)) for l, c in poly]
        chemins.append("M" + "L".join(f"{x},{y}" for x, y in pts) + "Z")
    return chemins


def en_svg(carte, noms, palette, taille, tolerance):
    h, w = carte.shape
    morceaux = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{taille}" height="{taille}" '
        f'viewBox="0 0 {w} {h}">'
    ]

    presents = [(i, (carte == i).sum()) for i in np.unique(carte)]
    # Les grandes plages d'abord, les détails par-dessus ; le contour ferme la marche.
    presents.sort(key=lambda t: -t[1])
    ordre = [i for i, _ in presents if noms[i] != "contour"]
    if any(noms[i] == "contour" for i, _ in presents):
        ordre.append(noms.index("contour"))

    for i in ordre:
        nom = noms[i]
        if nom == "fond":
            continue  # le fond reste vide : l'illustration se pose sur ce qu'on veut
        chemins = tracer(carte == i, tolerance)
        if not chemins:
            continue
        morceaux.append(
            f'<g id="{nom}" fill="{palette[nom]}">'
            f'<path fill-rule="evenodd" d="{"".join(chemins)}"/></g>'
        )
    morceaux.append("</svg>")
    return "\n".join(morceaux)


# ─── entrée ────────────────────────────────────────────────────────────────

def main():
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument("image", help="rendu bitmap à convertir")
    a.add_argument("-o", "--sortie", help="fichier SVG (défaut : à côté de l'image)")
    a.add_argument("--palette", default=str(RACINE / "palette-mezze.json"))
    a.add_argument("--tolerance", type=float, default=1.2,
                   help="simplification des tracés en pixels ; monter pour des formes plus douces")
    a.add_argument("--adoucir", type=int, default=3,
                   help="rayon du vote majoritaire anti-semis ; 0 pour le désactiver")
    a.add_argument("--taille", type=int, default=1600, help="côté du SVG produit")
    a.add_argument("--familles", help="familles autorisées, séparées par des virgules "
                                      "(ex. jaune,vert pour un citron)")
    args = a.parse_args()

    familles = [f.strip() for f in args.familles.split(",")] if args.familles else None
    palette = construire_palette(args.palette, familles)
    image = Image.open(args.image).convert("RGB")
    carte, noms = quantifier(image, palette, args.adoucir)

    sortie = Path(args.sortie or Path(args.image).with_suffix(".svg"))
    svg = en_svg(carte, noms, palette, args.taille, args.tolerance)
    sortie.write_text(svg, encoding="utf-8")

    employes = [noms[i] for i in np.unique(carte) if noms[i] != "fond"]
    print(f"{sortie}  {svg.count('<path'):2d} tracés, {len(employes)} emplacements : {', '.join(employes)}")


if __name__ == "__main__":
    signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    main()

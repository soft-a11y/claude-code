#!/usr/bin/env python3
"""Relève la palette réelle d'un jeu d'illustrations SVG.

Les illustrations Mezze ont été colorées une par une : chacune porte son propre
noir de contour et ses propres verts. Ce script rassemble toutes les teintes
employées, les range par famille et par clarté, et propose un emplacement de
palette par famille et par palier — la base sur laquelle normaliser l'existant
et aligner les nouvelles illustrations.

    python3 illustrations/palette.py svg/*.svg -o palette.json
"""

import argparse
import colorsys
import json
import re
import signal
import sys
from collections import Counter, defaultdict

FILL = re.compile(r'fill="(#[0-9a-fA-F]{6})"')

# Ordre d'affichage : le contour d'abord, il structure tout le reste.
FAMILLES = ["contour", "rouge", "orange", "jaune", "vert", "bleu", "rose", "gris", "blanc"]
PALIERS = ("ombre", "base", "lumiere")


def teinte_saturation_clarte(hexa):
    r, g, b = (int(hexa[i:i + 2], 16) / 255 for i in (1, 3, 5))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    return h * 360, s * 100, l * 100


def famille(hexa):
    """Range une couleur dans une famille — le contour se reconnaît à sa clarté."""
    h, s, l = teinte_saturation_clarte(hexa)
    if l < 18:
        return "contour"
    if s < 12:
        return "blanc" if l > 80 else "gris"
    if l > 92:
        return "blanc"
    if h < 18 or h >= 345:
        return "rouge"
    if h < 45:
        return "orange"
    if h < 70:
        return "jaune"
    if h < 160:
        return "vert"
    if h < 260:
        return "bleu"
    return "rose"


def relever(chemins):
    """Compte chaque teinte, pondérée par le nombre de tracés qui l'emploient."""
    poids = Counter()
    par_fichier = {}
    for chemin in chemins:
        with open(chemin, encoding="utf-8") as f:
            trouvees = Counter(m.upper() for m in FILL.findall(f.read()))
        par_fichier[chemin] = trouvees
        poids.update(trouvees)
    return poids, par_fichier


def proposer(poids):
    """Trois paliers par famille : on découpe par clarté, on garde le plus employé."""
    membres = defaultdict(list)
    for couleur, n in poids.items():
        membres[famille(couleur)].append((couleur, n, teinte_saturation_clarte(couleur)[2]))

    palette = {}
    for fam in FAMILLES:
        if fam not in membres:
            continue
        par_clarte = sorted(membres[fam], key=lambda t: t[2])
        tiers = max(1, len(par_clarte) // 3)
        groupes = (par_clarte[:tiers], par_clarte[tiers:2 * tiers] or par_clarte, par_clarte[2 * tiers:] or par_clarte)
        for palier, groupe in zip(PALIERS, groupes):
            if groupe:
                palette[f"{fam}-{palier}"] = max(groupe, key=lambda t: t[1])[0]
    return palette, membres


def main():
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument("svg", nargs="+", help="fichiers SVG à relever")
    a.add_argument("-o", "--sortie", help="écrire la palette proposée en JSON")
    args = a.parse_args()

    poids, par_fichier = relever(args.svg)
    if not poids:
        sys.exit("aucune couleur trouvée — les SVG utilisent-ils bien des attributs fill ?")
    palette, membres = proposer(poids)

    print(f"{len(poids)} teintes distinctes sur {len(par_fichier)} illustration(s)\n")
    for chemin, trouvees in sorted(par_fichier.items()):
        apercu = " ".join(f"{c}×{n}" for c, n in trouvees.most_common(5))
        print(f"  {chemin.split('/')[-1]:20s} {len(trouvees):2d} teintes   {apercu}")

    print("\nPalette proposée")
    for fam in FAMILLES:
        if fam not in membres:
            continue
        total = sum(n for _, n, _ in membres[fam])
        print(f"\n  {fam.upper():9s} {len(membres[fam]):2d} teintes relevées, {total} tracés")
        for palier in PALIERS:
            couleur = palette.get(f"{fam}-{palier}")
            if couleur:
                print(f"      {palier:8s} {couleur}")

    if args.sortie:
        with open(args.sortie, "w", encoding="utf-8") as f:
            json.dump(palette, f, indent=2)
            f.write("\n")
        print(f"\n→ {args.sortie} : {len(palette)} emplacements")


if __name__ == "__main__":
    # Se comporter correctement derrière un `| head` plutôt que de dérouler une trace.
    signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    main()

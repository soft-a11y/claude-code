#!/usr/bin/env python3
"""Ramène un rendu bitmap sur la palette Mezze, puis le retrace en SVG simple.

Le piège de la vectorisation naïve, c'est de décalquer le contour noir tel que
le modèle l'a peint : son épaisseur ondule, et les zones de couleur juxtaposées
laissent des trous au moindre pixel d'anticrénelage.

Ici le contour n'est pas décalqué, il est reconstruit. Les pixels noirs sont
rendus aux couleurs voisines, la silhouette est remplie d'un aplat de fond, et
le trait est retracé par-dessus, à épaisseur constante — comme les
illustrations d'origine, où le contour est régulier d'un bout à l'autre.

    python3 illustrations/vectoriser.py rendu.png -o illu.svg --familles jaune,vert
"""

import argparse
import colorsys
import json
import signal
import sys
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image
from skimage import measure
from skimage.color import rgb2lab
from skimage.filters import rank
from scipy.ndimage import distance_transform_edt
from skimage.morphology import disk, erosion, remove_small_objects, remove_small_holes
from skimage.segmentation import expand_labels, flood

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

    `familles` restreint le jeu proposé. Sans restriction, la projection retient
    la teinte la plus proche parmi toutes — et un citron finit orange, faute de
    savoir qu'il est jaune. Nommer les familles d'un ingrédient est ce qui rend
    la couleur juste, et c'est là qu'on décide quelle couleur de marque le
    concerne.
    """
    d = json.loads(Path(chemin).read_text(encoding="utf-8"))
    if familles:
        inconnues = set(familles) - set(d["familles"])
        if inconnues:
            sys.exit(f"famille inconnue : {', '.join(sorted(inconnues))}. "
                     f"Disponibles : {', '.join(d['familles'])}")
    retenues = d["familles"] if familles is None else {
        k: v for k, v in d["familles"].items() if k in familles
    }
    couleurs = {}
    for nom, fam in retenues.items():
        for palier, reglage in d["paliers"].items():
            if not palier.startswith("_"):
                couleurs[f"{nom}-{palier}"] = decliner(
                    fam["base"], reglage["clarte"], reglage["saturation"]
                )
    return couleurs, d["contour"], d["fond"]


# ─── séparation fond / couleurs / trait ────────────────────────────────────

def analyser(image, couleurs, contour, fond, adoucir, opt_bande):
    """Range chaque pixel : hors-sujet, couleur, ou trait.

    Le trait est ensuite rendu aux couleurs voisines. Une fois la silhouette
    pleine de couleur d'un bord à l'autre, plus aucun trou n'est possible : le
    trait sera repeint par-dessus, pas intercalé entre les aplats.
    """
    noms = list(couleurs) + ["__contour__", "__fond__"]
    cibles = np.array(
        [hex_vers_rvb(c) for c in couleurs.values()] + [hex_vers_rvb(contour), hex_vers_rvb(fond)],
        dtype=np.uint8,
    )
    cibles_lab = rgb2lab(cibles.reshape(-1, 1, 3)).reshape(-1, 3)

    lab = rgb2lab(np.asarray(image, dtype=np.uint8))
    h, w, _ = lab.shape
    plat = lab.reshape(-1, 3)

    indices = np.empty(plat.shape[0], dtype=np.int32)
    for debut in range(0, plat.shape[0], 200_000):  # par tranches, sinon la mémoire saute
        bloc = plat[debut:debut + 200_000]
        indices[debut:debut + 200_000] = (
            ((bloc[:, None, :] - cibles_lab[None, :, :]) ** 2).sum(axis=2).argmin(axis=1)
        )
    carte = indices.reshape(h, w).astype(np.uint8)
    if adoucir:
        carte = rank.majority(carte, disk(adoucir))  # absorbe le semis d'anticrénelage

    i_contour, i_fond = len(couleurs), len(couleurs) + 1

    # Le fond se reconnaît à sa continuité depuis le bord, pas à sa couleur : une
    # palette contenant une crème quasi blanche ferait sinon passer le blanc du
    # fond pour un aplat, et la silhouette avalerait toute l'image.
    clair = (np.asarray(image, dtype=np.uint8).min(axis=2) > 225)
    dehors = np.zeros_like(clair)
    for germe in ((0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)):
        if clair[germe]:
            dehors |= flood(clair, germe)
    silhouette = ~dehors
    silhouette = remove_small_holes(silhouette, max_size=(h * w) // 2000)
    silhouette = remove_small_objects(silhouette, max_size=(h * w) // 2000)

    # Le noir se partage en deux rôles, que la distance au fond sépare mieux que
    # la connexité : la bande qui longe le bord est le contour, et sera retracée
    # à épaisseur constante ; tout ce qui court plus au cœur — hachures, stries,
    # séparations entre deux objets qui se chevauchent — fait le dessin, et se
    # garde tel quel. Un critère par composante fondrait ces séparations dans le
    # contour dès qu'elles le touchent, et trois champignons n'en feraient qu'un.
    noir = (carte == i_contour) & silhouette
    profondeur = distance_transform_edt(~dehors)
    details = noir & (profondeur > opt_bande)

    # Le liseré d'anticrénelage qui borde le contour n'est d'aucune couleur : on
    # l'écarte de l'étiquetage, sinon une crème très claire y laisse un halo.
    coeur = erosion(silhouette, disk(2))
    interne = noir | (carte == i_fond) | ~coeur
    etiquettes = np.where(interne, 0, carte.astype(np.int32) + 1)
    aplats = expand_labels(etiquettes, distance=max(h, w)) - 1
    aplats = np.where(silhouette, aplats, -1)
    return aplats, silhouette, details, noms


# ─── traçage ───────────────────────────────────────────────────────────────

def lisser(points, passes):
    """Arrondit un polygone par coupe de coins (Chaikin), en circuit fermé.

    La simplification laisse des facettes bien visibles sur une courbe ; deux
    ou trois passes suffisent à retrouver le galbe des tracés d'origine.
    """
    pts = points[:-1] if np.allclose(points[0], points[-1]) else points
    for _ in range(passes):
        suivant = np.roll(pts, -1, axis=0)
        pts = np.stack([0.75 * pts + 0.25 * suivant, 0.25 * pts + 0.75 * suivant], axis=1)
        pts = pts.reshape(-1, 2)
    return pts


def contours(masque, tolerance, passes, aire_min):
    """Retrace une zone en polygones lissés, trous compris."""
    borde = np.pad(masque.astype(float), 1)
    chemins = []
    for contour in measure.find_contours(borde, 0.5):
        poly = measure.approximate_polygon(contour, tolerance=tolerance)
        if len(poly) < 4:
            continue
        # Aire du lacet : écarte les miettes que le modèle a semées.
        y, x = poly[:, 0], poly[:, 1]
        if abs(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))) / 2 < aire_min:
            continue
        pts = lisser(poly, passes)
        chemins.append(
            "M" + "L".join(f"{round(c - 1, 1)},{round(l - 1, 1)}" for l, c in pts) + "Z"
        )
    return chemins


def en_svg(aplats, silhouette, details, noms, couleurs, contour, opt):
    h, w = aplats.shape
    aire_min = (h * w) * opt.miettes
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{opt.taille}" '
           f'height="{opt.taille}" viewBox="0 0 {w} {h}">']

    presents = [(i, int((aplats == i).sum())) for i in np.unique(aplats) if i >= 0]
    presents.sort(key=lambda t: -t[1])
    if not presents:
        sys.exit("aucune couleur retenue — l'image est-elle bien sur fond uni ?")

    # 1. Un aplat plein sous toute la silhouette. C'est lui qui interdit les trous :
    #    quoi qu'il arrive ensuite, aucun pixel du sujet ne reste transparent.
    dominante = noms[presents[0][0]]
    fondations = contours(silhouette, opt.tolerance, opt.lissage, aire_min)
    out.append(f'<g id="{dominante}" fill="{couleurs[dominante]}">'
               f'<path fill-rule="evenodd" d="{"".join(fondations)}"/></g>')

    # 2. Les autres aplats par-dessus, du plus large au plus étroit.
    for i, _ in presents[1:]:
        nom = noms[i]
        if chemins := contours(aplats == i, opt.tolerance, opt.lissage, aire_min):
            out.append(f'<g id="{nom}" fill="{couleurs[nom]}">'
                       f'<path fill-rule="evenodd" d="{"".join(chemins)}"/></g>')

    # 3. Les traits de détail mis de côté, repeints tels quels.
    if chemins := contours(details, opt.tolerance, max(1, opt.lissage - 1), aire_min / 6):
        out.append(f'<g id="trait-detail" fill="{contour}">'
                   f'<path fill-rule="evenodd" d="{"".join(chemins)}"/></g>')

    # 4. Le trait, reconstruit à épaisseur constante — jamais décalqué.
    #    D'abord les séparations internes, plus fines, puis la silhouette.
    interieurs = []
    for i, _ in presents[1:]:
        interieurs += contours(aplats == i, opt.tolerance, opt.lissage, aire_min)
    commun = (f'fill="none" stroke="{contour}" stroke-linejoin="round" '
              f'stroke-linecap="round"')
    if interieurs:
        out.append(f'<g id="trait-interieur" {commun} stroke-width="{opt.trait_fin}">'
                   f'<path d="{"".join(interieurs)}"/></g>')
    out.append(f'<g id="trait-contour" {commun} stroke-width="{opt.trait}">'
               f'<path d="{"".join(fondations)}"/></g>')

    out.append("</svg>")
    return "\n".join(out), [noms[i] for i, _ in presents]


# ─── entrée ────────────────────────────────────────────────────────────────

def main():
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument("image", help="rendu bitmap à convertir")
    a.add_argument("-o", "--sortie", help="fichier SVG (défaut : à côté de l'image)")
    a.add_argument("--palette", default=str(RACINE / "palette-mezze.json"))
    a.add_argument("--familles", help="familles autorisées, séparées par des virgules "
                                      "(ex. jaune,vert pour un citron)")
    a.add_argument("--tolerance", type=float, default=2.0, help="simplification, en pixels")
    a.add_argument("--lissage", type=int, default=3, help="passes d'arrondi des angles")
    a.add_argument("--trait", type=float, default=11.0, help="épaisseur du contour")
    a.add_argument("--trait-fin", type=float, default=5.0, help="épaisseur des traits internes")
    a.add_argument("--miettes", type=float, default=0.0004,
                   help="aire minimale d'une forme, en fraction de l'image")
    a.add_argument("--adoucir", type=int, default=3, help="rayon du vote anti-semis, 0 pour couper")
    a.add_argument("--taille", type=int, default=1600, help="côté du SVG produit")
    args = a.parse_args()

    familles = [f.strip() for f in args.familles.split(",")] if args.familles else None
    couleurs, contour, fond = construire_palette(args.palette, familles)

    image = Image.open(args.image).convert("RGB")
    # La bande de contour se mesure sur l'image : un rendu 1024 et un rendu 2048
    # ne portent pas le même trait en pixels.
    bande = args.trait / 1600 * max(image.size) * 1.15
    aplats, silhouette, details, noms = analyser(image, couleurs, contour, fond, args.adoucir, bande)
    svg, employes = en_svg(aplats, silhouette, details, noms, couleurs, contour, args)

    sortie = Path(args.sortie or Path(args.image).with_suffix(".svg"))
    sortie.write_text(svg, encoding="utf-8")
    print(f"{sortie}  {svg.count('<path'):2d} tracés, {len(employes)} emplacements : {', '.join(employes)}")


if __name__ == "__main__":
    signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    main()

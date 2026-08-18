// Prisme — génération de dégradés directement dans Figma.
// Ce fichier tourne dans le bac à sable du plugin ; l'interface est dans ui.html.

figma.showUI(__html__, { width: 360, height: 640, themeColors: true });

/* ---------------------------------------------------------------
   Conversion des couleurs
   --------------------------------------------------------------- */
function hexRgb(h) {
  h = String(h).replace('#', '');
  if (h.length === 3) { h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255
  };
}
function arret(couleur, position, alpha) {
  var c = hexRgb(couleur);
  c.a = (alpha === undefined ? 1 : alpha);
  return { position: Math.max(0, Math.min(1, position)), color: c };
}

/* ---------------------------------------------------------------
   Matrices gradientTransform

   Figma envoie l'espace normalisé de l'objet vers l'espace du dégradé,
   où la coordonnée x porte la position des arrêts. Les formules ci-dessous
   reproduisent la géométrie du CSS, format du cadre compris — sans quoi
   un angle est cisaillé dès que le cadre n'est pas carré.
   --------------------------------------------------------------- */
function transLineaire(angle, W, H) {
  var a = angle * Math.PI / 180;
  var dx = Math.sin(a), dy = -Math.cos(a);
  var L = Math.abs(W * dx) + Math.abs(H * dy);   // longueur de la ligne de dégradé, comme en CSS
  return [
    [W * dx / L, H * dy / L, 0.5 - (W * dx + H * dy) / (2 * L)],
    [-W * dy / L, H * dx / L, 0.5 - (-W * dy + H * dx) / (2 * L)]
  ];
}

function transRadiale(px, py, forme, W, H) {
  var cx = px / 100, cy = py / 100;
  var mx = Math.max(px, 100 - px) / 100 * W;
  var my = Math.max(py, 100 - py) / 100 * H;
  var rx, ry;
  if (forme === 'circle') {
    var r = Math.sqrt(mx * mx + my * my);        // farthest-corner : le coin le plus éloigné
    rx = r / W; ry = r / H;
  } else {
    rx = mx * Math.SQRT2 / W; ry = my * Math.SQRT2 / H;
  }
  return [
    [1 / (2 * rx), 0, 0.5 - cx / (2 * rx)],
    [0, 1 / (2 * ry), 0.5 - cy / (2 * ry)]
  ];
}

// L'identité Figma démarre à 3 heures ; le conique CSS démarre à midi.
// Vérifié dans un fichier réel : à k = 1 et A = 90° cette matrice vaut l'identité.
function transConique(angle, W, H) {
  var a = angle * Math.PI / 180, k = H / W;
  var a00 = Math.sin(a), a01 = -k * Math.cos(a);
  var a10 = Math.cos(a), a11 = k * Math.sin(a);
  return [
    [a00, a01, 0.5 - (a00 * 0.5 + a01 * 0.5)],
    [a10, a11, 0.5 - (a10 * 0.5 + a11 * 0.5)]
  ];
}

/* ---------------------------------------------------------------
   Peintures
   --------------------------------------------------------------- */
function peinture(etat, W, H) {
  var arrets = etat.stops
    .slice()
    .sort(function (a, b) { return a.p - b.p; })
    .map(function (s) { return arret(s.c, s.p / 100); });

  if (etat.type === 'linear') {
    return { type: 'GRADIENT_LINEAR', gradientTransform: transLineaire(etat.angle, W, H), gradientStops: arrets };
  }
  if (etat.type === 'radial') {
    return { type: 'GRADIENT_RADIAL', gradientTransform: transRadiale(etat.px, etat.py, etat.shape, W, H), gradientStops: arrets };
  }
  return { type: 'GRADIENT_ANGULAR', gradientTransform: transConique(etat.angle, W, H), gradientStops: arrets };
}

// Une tache de maille : une ellipse dont le dégradé radial s'éteint en alpha 0.
// Elle reste modifiable dans Figma, contrairement à une image importée.
function tache(blob, etat, W, H) {
  var e = figma.createEllipse();
  var w = 2 * blob.r / 100 * W, h = 2 * blob.r / 100 * H;
  e.resize(Math.max(1, w), Math.max(1, h));
  e.x = blob.x / 100 * W - w / 2;
  e.y = blob.y / 100 * H - h / 2;
  e.name = 'Tache ' + blob.c;
  e.fills = [{
    type: 'GRADIENT_RADIAL',
    gradientTransform: [[1, 0, 0], [0, 1, 0]],
    gradientStops: [
      arret(blob.c, 0, 1),
      arret(blob.c, etat.soft * 0.45 / 100, 0.55),
      arret(blob.c, etat.soft / 100, 0)
    ]
  }];
  return e;
}

function remplirMaille(cadre, etat) {
  var W = cadre.width, H = cadre.height;
  cadre.fills = [{ type: 'SOLID', color: hexRgb(etat.base) }];
  cadre.clipsContent = true;
  // Le premier calque CSS est celui du dessus : on ajoute donc à partir du dernier.
  for (var i = etat.blobs.length - 1; i >= 0; i--) {
    cadre.appendChild(tache(etat.blobs[i], etat, W, H));
  }
}

/* ---------------------------------------------------------------
   Placement
   --------------------------------------------------------------- */
function placer(node, W, H) {
  var c = figma.viewport.center;
  node.x = Math.round(c.x - W / 2);
  node.y = Math.round(c.y - H / 2);
  figma.currentPage.appendChild(node);
}

function creer(etat, W, H) {
  if (etat.type === 'mesh') {
    var cadre = figma.createFrame();
    cadre.name = 'Maille Prisme';
    cadre.resize(W, H);
    placer(cadre, W, H);
    remplirMaille(cadre, etat);
    return cadre;
  }
  var r = figma.createRectangle();
  r.name = 'Dégradé Prisme';
  r.resize(W, H);
  placer(r, W, H);
  r.fills = [peinture(etat, W, H)];
  return r;
}

function appliquer(etat) {
  var sel = figma.currentPage.selection;
  if (!sel.length) { return { ok: false, message: "Rien n'est sélectionné." }; }

  var touches = 0, refus = 0;
  for (var i = 0; i < sel.length; i++) {
    var n = sel[i];
    if (etat.type === 'mesh') {
      // Une maille tient dans un conteneur : elle a besoin d'enfants.
      if (n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'INSTANCE') {
        // On retire les taches d'une génération précédente pour ne pas les empiler.
        n.children.slice().forEach(function (enfant) {
          if (enfant.name.indexOf('Tache ') === 0) { enfant.remove(); }
        });
        remplirMaille(n, etat);
        touches++;
      } else { refus++; }
    } else if ('fills' in n) {
      n.fills = [peinture(etat, n.width, n.height)];
      touches++;
    } else { refus++; }
  }

  if (!touches) {
    return {
      ok: false,
      message: etat.type === 'mesh'
        ? 'Une maille demande un cadre : sélectionnez un frame.'
        : 'Ces calques n\'acceptent pas de remplissage.'
    };
  }
  return {
    ok: true,
    message: touches + (touches > 1 ? ' calques mis à jour' : ' calque mis à jour')
      + (refus ? ' — ' + refus + ' ignoré' + (refus > 1 ? 's' : '') : '')
  };
}

/* ---------------------------------------------------------------
   Messages venus de l'interface
   --------------------------------------------------------------- */
figma.ui.onmessage = function (msg) {
  try {
    if (msg.type === 'creer') {
      var node = creer(msg.etat, msg.largeur, msg.hauteur);
      figma.currentPage.selection = [node];
      figma.viewport.scrollAndZoomIntoView([node]);
      figma.ui.postMessage({ type: 'retour', ok: true, message: 'Cadre créé — ' + msg.largeur + ' × ' + msg.hauteur });
    } else if (msg.type === 'appliquer') {
      var r = appliquer(msg.etat);
      figma.ui.postMessage({ type: 'retour', ok: r.ok, message: r.message });
    }
  } catch (e) {
    figma.ui.postMessage({ type: 'retour', ok: false, message: 'Erreur : ' + e.message });
  }
};

// L'interface grise « Appliquer » quand rien n'est sélectionné.
function annoncerSelection() {
  figma.ui.postMessage({ type: 'selection', nombre: figma.currentPage.selection.length });
}
figma.on('selectionchange', annoncerSelection);
annoncerSelection();

#!/usr/bin/env node
// Chaîne Figma → Magnific : exporte des frames Figma en PNG, puis les passe en
// lot dans Magnific.
//
// Deux voies, selon la manière dont vous vous authentifiez chez Magnific :
//
//   • voie API  — `lancer` fait tout seul : envoi, attente, récupération.
//                 Demande MAGNIFIC_API_KEY. C'est la voie 100 % automatique.
//   • voie MCP  — `exporter` prépare les PNG et un carnet de tâches
//                 (taches.json), que Claude Code exécute via le MCP Magnific
//                 (OAuth, pas de clé). Voir magnific/PILOTE-MCP.md.
//
// Node 18+ requis (fetch natif). Aucune dépendance.

import { readFile, writeFile, mkdir, rename, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// Surchargeables pour les tests ; en usage normal ces valeurs ne bougent pas.
const API_FIGMA = process.env.FIGMA_API_BASE ?? 'https://api.figma.com'
const API_MAGNIFIC = process.env.MAGNIFIC_API_BASE ?? 'https://api.magnific.com'

// Magnific refuse une image de sortie au-delà de 25,3 millions de pixels.
const PIXELS_MAX = 25_300_000

const FACTEURS = { '2x': 2, '4x': 4, '8x': 8, '16x': 16 }

// ─── petits utilitaires ────────────────────────────────────────────────────

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

function slug(nom) {
  return (
    nom
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'sans-nom'
  )
}

// Plusieurs frames portent le même nom dans la page (« Rice », « Pasta »,
// « Eggs », « bread »…). On suffixe les doublons dans l'ordre du document :
// les noms de fichiers restent stables d'un passage à l'autre.
function slugsUniques(frames) {
  const vus = new Map()
  return frames.map((f) => {
    const base = slug(f.name)
    const n = (vus.get(base) ?? 0) + 1
    vus.set(base, n)
    return n === 1 ? base : `${base}-${n}`
  })
}

const empreinte = (v) => createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 12)

async function existe(chemin) {
  try {
    await stat(chemin)
    return true
  } catch {
    return false
  }
}

// L'état est écrit depuis plusieurs tâches en parallèle. On sérialise : le
// contenu est figé à l'appel, puis les écritures s'enchaînent une par une —
// sans quoi deux `rename` concurrents sur le même fichier temporaire se
// marchent dessus. Le rename reste atomique : un Ctrl-C ne corrompt pas l'état.
let fileEcritures = Promise.resolve()

function ecrireJson(chemin, valeur) {
  const contenu = JSON.stringify(valeur, null, 2) + '\n'
  const suivante = fileEcritures.catch(() => {}).then(async () => {
    const tmp = `${chemin}.${process.pid}.tmp`
    await writeFile(tmp, contenu)
    await rename(tmp, chemin)
  })
  fileEcritures = suivante.catch(() => {}) // un échec n'empoisonne pas la file
  return suivante
}

// Chemin lisible : relatif au dépôt quand c'est possible, absolu sinon.
function afficherChemin(chemin) {
  const rel = relative(RACINE, chemin)
  return rel.startsWith('..') ? chemin : rel
}

// Requête HTTP avec reprise sur 429 / 5xx / coupure réseau.
async function demander(url, options = {}, { essais = 5, quoi = 'requête' } = {}) {
  let attente = 1000
  for (let i = 1; ; i++) {
    let reponse
    try {
      reponse = await fetch(url, options)
    } catch (err) {
      if (i >= essais) throw new Error(`${quoi} : ${err.message}`)
      await dormir(attente)
      attente *= 2
      continue
    }
    if (reponse.ok) return reponse
    if ((reponse.status === 429 || reponse.status >= 500) && i < essais) {
      const entete = Number(reponse.headers.get('retry-after'))
      await dormir(Number.isFinite(entete) && entete > 0 ? entete * 1000 : attente)
      attente *= 2
      continue
    }
    const corps = await reponse.text().catch(() => '')
    throw new Error(`${quoi} : HTTP ${reponse.status} ${corps.slice(0, 400)}`)
  }
}

// Exécute `tache` sur chaque élément, `limite` en parallèle au plus.
async function enParallele(elements, limite, tache) {
  const resultats = new Array(elements.length)
  let curseur = 0
  const ouvriers = Array.from({ length: Math.max(1, Math.min(limite, elements.length)) }, async () => {
    while (curseur < elements.length) {
      const i = curseur++
      resultats[i] = await tache(elements[i], i)
    }
  })
  await Promise.all(ouvriers)
  return resultats
}

// ─── configuration ─────────────────────────────────────────────────────────

async function lireConfig(chemin) {
  const brut = await readFile(chemin, 'utf8').catch(() => {
    throw new Error(`configuration introuvable : ${chemin}`)
  })
  const config = JSON.parse(brut)
  if (!config.figma?.fileKey) throw new Error('config : figma.fileKey manquant')
  if (!config.figma?.pageId) throw new Error('config : figma.pageId manquant')
  return config
}

function recetteDe(config) {
  const recette = config.recettes?.[config.recette]
  if (!recette) {
    const dispo = Object.keys(config.recettes ?? {}).join(', ') || '(aucune)'
    throw new Error(`recette « ${config.recette} » introuvable. Disponibles : ${dispo}`)
  }
  if (!recette.endpoint) throw new Error(`recette « ${config.recette} » sans endpoint`)
  return recette
}

// ─── Figma ─────────────────────────────────────────────────────────────────

function jetonFigma() {
  const jeton = process.env.FIGMA_TOKEN
  if (!jeton) throw new Error('FIGMA_TOKEN absent (Figma → Settings → Personal access tokens)')
  return { 'X-Figma-Token': jeton }
}

// Les frames de premier niveau de la page : ce sont les illustrations.
async function listerFrames({ fileKey, pageId }) {
  const url = `${API_FIGMA}/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(pageId)}&depth=1`
  const reponse = await demander(url, { headers: jetonFigma() }, { quoi: 'Figma /nodes' })
  const json = await reponse.json()
  const page = Object.values(json.nodes ?? {})[0]?.document
  if (!page) throw new Error(`nœud ${pageId} introuvable dans le fichier ${fileKey}`)
  const frames = (page.children ?? []).filter((n) => n.type === 'FRAME' || n.type === 'COMPONENT')
  if (!frames.length) throw new Error(`aucune frame de premier niveau sous ${pageId}`)
  return { page, frames }
}

// L'API rend les images par lots ; on découpe pour ne pas dépasser les limites.
async function exporterImages({ fileKey }, frames, echelle, format) {
  const liens = {}
  for (let i = 0; i < frames.length; i += 15) {
    const paquet = frames.slice(i, i + 15)
    const ids = paquet.map((f) => f.id).join(',')
    const url =
      `${API_FIGMA}/v1/images/${fileKey}` +
      `?ids=${encodeURIComponent(ids)}&format=${format}&scale=${echelle}`
    const reponse = await demander(url, { headers: jetonFigma() }, { quoi: 'Figma /images' })
    const json = await reponse.json()
    if (json.err) throw new Error(`Figma /images : ${json.err}`)
    Object.assign(liens, json.images ?? {})
  }
  return liens
}

async function telecharger(url, chemin, quoi) {
  const reponse = await demander(url, {}, { quoi })
  await writeFile(chemin, Buffer.from(await reponse.arrayBuffer()))
}

// ─── Magnific (voie API) ───────────────────────────────────────────────────

function cleMagnific() {
  const cle = process.env.MAGNIFIC_API_KEY
  if (!cle) {
    throw new Error(
      'MAGNIFIC_API_KEY absent. Soit vous créez une clé sur ' +
        'magnific.com/user/organization/api-keys, soit vous passez par la voie MCP : ' +
        '`exporter` puis magnific/PILOTE-MCP.md.'
    )
  }
  return { 'x-magnific-api-key': cle, 'Content-Type': 'application/json' }
}

// Upscaler et style-transfer ne renvoient pas la même enveloppe : l'un imbrique
// dans `data` et nomme le champ `status`, l'autre est à plat avec `task_status`.
function lireTache(json) {
  const t = json?.data ?? json ?? {}
  return {
    taskId: t.task_id,
    statut: t.status ?? t.task_status,
    generees: Array.isArray(t.generated) ? t.generated : [],
  }
}

async function creerTache(endpoint, corps) {
  const reponse = await demander(
    `${API_MAGNIFIC}/v1/ai/${endpoint}`,
    { method: 'POST', headers: cleMagnific(), body: JSON.stringify(corps) },
    { quoi: `Magnific POST ${endpoint}` }
  )
  const tache = lireTache(await reponse.json())
  if (!tache.taskId) throw new Error(`Magnific POST ${endpoint} : pas de task_id`)
  return tache
}

async function suivreTache(endpoint, taskId, { intervalle = 5000, limiteMs = 900_000 } = {}) {
  const debut = Date.now()
  for (;;) {
    const reponse = await demander(
      `${API_MAGNIFIC}/v1/ai/${endpoint}/${taskId}`,
      { headers: cleMagnific() },
      { quoi: `Magnific GET ${endpoint}` }
    )
    const tache = lireTache(await reponse.json())
    if (tache.statut === 'COMPLETED') return tache
    if (tache.statut === 'FAILED') throw new Error(`tâche ${taskId} en échec côté Magnific`)
    if (Date.now() - debut > limiteMs) throw new Error(`tâche ${taskId} : délai dépassé`)
    await dormir(intervalle)
  }
}

// ─── préparation commune aux deux voies ────────────────────────────────────

function selectionner(frames, options) {
  let choix = frames
  if (options.filtre) {
    const re = new RegExp(options.filtre, 'i')
    choix = choix.filter((f) => re.test(f.name))
  }
  if (options.seulement) {
    const voulus = new Set(options.seulement.split(',').map((s) => slug(s.trim())))
    choix = choix.filter((f) => voulus.has(slug(f.name)))
  }
  if (options.limite) choix = choix.slice(0, Number(options.limite))
  return choix
}

// Vérifie le budget en pixels avant de dépenser le moindre crédit.
function verifierTaille(choix, echelle, facteur) {
  for (const f of choix) {
    const b = f.absoluteBoundingBox
    if (!b) continue
    const l = Math.round(b.width * echelle * facteur)
    const h = Math.round(b.height * echelle * facteur)
    if (l * h > PIXELS_MAX) {
      throw new Error(
        `« ${f.name} » : ${Math.round(b.width * echelle)}px × ${facteur} → ` +
          `${(l * h / 1e6).toFixed(1)} Mpx, au-delà de la limite Magnific de 25,3 Mpx. ` +
          `Baissez figma.echelle ou scale_factor dans la recette.`
      )
    }
  }
}

function paramsPour(recette, frame) {
  const params = { ...recette.params }
  if (typeof params.prompt === 'string') {
    params.prompt = params.prompt.replaceAll('{nom}', frame.name.trim())
  }
  return params
}

// Liste, filtre, exporte les PNG. Renvoie de quoi alimenter les deux voies.
async function preparer(config, options) {
  const recette = recetteDe(config)
  const echelle = config.figma.echelle ?? 1
  const format = config.figma.format ?? 'png'
  const facteur = FACTEURS[recette.params?.scale_factor] ?? 1

  const { frames } = await listerFrames(config.figma)
  const slugs = slugsUniques(frames)
  const parId = new Map(frames.map((f, i) => [f.id, slugs[i]]))
  const choix = selectionner(frames, options)
  if (!choix.length) throw new Error('aucune frame retenue (vérifiez --filtre / --seulement)')
  verifierTaille(choix, echelle, facteur)

  const sortie = resolve(RACINE, config.sortie ?? 'magnific/sortie')
  const dossierSource = join(sortie, 'source')
  const dossierRendu = join(sortie, 'rendu')
  await mkdir(dossierSource, { recursive: true })
  await mkdir(dossierRendu, { recursive: true })

  const cheminEtat = join(sortie, 'etat.json')
  const etat = JSON.parse(await readFile(cheminEtat, 'utf8').catch(() => '{}'))

  const aExporter = []
  for (const f of choix) {
    const nom = parId.get(f.id)
    const dejaLa = (await existe(join(dossierSource, `${nom}.${format}`))) &&
      etat[nom]?.echelle === echelle
    if (!dejaLa || options.reexporter) aExporter.push(f)
  }

  if (aExporter.length) {
    console.log(`Export Figma : ${aExporter.length} frame(s) en ${format} à ${echelle}×…`)
    const liens = await exporterImages(config.figma, aExporter, echelle, format)
    await enParallele(aExporter, 4, async (f) => {
      const url = liens[f.id]
      if (!url) throw new Error(`« ${f.name} » : Figma n'a pas rendu d'image`)
      const nom = parId.get(f.id)
      await telecharger(url, join(dossierSource, `${nom}.${format}`), `téléchargement ${nom}`)
      etat[nom] = { ...(etat[nom] ?? {}), nodeId: f.id, nomFigma: f.name, echelle }
    })
    await ecrireJson(cheminEtat, etat)
  } else {
    console.log('Export Figma : les sources sont déjà en cache.')
  }

  return { recette, echelle, format, frames, choix, parId, sortie, dossierSource, dossierRendu, cheminEtat, etat }
}

// ─── commandes ─────────────────────────────────────────────────────────────

async function commandeListe(config, options) {
  const { page, frames } = await listerFrames(config.figma)
  const choix = selectionner(frames, options)
  const slugs = slugsUniques(frames)
  const parId = new Map(frames.map((f, i) => [f.id, slugs[i]]))

  console.log(`Page « ${page.name} » — ${frames.length} frames, ${choix.length} retenue(s)\n`)
  for (const f of choix) {
    const b = f.absoluteBoundingBox
    const taille = b ? `${Math.round(b.width)}×${Math.round(b.height)}` : '?'
    console.log(`  ${parId.get(f.id).padEnd(20)} ${f.id.padEnd(14)} ${taille.padEnd(11)} ${f.name}`)
  }
}

// Voie MCP : on s'arrête après l'export et on écrit le carnet de tâches.
async function commandeExporter(config, options) {
  const p = await preparer(config, options)
  const rel = afficherChemin

  const carnet = {
    genere: new Date().toISOString(),
    recette: config.recette,
    endpoint: p.recette.endpoint,
    outilMcp: p.recette.outilMcp ?? 'images_upscale',
    dossierSource: rel(p.dossierSource),
    dossierRendu: rel(p.dossierRendu),
    taches: p.choix.map((f) => {
      const nom = p.parId.get(f.id)
      return {
        nom,
        nomFigma: f.name.trim(),
        nodeId: f.id,
        source: rel(join(p.dossierSource, `${nom}.${p.format}`)),
        rendu: rel(join(p.dossierRendu, `${nom}.png`)),
        params: paramsPour(p.recette, f),
      }
    }),
  }
  const chemin = join(p.sortie, 'taches.json')
  await ecrireJson(chemin, carnet)

  console.log(
    `\n${carnet.taches.length} source(s) dans ${afficherChemin(p.dossierSource)}` +
      `\nCarnet de tâches : ${afficherChemin(chemin)}` +
      `\n\nVoie MCP — dans Claude Code, avec le serveur magnific connecté :` +
      `\n  « Suis magnific/PILOTE-MCP.md »`
  )
}

// Voie API : envoi, attente et récupération, avec reprise.
async function commandeLancer(config, options) {
  if (!options.sec) cleMagnific() // échoue avant l'export plutôt qu'à la 1re tâche
  const p = await preparer(config, options)
  if (options.sec) {
    console.log(
      `\nMode --sec : ${p.choix.length} source(s) prête(s), aucun crédit dépensé.` +
        `\nRecette « ${config.recette} » → POST /v1/ai/${p.recette.endpoint}` +
        `\n${JSON.stringify(paramsPour(p.recette, p.choix[0]), null, 2)}`
    )
    return
  }

  const { etat, cheminEtat } = p
  const compte = { fait: 0, saute: 0, echec: 0 }

  await enParallele(p.choix, config.concurrence ?? 3, async (f) => {
    const nom = p.parId.get(f.id)
    const image = await readFile(join(p.dossierSource, `${nom}.${p.format}`))
    const params = paramsPour(p.recette, f)
    const signature = empreinte({
      endpoint: p.recette.endpoint,
      params,
      echelle: p.echelle,
      source: image.length,
    })
    const precedent = etat[nom]

    if (precedent?.statut === 'COMPLETED' && precedent.signature === signature && !options.refaire) {
      compte.saute++
      return
    }

    try {
      // Une tâche déjà créée par un passage interrompu est reprise, pas
      // relancée : on ne paie pas deux fois le même crédit.
      let taskId
      if (precedent?.taskId && precedent.signature === signature && !options.refaire) {
        taskId = precedent.taskId
        console.log(`… ${nom} : reprise de la tâche ${taskId}`)
      } else {
        ;({ taskId } = await creerTache(p.recette.endpoint, {
          ...params,
          image: image.toString('base64'),
        }))
        etat[nom] = {
          ...(etat[nom] ?? {}),
          recette: config.recette,
          signature,
          taskId,
          statut: 'IN_PROGRESS',
        }
        await ecrireJson(cheminEtat, etat) // sauvegardé avant l'attente : reprise possible
        console.log(`→ ${nom} : tâche ${taskId}`)
      }

      const finie = await suivreTache(p.recette.endpoint, taskId)
      if (!finie.generees.length) throw new Error('tâche terminée sans image')

      const fichiers = []
      for (const [i, url] of finie.generees.entries()) {
        const suffixe = finie.generees.length > 1 ? `-${i + 1}` : ''
        await telecharger(url, join(p.dossierRendu, `${nom}${suffixe}.png`), `rendu ${nom}`)
        fichiers.push(`rendu/${nom}${suffixe}.png`)
      }

      etat[nom] = { ...etat[nom], statut: 'COMPLETED', fichiers, fini: new Date().toISOString() }
      delete etat[nom].erreur
      await ecrireJson(cheminEtat, etat)
      compte.fait++
      console.log(`✓ ${nom} → ${fichiers.join(', ')}`)
    } catch (err) {
      etat[nom] = { ...(etat[nom] ?? {}), statut: 'FAILED', erreur: String(err.message ?? err) }
      await ecrireJson(cheminEtat, etat)
      compte.echec++
      console.error(`✗ ${nom} : ${err.message ?? err}`)
    }
  })

  console.log(
    `\n${compte.fait} rendu(s), ${compte.saute} déjà à jour, ${compte.echec} en échec.` +
      `\nRésultats : ${afficherChemin(p.dossierRendu)}`
  )
  if (compte.echec) process.exitCode = 1
}

async function commandeEtat(config) {
  const sortie = resolve(RACINE, config.sortie ?? 'magnific/sortie')
  const etat = JSON.parse(await readFile(join(sortie, 'etat.json'), 'utf8').catch(() => '{}'))
  const entrees = Object.entries(etat)
  if (!entrees.length) return console.log('Aucun état enregistré.')

  const parStatut = {}
  for (const [nom, e] of entrees) {
    ;(parStatut[e.statut ?? 'EXPORTÉ'] ??= []).push(nom)
    if (e.statut === 'FAILED') console.log(`✗ ${nom} : ${e.erreur}`)
  }
  console.log(
    Object.entries(parStatut)
      .map(([s, l]) => `${s} : ${l.length}`)
      .join('   ')
  )
}

// ─── entrée ────────────────────────────────────────────────────────────────

const DRAPEAUX = ['sec', 'refaire', 'reexporter']

function lireArguments(argv) {
  const commande = argv[0] ?? 'aide'
  const options = {}
  for (let i = 1; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const [cle, valeurCollee] = argv[i].slice(2).split('=')
    options[cle] = DRAPEAUX.includes(cle) ? true : (valeurCollee ?? argv[++i])
  }
  return { commande, options }
}

const AIDE = `
Figma → Magnific : rendus en lot à partir d'une page Figma.

  node magnific/magnific.mjs liste       liste les frames de la page
  node magnific/magnific.mjs exporter    exporte les PNG + écrit taches.json (voie MCP)
  node magnific/magnific.mjs lancer      exporte, envoie, attend, récupère (voie clé API)
  node magnific/magnific.mjs etat        résumé du dernier passage

Options
  --config <fichier>   configuration (défaut : magnific/config.json)
  --recette <nom>      recette à utiliser, remplace celle de la config
  --filtre <regex>     ne garder que les frames dont le nom correspond
  --seulement a,b,c    ne garder que ces noms de frames
  --limite <n>         n premières frames — pratique pour un essai
  --sec                tout préparer sans appeler Magnific (aucun crédit dépensé)
  --refaire            ignorer le cache et relancer les tâches
  --reexporter         forcer le réexport des PNG depuis Figma

Variables d'environnement
  FIGMA_TOKEN          jeton personnel Figma — requis
  MAGNIFIC_API_KEY     clé API Magnific — requise pour \`lancer\` seulement
`

async function principal() {
  const { commande, options } = lireArguments(process.argv.slice(2))
  if (['aide', '--help', '-h'].includes(commande)) return console.log(AIDE.trim())

  const config = await lireConfig(resolve(RACINE, options.config ?? 'magnific/config.json'))
  if (options.recette) config.recette = options.recette

  const commandes = {
    liste: commandeListe,
    exporter: commandeExporter,
    lancer: commandeLancer,
    etat: commandeEtat,
  }
  if (!commandes[commande]) throw new Error(`commande inconnue : ${commande}\n${AIDE}`)
  return commandes[commande](config, options)
}

principal().catch((err) => {
  console.error(`\nErreur — ${err.message ?? err}`)
  process.exit(1)
})

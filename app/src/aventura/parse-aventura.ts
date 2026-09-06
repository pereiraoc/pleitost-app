// PARSER DO FORMATO DE AVENTURA (v2.1, aprovado 2026-09-05) — puro, sem DOM.
// Entrada: o doc (corpo + id); saída: AventuraModel (types.ts). As seções são
// achadas pelos NOMES declarados no Contexto Base (config.ts) — nunca por
// heurística de texto. Registros = `###` + callout `[!info]`; leituras =
// `[!quote]`; segredos = `[!gm]`; combates = fences combat-marker dentro da
// cena. Nota sem o esqueleto → `temFormato: false` (a view cai no render de
// hoje). Reusa: calloutTemplateFields (campos), combat-marker.ts (roster),
// parse-leaflet (mapa).
import type { VaultDoc } from '../data/types'
import type { CalloutField } from '../components/compendium/callout-template-fields'
import { parseCombatMarkerBlocks } from '../mestre/combat-marker'
import { parseLeafletBlock } from '../map/parse-leaflet'
import { AVENTURA_CONFIG_DEFAULT, type AventuraConfig } from './config'
import {
  calloutBody,
  calloutFields,
  extractCallouts,
  leituraDe,
  segredoDe,
  withoutBlocks,
  type CalloutBlock,
} from './callouts'
import { childHeadings, findHeading, scanHeadings, sectionBody, type HeadingLine } from './markdown-sections'
import { slugify } from './slug'
import type { AventuraModel, Cena, Ref, Registro, Segmento } from './types'

const FENCE_OPEN_RE = /^```\s*(combat-marker|combat-marker-small|combat-tracker|combat-tracker-small)\s*$/
const FENCE_CLOSE_RE = /^```\s*$/
const REF_RE = /\[\[(#?)([^\]|]+)(?:\|([^\]]+))?\]\]/g

/** Campo por rótulo (case/acento-insensível no rótulo, valor cru). */
export function campo(campos: readonly CalloutField[], label: string): string | null {
  const key = norm(label)
  return campos.find((c) => norm(c.label) === key)?.value ?? null
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s_]+/g, ' ').trim()
}

/** Refs `[[#X]]`/`[[X|Y]]` de um valor de campo, na ordem. */
export function refsDe(valor: string | null): Ref[] {
  if (!valor) return []
  const out: Ref[] = []
  for (const m of valor.matchAll(REF_RE)) {
    const interno = m[1] === '#'
    const alvo = m[2]!.trim()
    out.push({ alvo, label: (m[3] ?? alvo).trim(), interno })
  }
  return out
}

/** Itens de um campo-lista (`**Frases:**` com bullets): uma entrada por bullet;
 *  sem bullets, o valor inteiro é o único item. */
export function itensDe(valor: string | null): string[] {
  if (!valor) return []
  const linhas = valor.split('\n').map((l) => l.trim()).filter(Boolean)
  const bullets = linhas.filter((l) => /^[-*]\s+/.test(l)).map((l) => l.replace(/^[-*]\s+/, ''))
  return bullets.length ? bullets : [valor.trim()]
}

function registroDe(nome: string, lines: readonly string[]): Registro {
  const blocks = extractCallouts(lines)
  const campos: CalloutField[] = []
  const leituras = []
  const segredos: string[] = []
  const usados: CalloutBlock[] = []
  for (const b of blocks) {
    if (b.tipo === 'info') {
      campos.push(...calloutFields(b))
      usados.push(b)
    } else if (b.tipo === 'quote' || b.tipo === 'cite') {
      leituras.push(leituraDe(b))
      usados.push(b)
    } else if (b.tipo === 'gm') {
      segredos.push(segredoDe(b))
      usados.push(b)
    }
  }
  return {
    slug: slugify(nome),
    nome,
    campos,
    leituras,
    segredos,
    corpo: withoutBlocks(lines, usados).join('\n').trim(),
  }
}

/** Corpo de uma cena em segmentos: markdown + fences de combate (com o `####`
 *  mais próximo acima como título). O callout `[!info]` da cena sai do md (a
 *  view mostra os campos como chips); leituras e segredos ficam no fluxo. */
function segmentosDe(lines: readonly string[], docId: string, cenaSlug: string, infoBlock: CalloutBlock | null): Segmento[] {
  const src = infoBlock ? withoutBlocks(lines, [infoBlock]) : [...lines]
  const out: Segmento[] = []
  let md: string[] = []
  let ultimoH4 = ''
  let n = 0
  let i = 0
  const flushMd = () => {
    const texto = md.join('\n').trim()
    if (texto) out.push({ kind: 'md', md: texto })
    md = []
  }
  while (i < src.length) {
    const l = src[i]!
    const h4 = /^####\s+(.*?)\s*$/.exec(l)
    if (h4) ultimoH4 = h4[1]!
    if (FENCE_OPEN_RE.test(l.trim())) {
      let j = i + 1
      const code: string[] = []
      while (j < src.length && !FENCE_CLOSE_RE.test(src[j]!.trim())) {
        code.push(src[j]!)
        j++
      }
      flushMd()
      n += 1
      const wrapped = ['```combat-marker', ...code, '```'].join('\n')
      const parsed = parseCombatMarkerBlocks(wrapped)
      out.push({
        kind: 'combate',
        n,
        titulo: ultimoH4,
        roster: parsed.ok ? parsed.roster : { entries: [] },
        code: code.join('\n'),
        encounterPath: `${docId}#${cenaSlug}#${n}`,
      })
      i = j + 1
      continue
    }
    md.push(l)
    i++
  }
  flushMd()
  return out
}

function cenaDe(h: HeadingLine, lines: readonly string[], headings: readonly HeadingLine[], cfg: AventuraConfig, docId: string, n: number): Cena {
  const body = sectionBody(lines, headings, h)
  const prefix = new RegExp(`^${escapeRe(cfg.secoes.cena)}\\s+(\\d+)\\s*[—–-]\\s*(.+)$`)
  const m = prefix.exec(h.text)
  const titulo = (m?.[2] ?? h.text).trim()
  const slug = slugify(titulo)
  const blocks = extractCallouts(body)
  const info = blocks.find((b) => b.tipo === 'info') ?? null
  const campos = info ? calloutFields(info) : []
  const leituras = blocks.filter((b) => b.tipo === 'quote' || b.tipo === 'cite').map(leituraDe)
  return {
    n: m ? Number(m[1]) : n,
    titulo,
    slug,
    campos,
    tipo: campo(campos, 'Tipo'),
    locais: refsDe(campo(campos, 'Local')),
    personagens: refsDe(campo(campos, 'Personagens')),
    leituras,
    segmentos: segmentosDe(body, docId, slug, info),
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function camposECorpo(lines: readonly string[]): { campos: CalloutField[]; corpo: string; leituras: ReturnType<typeof leituraDe>[] } {
  const blocks = extractCallouts(lines)
  const info = blocks.find((b) => b.tipo === 'info') ?? null
  return {
    campos: info ? calloutFields(info) : [],
    corpo: (info ? withoutBlocks(lines, [info]) : [...lines]).join('\n').trim(),
    leituras: blocks.filter((b) => b.tipo === 'quote' || b.tipo === 'cite').map(leituraDe),
  }
}

export function parseAventura(doc: Pick<VaultDoc, 'id' | 'body'>, cfg: AventuraConfig = AVENTURA_CONFIG_DEFAULT): AventuraModel {
  const lines = doc.body.split(/\r?\n/)
  const headings = scanHeadings(lines)
  const S = cfg.secoes

  const hResumo = findHeading(headings, 1, S.resumo)
  const hContexto = findHeading(headings, 1, S.contexto)
  const hCenas = findHeading(headings, 1, S.cenas)
  const temFormato = !!(hResumo || hCenas)

  const vazio: AventuraModel = {
    temFormato,
    resumo: { texto: '', estruturaExtra: [], comoLer: null, roteiro: null },
    contextoAventura: null,
    notasMestre: null,
    personagens: [],
    locais: [],
    mapa: null,
    abertura: null,
    cenas: [],
    desfecho: null,
    combatesSoltos: [],
  }
  if (!temFormato) {
    // Nota legada: só destaca os fences soltos (ex.: "Encontro").
    vazio.combatesSoltos = segmentosDe(lines, doc.id, 'nota', null).filter(
      (s): s is Extract<Segmento, { kind: 'combate' }> => s.kind === 'combate',
    )
    return vazio
  }
  const model = vazio

  // 1. Resumo
  if (hResumo) {
    const body = sectionBody(lines, headings, hResumo)
    const filhos = childHeadings(headings, hResumo)
    const hRoteiro = filhos.find((h) => h.text === S.roteiro) ?? null
    const topo = hRoteiro ? lines.slice(hResumo.line + 1, hRoteiro.line) : body
    for (const b of extractCallouts(topo)) {
      if (b.tipo === 'abstract' || b.tipo === 'summary' || b.tipo === 'tldr') model.resumo.texto = calloutBody(b)
      else if (b.tipo === 'info' && /estrutura/i.test(b.titulo)) model.resumo.estruturaExtra = calloutFields(b)
      else if (b.tipo === 'info' && /como ler/i.test(b.titulo)) model.resumo.comoLer = calloutBody(b)
    }
    if (hRoteiro) model.resumo.roteiro = sectionBody(lines, headings, hRoteiro).join('\n').trim()
  }

  // 2. Contexto
  if (hContexto) {
    for (const h of childHeadings(headings, hContexto)) {
      const body = sectionBody(lines, headings, h)
      if (h.text === S.contexto_aventura) model.contextoAventura = body.join('\n').trim()
      else if (h.text === S.notas_mestre) model.notasMestre = body.join('\n').trim()
      else if (h.text === S.personagens) {
        model.personagens = childHeadings(headings, h).map((r) => registroDe(r.text, sectionBody(lines, headings, r)))
      } else if (h.text === S.locais) {
        for (const r of childHeadings(headings, h)) {
          const rb = sectionBody(lines, headings, r)
          if (r.text === S.mapa) model.mapa = parseLeafletBlock(rb.join('\n'))
          else model.locais.push(registroDe(r.text, rb))
        }
      }
    }
  }

  // 3. Cenas
  if (hCenas) {
    const cenaRe = new RegExp(`^${escapeRe(S.cena)}\\s+\\d+\\s*[—–-]`)
    let n = 0
    for (const h of childHeadings(headings, hCenas)) {
      const body = sectionBody(lines, headings, h)
      if (h.text === S.abertura) {
        const { campos, corpo } = camposECorpo(body)
        model.abertura = { campos, corpo }
      } else if (h.text === S.desfecho) {
        model.desfecho = camposECorpo(body)
      } else if (cenaRe.test(h.text)) {
        n += 1
        model.cenas.push(cenaDe(h, lines, headings, cfg, doc.id, n))
      }
    }
  }
  return model
}

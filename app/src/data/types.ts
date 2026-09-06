// Tipos do vault-data gerado por extractor/extract-vault.mjs (1 JSON por .md).
// Escritos à mão; o drift contra o extractor é guardado por tests/catalog.test.ts,
// que valida estes shapes sobre os JSONs reais.

export type DocKind = 'content' | 'scaffolding'

/** Entrada de docs[] no index.json (docs scaffolding trazem só id/path/kind). */
export interface IndexDocEntry {
  id: string
  path: string
  kind: DocKind
  basename?: string
  type?: string | null
  subtype?: string | null
  /** Primeiro alias do FM (#519) — display do mundo (ex.: Guerrilheiro). */
  alias?: string | null
  /** TODOS os aliases do FM — o resolve de wikilink os considera (report
   *  2026-08-31: [[Brigada Militar]] resolve por alias como no Obsidian). */
  aliases?: string[]
  /** Frontmatter `grupo`: string ("cac-simples") ou lista de wikilinks. */
  grupo?: string | string[] | null
  /** Mãos da arma (#544 — só docs subtype Arma; filtro do Empregado). */
  maos?: number
  /** Requisito de Força da arma (propriedade "Força N") — idem. */
  forca?: number
  /** SENHA POR AVENTURA (2026-09-05): doc publicado CIFRADO (extractor/cifra-doc)
   *  — a lista mostra só os campos da lista trancada + 🔒. */
  protegido?: boolean
}

export interface IndexManifest {
  vaultRoot: string
  counts: {
    content: number
    scaffolding: number
    imagesCopied: number
    imagesReferenced: number
    imagesOrphan: number
    imagesMissing: number
  }
  byType: Record<string, number>
  docs: IndexDocEntry[]
}

export interface DocLink {
  target: string
  kind: string
  alias?: string
}

/** Referência de imagem no doc; `from` é "body" ou "frontmatter:<campo>". */
export interface DocImage {
  target: string
  from: string
}

export interface DocHeading {
  level: number
  text: string
}

/** Regra de uma nota de Condição, parseada pelo subsistema de condição do
 *  plugin (Escalavel/Derivar/Somar Condicao.X) — só presente em docs de
 *  Condição. `kind: 'unknown'` = linha que o parser de condição não reconheceu. */
export interface ConditionRule {
  kind: string
  [k: string]: unknown
}
export interface ConditionParse {
  /** >1 quando a condição escala (ex.: `Escalavel 3`). */
  scaleMax: number
  rules: ConditionRule[]
  /** condições derivadas (`Derivar Condicao X`). */
  derived: string[]
}

/** Elemento da DSL autosheet-rules; `parsed` é a AST do rule-parser do plugin (não avaliada aqui). */
export interface RuleElement {
  raw: string
  parsed: unknown
  /** Só em notas de Condição: o parse da MESMA linha pelo parser de condição
   *  (o `parsed` genérico fica vazio pra esses verbos). Fonte da cobertura F7. */
  condition?: ConditionParse
}

export interface VaultDoc {
  id: string
  path: string
  basename: string
  type: string | null
  subtype: string | null
  grupo: string | string[] | null
  frontmatter: Record<string, unknown>
  inlineFields: Record<string, string>
  ruleElements: RuleElement[]
  links: DocLink[]
  images: DocImage[]
  headings: DocHeading[]
  body: string
  /** Prosa parseada dos callouts do body — só para `type === 'Localização'`.
   *  O template da vault grava Descrição/Aparência/População dentro de um
   *  callout `[!info] Informações` e os distritos/pontos dentro de um callout
   *  `[!info] Distritos e Locais de Interesse`. O FM tem esses campos como
   *  placeholders vazios; a fonte-de-verdade da prosa vive aqui (populado
   *  pelo extractor/parse-location-body.mjs). */
  locationBody?: LocationBody
  /** SENHA POR AVENTURA: envelope cifrado (extractor/cifra-doc.mjs). Presente =
   *  doc TRANCADO (corpo/FM privado ausentes); data/doc-lock.ts decifra com a
   *  senha ou a chave do dev e devolve o doc completo SEM este campo. */
  protegido?: import('./doc-lock').Envelope
}

export interface LocationBody {
  populacao: string | null
  descricao: string | null
  aparencia: string | null
  /** Contexto histórico do callout abstract (template POA/fantasia, #519). */
  contexto?: string | null
  organizacoesInfluentes?: string | null
  acontecimentoRecente?: string | null
  locaisInteresse: string | null
  /** Bloco leaflet do template POA: mapa da localização (#519). minZoom/
   *  maxZoom dos markers = gates de CAMADA da nota (Bairros no zoom afastado,
   *  pontos de interesse no aproximado); defaultZoom ancora a conversão
   *  escala→zoom do viewer. Opcionais: dataset antigo não os tem. */
  leaflet?: {
    image: string
    bounds: [[number, number], [number, number]] | null
    defaultZoom?: number | null
    markers: Array<{
      tipo: string
      lat: number
      long: number
      nome: string
      minZoom?: number | null
      maxZoom?: number | null
    }>
  } | null
}

export interface AssetEntry {
  path: string
  basename: string
  copiedTo: string
  sha256: string
  referencedBy: string[]
  orphan: boolean
  ambiguous: boolean
}

export interface AssetsManifest {
  counts: Record<string, number>
  assets: AssetEntry[]
  missing: unknown[]
}

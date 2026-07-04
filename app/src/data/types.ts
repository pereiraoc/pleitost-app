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
  grupo?: string[] | null
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

/** Elemento da DSL autosheet-rules; `parsed` é a AST do rule-parser do plugin (não avaliada aqui). */
export interface RuleElement {
  raw: string
  parsed: unknown
}

export interface VaultDoc {
  id: string
  path: string
  basename: string
  type: string | null
  subtype: string | null
  grupo: string[] | null
  frontmatter: Record<string, unknown>
  inlineFields: Record<string, string>
  ruleElements: RuleElement[]
  links: DocLink[]
  images: DocImage[]
  headings: DocHeading[]
  body: string
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

// Gera src/markdown/supercharged-icons.ts a partir da FONTE DE VERDADE do
// Obsidian na vault (não inventado): os SELETORES do plugin supercharged-links
// (.obsidian/plugins/supercharged-links-obsidian/data.json, na ORDEM — a
// cascata do CSS gerado faz o ÚLTIMO seletor que casa vencer) + os emojis do
// Style Settings (.obsidian/plugins/obsidian-style-settings/data.json, chave
// `supercharged-links@@<uid>-before`). Reproduz também o `i` (case-insensitive)
// e os seletores por PATH ($= endswith, *= contains, ^= startswith) que o app
// ignorava — Vigor/Ímpeto ("Defesas-e-Resistências" vs "defesas-e-resistências"),
// Percepção/Intuição (path), Ações (custo::), Magias (escola/elemento) e
// Sintonias ficavam sem ícone (report 2026-09-07). Rode `npm run icons` quando
// a config do Obsidian mudar; o arquivo gerado é commitado.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { VAULT_ROOT } from '../../extractor/paths.mjs'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const out = path.join(appDir, 'src', 'markdown', 'supercharged-icons.ts')
const scPath = path.join(VAULT_ROOT, '.obsidian', 'plugins', 'supercharged-links-obsidian', 'data.json')
const ssPath = path.join(VAULT_ROOT, '.obsidian', 'plugins', 'obsidian-style-settings', 'data.json')

const sc = JSON.parse(fs.readFileSync(scPath, 'utf8'))
const ss = JSON.parse(fs.readFileSync(ssPath, 'utf8'))

const selectors = []
for (const s of sc.selectors ?? []) {
  const icon = String(ss[`supercharged-links@@${s.uid}-before`] ?? '').trim()
  if (!icon || !s.selectPrepend) continue // só o que vira ícone ANTES do link
  selectors.push({
    tipo: s.type === 'path' ? 'path' : 'attribute',
    nome: String(s.name),
    valor: String(s.value),
    match: String(s.match ?? 'exact'),
    caseSensitive: !!s.matchCaseSensitive,
    icone: icon,
  })
}

// Mapas derivados (compatibilidade: chave = valor EXATO da faceta; último vence).
const byAttr = (name) =>
  Object.fromEntries(selectors.filter((s) => s.tipo === 'attribute' && s.nome === name && s.match === 'exact').map((s) => [s.valor, s.icone]))

const banner = `// GERADO por app/scripts/gen-supercharged-icons.mjs a partir da config do
// Obsidian na vault (supercharged-links + Style Settings). NÃO EDITAR À MÃO —
// rode \`npm run icons\`. Fonte: ${path.relative(VAULT_ROOT, scPath)} + Style Settings.
//
// Semântica reproduzida (link-icon.ts): seletores na ORDEM da config; atributo
// casa por valor exato SEM caixa (\`i\`), path por sufixo/trecho/prefixo; o
// ÚLTIMO seletor que casa vence (cascata do CSS gerado).

export interface ScSelector {
  tipo: 'attribute' | 'path'
  /** atributo (categoria/subcategoria/grupo/custo/escola/elemento/sintonia/Tipo) ou 'path'. */
  nome: string
  valor: string
  match: 'exact' | 'endswith' | 'startswith' | 'contains' | string
  caseSensitive: boolean
  icone: string
}

export const SC_SELECTORS: ScSelector[] = ${JSON.stringify(selectors, null, 2)}

/** grupo (arma) → emoji (derivado; compatibilidade). */
export const SC_GRUPO: Record<string, string> = ${JSON.stringify(byAttr('grupo'), null, 2)}

/** subcategoria → emoji (derivado; compatibilidade). */
export const SC_SUBCATEGORIA: Record<string, string> = ${JSON.stringify(byAttr('subcategoria'), null, 2)}

/** categoria → emoji (derivado; compatibilidade). */
export const SC_CATEGORIA: Record<string, string> = ${JSON.stringify(byAttr('categoria'), null, 2)}
`
fs.writeFileSync(out, banner)
console.log(`[gen-supercharged-icons] ${selectors.length} seletores → ${path.relative(appDir, out)}`)

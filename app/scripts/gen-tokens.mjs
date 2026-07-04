#!/usr/bin/env node
// Gera src/styles/tokens.css e src/generated/tokens.ts a partir de
// design-system/design-system.json. Determinístico: a ordem vem da spec
// (stableStringify) e nenhum timestamp é gravado. Rode via `npm run tokens`.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoDir = path.dirname(appDir)
const specPath = path.join(repoDir, 'design-system', 'design-system.json')

const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'))
const tokens = spec.tokens
const sourceCommit = spec.$sourceCommit ?? 'desconhecido'

const kebab = (s) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()

const banner = `GERADO por app/scripts/gen-tokens.mjs a partir de design-system/design-system.json — NÃO EDITAR À MÃO.
Fonte: plugin pleitost-autosheet @ ${sourceCommit}`

// ---------- tokens.css ----------
const seen = new Map()
const cssLines = []

for (const [group, names] of Object.entries(tokens.colors)) {
  cssLines.push(`  /* colors.${group} */`)
  for (const [name, value] of Object.entries(names)) {
    const varName = `--pleitost-color-${kebab(group)}-${kebab(name)}`
    if (seen.has(varName) && seen.get(varName) !== value) {
      throw new Error(`Colisão de custom property após kebab-case: ${varName}`)
    }
    seen.set(varName, value)
    cssLines.push(`  ${varName}: ${value};`)
  }
}

for (const tier of tokens.typography.tiers) {
  const slug = kebab(tier.name)
  cssLines.push(`  /* typography ${tier.name} — ${tier.role} (${tier.style}) */`)
  cssLines.push(`  --pleitost-type-${slug}-size: ${tier.size};`)
  cssLines.push(`  --pleitost-type-${slug}-weight: ${tier.weight};`)
}

const css = `/* ${banner.split('\n').join('\n   ')} */\n:root {\n${cssLines.join('\n')}\n}\n`
fs.writeFileSync(path.join(appDir, 'src', 'styles', 'tokens.css'), css)

// ---------- tokens.ts ----------
const colorVars = {}
for (const [group, names] of Object.entries(tokens.colors)) {
  colorVars[group] = {}
  for (const name of Object.keys(names)) {
    colorVars[group][name] = `var(--pleitost-color-${kebab(group)}-${kebab(name)})`
  }
}

const ts = `/* ${banner.split('\n').join('\n   ')} */

/** Espelho 1:1 de design-system.json → tokens (registro central; nunca hardcodar no call-site). */
export const tokens = ${JSON.stringify(tokens, null, 2)} as const

/** Nome da custom property CSS de cada cor de tokens.colors (mesmo kebab-case de tokens.css). */
export const colorVars = ${JSON.stringify(colorVars, null, 2)} as const

export const colors = tokens.colors
export const emojis = tokens.emojis
export const emojiCostExtra = tokens.emojiCostExtra
export const typography = tokens.typography
`

const genDir = path.join(appDir, 'src', 'generated')
fs.mkdirSync(genDir, { recursive: true })
fs.writeFileSync(path.join(genDir, 'tokens.ts'), ts)

console.log(`tokens.css: ${seen.size} cores + ${tokens.typography.tiers.length} tiers tipográficos`)
console.log(`tokens.ts: ${Object.keys(tokens.emojis).length} grupos de emojis, ${Object.keys(tokens.colors).length} grupos de cores`)

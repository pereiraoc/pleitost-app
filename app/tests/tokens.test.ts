// Integração sobre artefatos reais: garante que tokens.css/tokens.ts estão
// em dia com design-system/design-system.json e que o gerador é idempotente.
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { colorVars, tokens } from '../src/generated/tokens'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoDir = path.dirname(appDir)
const spec = JSON.parse(
  fs.readFileSync(path.join(repoDir, 'design-system', 'design-system.json'), 'utf8'),
)
const cssPath = path.join(appDir, 'src', 'styles', 'tokens.css')
const tsPath = path.join(appDir, 'src', 'generated', 'tokens.ts')

describe('tokens gerados do design-system', () => {
  it('tokens.ts espelha spec.tokens 1:1', () => {
    expect(tokens).toEqual(spec.tokens)
  })

  it('toda cor da spec vira custom property em tokens.css com o valor exato', () => {
    const css = fs.readFileSync(cssPath, 'utf8')
    for (const [group, names] of Object.entries(spec.tokens.colors)) {
      for (const [name, value] of Object.entries(names as Record<string, string>)) {
        const ref = (colorVars as Record<string, Record<string, string>>)[group]?.[name]
        expect(ref, `colorVars.${group}.${name}`).toMatch(/^var\(--pleitost-color-.+\)$/)
        const varName = ref.slice('var('.length, -1)
        expect(css, `${group}.${name}`).toContain(`${varName}: ${value};`)
      }
    }
  })

  it('gerador é idempotente e os artefatos commitados estão em dia', () => {
    const before = {
      css: fs.readFileSync(cssPath, 'utf8'),
      ts: fs.readFileSync(tsPath, 'utf8'),
    }
    execFileSync(process.execPath, [path.join(appDir, 'scripts', 'gen-tokens.mjs')])
    expect(fs.readFileSync(cssPath, 'utf8')).toBe(before.css)
    expect(fs.readFileSync(tsPath, 'utf8')).toBe(before.ts)
  })
})

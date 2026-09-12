// Report 2026-09-12 ("a imagem que mostra do Sargento Valdir Brum na aba de
// Biografia"): retrato retangular cortado NO MEIO — o rosto ficava de fora.
// O token --enquadramento-retrato já existia (2026-09-07) mas só alguns
// lugares o usavam; o resto herdava o `center` do object-fit. Guarda: todo
// lugar que mostra CARA de gente ancora pelo token, nunca por % solto.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { retratoCover, ENQUADRAMENTO_RETRATO } from '../src/components/retrato'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const src = (rel: string) => fs.readFileSync(path.join(appDir, 'src', rel), 'utf8')

/** Superfícies que mostram o retrato de uma PESSOA (herói, NPC, empregado). */
const TELAS = [
  'components/ficha/PerfilTab.tsx',
  'components/ficha/PessoasPanel.tsx',
  'components/creatures/CreaturesPages.tsx',
  'components/sessao/SessaoPage.tsx',
  'components/wizard/steps/PassoNome.tsx',
  'components/wizard/steps/PassoCompanheiro.tsx',
]

/** Seletores de retrato no CSS (miniaturas e quadros de figura). */
const SELETORES = [
  '.hero-portrait',
  '.npc-ic',
  '.combat-roster-avatar img',
  '.criacao-hero',
  '.av-figura-img',
  '.ctx-card-fig img',
]

describe('enquadramento do retrato', () => {
  it('o estilo compartilhado ancora no token', () => {
    expect(retratoCover.objectPosition).toBe(ENQUADRAMENTO_RETRATO)
    expect(retratoCover.objectFit).toBe('cover')
  })

  it('as telas de retrato usam o estilo compartilhado', () => {
    const sem = TELAS.filter((f) => !src(f).includes('retratoCover'))
    expect(sem).toEqual([])
  })

  it('nenhuma tela de retrato ancora por conta própria', () => {
    const solto = TELAS.filter((f) => /objectPosition: '(?!var\(--enquadramento)/.test(src(f)))
    expect(solto).toEqual([])
  })

  it('os seletores de retrato do CSS apontam pro token', () => {
    const css = fs.readFileSync(path.join(appDir, 'src/styles/app.css'), 'utf8')
    const sem = SELETORES.filter((sel) => {
      const i = css.indexOf(`${sel} {`)
      if (i < 0) return true
      const bloco = css.slice(i, css.indexOf('}', i))
      return !bloco.includes('var(--enquadramento-retrato)')
    })
    expect(sem).toEqual([])
  })
})

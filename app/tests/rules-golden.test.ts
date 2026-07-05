// @vitest-environment jsdom
// ORÁCULO das regras (#11, #3, #4, #5, #7): o golden
// reference/goldens/screens/carlos/editavel__tab-perfil.html é o render REAL
// do modo Editável do plugin pro Carlos. Este teste EXTRAI as opções/estados
// do golden e compara com a projeção de app/src/rules — a expectativa vem
// do golden, nunca do código do app.
import { describe, expect, it, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import { projectHeroRules } from '../src/rules/useHeroRules'
import type { HeroProjection } from '../src/rules/projection'
import type { RulesModel } from '../src/rules/rules-model'
import { ATTR_EMOJI, displayName, periciaEmoji, tokens } from '../src/components/ficha/registry'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoDir = path.dirname(appDir)
const vaultDataDir = path.join(repoDir, 'vault-data')

const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const CARLOS_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'
const carlos = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, `${CARLOS_ID}.json`), 'utf8'),
) as VaultDoc

/** Loader síncrono do disco (mesmo shape do loadDoc do app). */
const loadFromDisk = async (id: string): Promise<VaultDoc> =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

// ───────────────────────── golden parsing ─────────────────────────

const goldenHtml = fs.readFileSync(
  path.join(repoDir, 'reference/goldens/screens/carlos/editavel__tab-perfil.html'),
  'utf8',
)

interface GoldenOption {
  value: string
  label: string
  disabled: boolean
}

function optionsOf(select: HTMLSelectElement): GoldenOption[] {
  return [...select.querySelectorAll('option')].map((o) => ({
    value: o.getAttribute('value') ?? '',
    label: o.textContent ?? '',
    disabled: o.hasAttribute('disabled'),
  }))
}

/** Descarta a opção vazia "—" do topo (includeEmpty do linkedDropdown). */
function dropEmpty(opts: GoldenOption[]): GoldenOption[] {
  return opts.filter((o) => o.value !== '' || o.label !== '—')
}

let root: HTMLElement
let projection: HeroProjection
let model: RulesModel

beforeAll(async () => {
  root = document.createElement('div')
  root.innerHTML = goldenHtml
  const out = await projectHeroRules(carlos.frontmatter as Record<string, unknown>, catalog, loadFromDisk)
  projection = out.projection
  model = out.model
})

describe('projeção de regras vs golden Editável (Carlos)', () => {
  it('CLASSE: opções idênticas às do dropdown real', () => {
    const select = root.querySelector<HTMLSelectElement>('select.as-linked-dd-select[aria-label="Classe"]')!
    expect(select).toBeTruthy()
    const golden = dropEmpty(optionsOf(select))
    expect(projection.classes.map((o) => o.value)).toEqual(golden.map((o) => o.value))
    expect(projection.classes.map((o) => o.label)).toEqual(golden.map((o) => o.label))
  })

  it('SINTONIA: opções com alias curto idênticas às do dropdown real (#7)', () => {
    const select = root.querySelector<HTMLSelectElement>('select.as-linked-dd-select[aria-label="Sintonia"]')!
    expect(select).toBeTruthy()
    const golden = dropEmpty(optionsOf(select))
    expect(projection.sintonias.map((o) => o.value)).toEqual(golden.map((o) => o.value))
    expect(projection.sintonias.map((o) => o.label)).toEqual(golden.map((o) => o.label))
    expect(projection.sintoniaRuleLocked).toBe(false)
  })

  it('SUBCLASSES: mesmas escolhas, mesmas opções e mesmo pick do Editável', () => {
    const labels = [...root.querySelectorAll('.as-perfil-classlabels .as-perfil-label-link a')].map(
      (a) => a.getAttribute('data-href') ?? '',
    )
    const selects = [...root.querySelectorAll<HTMLSelectElement>('.as-perfil-classrow select.as-linked-dd-select')]
    expect(labels.length).toBe(selects.length)
    expect(projection.subclassChoices.map((c) => c.parent)).toEqual(labels)
    projection.subclassChoices.forEach((choice, i) => {
      const golden = optionsOf(selects[i])
      expect(choice.options.map((o) => o.value)).toEqual(golden.map((o) => o.value))
      expect(choice.options.map((o) => o.label)).toEqual(golden.map((o) => o.label))
    })
    // Pick atual = wikilink exibido no dd-link do golden.
    const links = [...root.querySelectorAll('.as-perfil-classrow .as-linked-dd-link a')].map(
      (a) => a.getAttribute('data-href') ?? '',
    )
    projection.subclassChoices.forEach((choice, i) => {
      expect(choice.pick).toBeTruthy()
      expect(choice.pick!.startsWith(`[[${links[i]}`)).toBe(true)
    })
  })

  it('ATRIBUTOS: cascata + restrição de principal batem célula a célula', () => {
    const cells = [...root.querySelectorAll('.as-perfil-attrrow .as-perfil-attr-cell')]
    expect(cells.length).toBe(4)
    expect(projection.atributos.length).toBe(4)
    projection.atributos.forEach((cell, i) => {
      const goldenCell = cells[i]
      const select = goldenCell.querySelector<HTMLSelectElement>('select.as-perfil-attr-select')
      if (select) {
        // Editável no golden ⇒ 2+ opções elegíveis na projeção.
        expect(cell.options.length).toBeGreaterThanOrEqual(2)
        const golden = optionsOf(select)
        expect(cell.options).toEqual(golden.map((o) => o.value))
        expect(cell.options.map((a) => `${ATTR_EMOJI[a]} ${a}`)).toEqual(golden.map((o) => o.label))
      } else {
        // Display fixo no golden ⇒ 0-1 opção na projeção; texto idêntico.
        expect(cell.options.length).toBeLessThanOrEqual(1)
        const display = goldenCell.querySelector('.as-perfil-attr-display span')!
        expect(cell.current ? `${ATTR_EMOJI[cell.current]} ${cell.current}` : '—').toBe(display.textContent)
      }
      expect(goldenCell.classList.contains('is-principal')).toBe(cell.isPrincipal)
    })
  })

  it('PERÍCIA do Passado: TODAS as opções do Editável, na mesma ordem (#3)', () => {
    const select = root.querySelector<HTMLSelectElement>('.as-bio-pass-per select.as-bio-select')!
    expect(select).toBeTruthy()
    const golden = dropEmpty(optionsOf(select))
    expect(projection.periciasPassado.map((o) => o.id)).toEqual(golden.map((o) => o.value))
    expect(projection.periciasPassado.map((o) => `${periciaEmoji(o.id)} ${displayName(o.id)}`.trim())).toEqual(
      golden.map((o) => o.label),
    )
    // Pick consolidado (incremento "Passado" do FM) presente nas opções.
    expect(projection.passadoPericiaPick).toBeTruthy()
    expect(golden.map((o) => o.value)).toContain(projection.passadoPericiaPick)
  })

  it('OFÍCIO do Passado: alternativas reais do plugin (#4)', () => {
    const select = root.querySelector<HTMLSelectElement>('.as-bio-pass-of select.as-bio-select')!
    expect(select).toBeTruthy()
    const golden = dropEmpty(optionsOf(select))
    expect(projection.oficiosPassado.map((o) => o.value)).toEqual(golden.map((o) => o.value))
    const labelOf = (v: string) =>
      v === 'Atuacao'
        ? `${tokens.emojis.perfil.Atuacao} Atuação`
        : `${tokens.emojis.perfil.OficioPassado} Ofício`
    expect(projection.oficiosPassado.map((o) => labelOf(o.value))).toEqual(golden.map((o) => o.label))
  })

  it('NATURALIDADE: árvore do Atlas idêntica linha a linha (#5)', () => {
    const select = root.querySelector<HTMLSelectElement>('.as-naturalidade-dd select.as-linked-dd-select')!
    expect(select).toBeTruthy()
    const golden = optionsOf(select)
    const lines = projection.naturalidadeLines
    expect(lines.map((l) => l.value ?? '')).toEqual(golden.map((o) => o.value))
    expect(lines.map((l) => l.label)).toEqual(golden.map((o) => o.label))
    expect(lines.map((l) => l.disabled)).toEqual(golden.map((o) => o.disabled))
  })

  it('coerência do model derivado do FM (picks do Passado)', () => {
    // Carlos: Enganação tem incremento "A: Passado"; Ofício "Poeta" idem.
    expect(model.meta.passadoPericia).toBe('Enganacao')
    expect(model.meta.passadoOficio).toBe('Oficio')
    expect(model.meta.passadoOficioTexto).toBe('Poeta')
  })
})

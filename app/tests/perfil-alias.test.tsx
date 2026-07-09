// @vitest-environment jsdom
// PERFIL — metas com ALIAS (Classe/Sintonia). O nome da CLASSE exibido tem que
// vir do MODELO PROJETADO (derivedFm), onde o rule-applier + merge-calculated
// MATERIALIZAM o `[[Base|Display]]` da especialização/maestria, e NÃO do FM cru
// (que, antes de salvar, pode ter só o wikilink base sem o display). Espelha o
// modo Editável do plugin pleitost-autosheet.
//
// Reproduz o BUG com dado REAL da vault: pega um herói cuja projeção compõe um
// display rico ("Senhor-da-Guerra Combatente" via as habilidades do Ex-Tenente
// Deodoro), APAGA o display do wikilink cru pra `[[Comandante]]` e verifica que
// o Perfil ainda exibe o DISPLAY do alias — só possível lendo o derivedFm.
import { beforeAll, afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { PerfilTab } from '../src/components/ficha/PerfilTab'
import { projectHeroRules } from '../src/rules/useHeroRules'
import { linkLabel } from '../src/markdown/dataview-value'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)
const load = async (id: string) =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

const DEODORO_ID = 'Sistema/Criaturas/Heróis/Ex-Tenente Deodoro Fontesseca'
const deodoro = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, `${DEODORO_ID}.json`), 'utf8'),
) as VaultDoc

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input)
    const rel = decodeURIComponent(url.replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return {
      ok,
      status: ok ? 200 : 404,
      json: async () => JSON.parse(fs.readFileSync(file, 'utf8')),
    }
  }) as typeof fetch
})

afterEach(cleanup)

function renderPerfil(doc: VaultDoc) {
  return render(
    <CatalogProvider catalog={catalog}>
      <PerfilTab doc={doc} />
    </CatalogProvider>,
  )
}

describe('PerfilTab — alias das metas via derivedFm', () => {
  it('exibe o DISPLAY do alias da Classe (derivedFm), não o wikilink cru sem display', async () => {
    const rawClasse = String(deodoro.frontmatter.Classe) // [[Comandante|Senhor-da-Guerra Combatente]]
    const base = /\[\[([^\]|]+)/.exec(rawClasse)?.[1] as string // "Comandante"

    // FM CRU sem o display do alias: só o wikilink base, como fica antes de salvar
    // (o materializador do plugin ainda não gravou o display no FM salvo).
    const bareDoc: VaultDoc = {
      ...deodoro,
      frontmatter: { ...deodoro.frontmatter, Classe: `[[${base}]]` },
    }

    // Verdade INDEPENDENTE: rode a projeção real e derive o display esperado do
    // derivedFm (não hardcode a string — vem da fonte).
    const { projection } = await projectHeroRules(bareDoc.frontmatter, catalog, load)
    const displayAlias = linkLabel(String(projection.derivedFm.Classe)) // "Senhor-da-Guerra Combatente"
    const rawLabel = linkLabel(`[[${base}]]`) // "Comandante"

    // Pré-condição do teste: o alias tem que DIVERGIR do rótulo cru, senão o
    // teste não pega o bug.
    expect(displayAlias).not.toBe(rawLabel)

    renderPerfil(bareDoc)

    // O Perfil exibe o DISPLAY do alias (via derivedFm), assim que a projeção resolve.
    expect(await screen.findByText(displayAlias)).toBeTruthy()
    // E NÃO exibe o rótulo cru "Comandante" sozinho (o bug antigo mostrava isso).
    await waitFor(() =>
      expect(screen.queryByText(rawLabel)).toBeNull(),
    )
  })

  it('herói com Classe já salva (display no FM) segue exibindo o mesmo display', async () => {
    // Regressão: quando o FM cru já tem o display, derivedFm bate com ele.
    const displayAlias = linkLabel(String(deodoro.frontmatter.Classe))
    renderPerfil(deodoro)
    expect(await screen.findByText(displayAlias)).toBeTruthy()
  })
})

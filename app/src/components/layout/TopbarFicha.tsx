// Conteúdo CONTEXTUAL da topbar com ficha aberta — verbatim do design puxado
// (design/pulled/Companion App.dc.html, template linhas 40-92; regras de
// exibição do renderVals 2147-2160 e chipsFor 2117-2123):
//   showChips    (vw>=620): perfil/habilidades → "NVL <nível>";
//                anotacoes → 💠 marcas + 🟨 reconhecimentos; demais → nada.
//   showVidaChip (aba combate): ❤️ (vit+moral+temp)/(vitMax+moralMax) com
//                painel dropdown de ajuste (template 47-70).
//   showCoinChip (aba inventario, vw>=620): 🪙 moedas com painel (71-91).
//   showApelido  (vw>=720): char.apelido — FM Biografia.Apelido (92).
// Dados do MODELO SALVO LOCAL via useHeroModel (doc extraído + overlay
// persistido): vida e moedas são o MESMO estado das abas (diretriz
// 2026-07-05 — uma fonte compartilhada dentro do app, persistida).
import { useState, type CSSProperties } from 'react'
import { useDoc } from '../../data/useDoc'
import { useHeroModel } from '../../data/useHeroModel'
import { useViewportWidth } from '../../viewport'
import { clip } from '../ficha/bits'
import { tokens } from '../ficha/registry'
import {
  experienciaTotais,
  fmPath,
  interativa,
  num,
  str,
} from '../ficha/hero-model'
import { CoinsDropdown, useVidaLocal, VidaAdjustRows } from '../ficha/pop-panels'
import type { VaultDoc } from '../../data/types'

/** Chip amarelo da topbar (template linha 43/49/73). */
const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  padding: '7px 14px',
  background: 'var(--accent)',
  color: 'var(--ink)',
  fontFamily: 'var(--mono)',
  fontWeight: 700,
  fontSize: 13,
  letterSpacing: '.04em',
  clipPath: 'polygon(0 0,100% 0,100% 100%,7px 100%,0 calc(100% - 7px))',
}

/** chipsFor(r) do design com dados do modelo salvo (emojis do registro). */
function chipsFor(tab: string, fm: Record<string, unknown>): { ic: string; txt: string }[] {
  if (tab === 'perfil' || tab === 'habilidades') {
    const nvl = num(fm['Nível'])
    return [{ ic: '', txt: `NVL ${nvl || ''}`.trim() }]
  }
  if (tab === 'combate') {
    const emMax = num(fmPath(fm, 'Magias', 'EM'))
    const rest = interativa(fm).restantes
    const emCur = rest['EM'] !== undefined ? num(rest['EM']) : emMax
    return [{ ic: tokens.emojis.subcategoria.EnergiaMagica, txt: `${emCur}/${emMax}` }]
  }
  if (tab === 'anotacoes') {
    const exp = experienciaTotais(fm)
    return [
      { ic: tokens.emojis.aventureiro.Marca, txt: `${exp.marcas}/${exp.marcasMax}` },
      { ic: tokens.emojis.aventureiro.Reconhecimento, txt: `${exp.recon}/${exp.reconMax}` },
    ]
  }
  return []
}

/** Chip de vida (aba COMBATE) com painel dropdown — template 47-70. */
function VidaChip({ doc }: { doc: VaultDoc }) {
  const vida = useVidaLocal(doc, 'topbar')
  const [open, setOpen] = useState(false)
  // vidaChipTxt do renderVals (2160): (vit+moral+temp)/(vitMax+moralMax).
  const txt = `${vida.vit + vida.moral + vida.temp}/${vida.vitMax + vida.moralMax}`

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Vida"
        style={{ ...chipStyle, border: 'none', cursor: 'pointer' }}
      >
        <span style={{ fontSize: 13 }}>❤️</span>
        <span>{txt}</span>
      </button>
      {open ? (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 55 }} />
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 9px)',
              right: 0,
              zIndex: 60,
              width: 'min(440px,92vw)',
              background: 'var(--panel2)',
              border: '1px solid var(--line2)',
              clipPath: clip(12),
              padding: 16,
              boxShadow: '0 14px 44px rgba(0,0,0,.5)',
            }}
          >
            <VidaAdjustRows vida={vida} />
          </div>
        </>
      ) : null}
    </span>
  )
}

/** Chip de moedas (aba INVENTÁRIO) com painel dropdown — template 71-91.
 *  Mesmo estado persistido do botão da aba (overlay Inventario.Ouro). */
function CoinsChip({ doc }: { doc: VaultDoc }) {
  const model = useHeroModel(doc, 'topbar')
  const coins = num(fmPath(model.fm, 'Inventario', 'Ouro'))
  const setCoins = (n: number) => model.set('Inventario.Ouro', n)
  const [open, setOpen] = useState(false)

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Moedas"
        style={{ ...chipStyle, border: 'none', cursor: 'pointer' }}
      >
        <span style={{ fontSize: 13 }}>{tokens.emojis.inv.Moeda}</span>
        <span>{coins}</span>
      </button>
      {open ? <CoinsDropdown coins={coins} onChange={setCoins} onClose={() => setOpen(false)} /> : null}
    </span>
  )
}

/** Miolo com doc carregado — o modelo mergeado mantém os chips (NVL, EM,
 *  marcas) sincronizados com edições feitas nas abas. */
function TopbarFichaInner({ doc, tab }: { doc: VaultDoc; tab: string }) {
  const model = useHeroModel(doc, 'topbar')
  const vw = useViewportWidth()
  const fm = model.fm

  const showChips = vw >= 620
  const showVidaChip = tab === 'combate'
  const showCoinChip = tab === 'inventario' && vw >= 620
  const showApelido = vw >= 720
  const chips = chipsFor(tab, fm)
  const apelido = str(fmPath(fm, 'Biografia', 'Apelido'))

  return (
    <>
      {showChips && chips.length ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          {chips.map((c) => (
            <span key={c.txt + c.ic} style={chipStyle}>
              <span style={{ fontSize: 13 }}>{c.ic}</span>
              <span>{c.txt}</span>
            </span>
          ))}
        </div>
      ) : null}
      {showVidaChip ? <VidaChip key={doc.id} doc={doc} /> : null}
      {showCoinChip ? <CoinsChip key={doc.id} doc={doc} /> : null}
      {showApelido ? (
        <span
          data-testid="topbar-apelido"
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text)',
            letterSpacing: '.04em',
            paddingLeft: 4,
          }}
        >
          {apelido}
        </span>
      ) : null}
    </>
  )
}

export function TopbarFicha({ id, tab }: { id: string; tab: string }) {
  const { doc } = useDoc(id)
  if (!doc) return null
  return <TopbarFichaInner doc={doc} tab={tab} />
}

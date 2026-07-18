// Conteúdo CONTEXTUAL da topbar com ficha aberta — verbatim do design puxado
// (design/pulled/Companion App.dc.html, template linhas 40-92; regras de
// exibição do renderVals 2147-2160 e chipsFor 2117-2123):
//   showChips    (vw>=620): perfil/habilidades → "NVL <nível>";
//                anotacoes → 💠 marcas + 🟨 reconhecimentos; demais → nada.
//   showVidaChip (aba combate): ❤️ (vit+moral+temp)/(vitMax+moralMax) com
//                painel dropdown de ajuste (template 47-70).
//   showCoinChip (aba inventario, vw>=620): 🪙 moedas com painel (71-91).
//   showApelido  (vw>=720): char.apelido — FM Biografia.Apelido (92).
// Extensão sancionada (issue #34): avatar do herói atual junto do apelido;
// clicar em qualquer um abre o seletor rápido de fichas (HeroSwitcher).
// Dados do MODELO SALVO LOCAL via useHeroModel (doc extraído + overlay
// persistido): vida e moedas são o MESMO estado das abas (diretriz
// 2026-07-05 — uma fonte compartilhada dentro do app, persistida).
import { useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAssetIndex } from '../../data/assets'
import { creatureImageUrl } from '../../data/creature-image'
import { useDoc, useDocs } from '../../data/useDoc'
import { localEntriesOfKind, useLocalStoreVersion } from '../../data/local-entities'
import { fichaFamiliaOf } from '../../data/familia'
import { useHeroModel } from '../../data/useHeroModel'
import { useHeroRules } from '../../rules/useHeroRules'
import { heroPath } from '../../paths'
import { tierFromLevel } from '../../grupo/party'
import { useViewportWidth } from '../../viewport'
import { initials } from '../creatures/CreaturesPages'
import { clip } from '../ficha/bits'
import { tokens } from '../ficha/registry'
import { experienciaTotais, fmPath, heroNome, num, str } from '../ficha/hero-model'
import { AdjustRows, CoinsDropdown, useEmLocal, useVidaLocal, VidaAdjustRows } from '../ficha/pop-panels'
import type { IndexDocEntry, VaultDoc } from '../../data/types'

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

/** chipsFor(r) do design com dados do modelo salvo (emojis do registro).
 *  O chip de EM do combate saiu daqui (#230): virou <EmChip> clicável, no
 *  mesmo padrão do VidaChip. */
function chipsFor(tab: string, fm: Record<string, unknown>): { ic: string; txt: string }[] {
  if (tab === 'perfil' || tab === 'habilidades') {
    const nvl = num(fm['Nível'])
    return [{ ic: '', txt: `NVL ${nvl || ''}`.trim() }]
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

/** Chip de EM (aba COMBATE) com painel dropdown de ajuste (#230) — mesmo
 *  padrão do VidaChip: antes era um <span> estático (chipsFor) e o jogador
 *  não conseguia gastar/restaurar EM pela topbar. Estado via useEmLocal
 *  (máximo do FM derivado — classe; corrente do volátil, como o MagiasPanel). */
function EmChip({ doc }: { doc: VaultDoc }) {
  const emLocal = useEmLocal(doc, 'topbar')
  const [open, setOpen] = useState(false)

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        data-testid="topbar-em-chip"
        onClick={() => setOpen((o) => !o)}
        title="Energia Mágica"
        style={{ ...chipStyle, border: 'none', cursor: 'pointer' }}
      >
        <span style={{ fontSize: 13 }}>{tokens.emojis.subcategoria.EnergiaMagica}</span>
        <span>{`${emLocal.em}/${emLocal.emMax}`}</span>
      </button>
      {open ? (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 55 }} />
          <div
            data-testid="em-adjust-pop"
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
            <AdjustRows rows={emLocal.rows} />
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

/* ===================== seletor rápido (issue #34) ===================== */

const ptAlpha = new Intl.Collator('pt')

/** Personagens DO USUÁRIO no seletor (#211): só entidades LOCAIS (criadas ou
 *  importadas) — heróis e companheiros animais, o mesmo universo da tela
 *  HERÓIS (#181) e dos companheiros "próprios". Os da vault são EXEMPLOS do
 *  compêndio e não entram aqui. Ordenação da issue #31 preservada: tier
 *  decrescente (S→C via tierFromLevel do FM Nível) e alfabético pt. */
function useSwitcherEntries(): {
  entries: IndexDocEntry[]
  docs: Map<string, VaultDoc> | undefined
} {
  const version = useLocalStoreVersion()
  const entries = useMemo(
    () => [...localEntriesOfKind('Heroi'), ...localEntriesOfKind('CompanheiroAnimal')],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  )
  const ids = useMemo(() => entries.map((e) => e.id), [entries])
  const docs = useDocs(ids)
  const sorted = useMemo(() => {
    if (!docs) return entries // carregando: lista plana, como nas telas
    return [...entries].sort((a, b) => {
      const ta = tierFromLevel(docs.get(a.id)?.frontmatter['Nível'])
      const tb = tierFromLevel(docs.get(b.id)?.frontmatter['Nível'])
      if (ta !== tb) return tb - ta
      return ptAlpha.compare(a.basename ?? a.id, b.basename ?? b.id)
    })
  }, [entries, docs])
  return { entries: sorted, docs }
}

/** Slot de retrato no MESMO estilo dos cards (.hero-portrait/.hero-ini do
 *  design: fundo card, borda line2, canto cortado, iniciais mono no fallback). */
function AvatarBox({
  portrait,
  nome,
  size,
}: {
  portrait: string | null
  nome: string
  size: number
}) {
  const base: CSSProperties = {
    width: size,
    height: size,
    flex: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--card)',
    border: '1px solid var(--line2)',
    clipPath: 'polygon(0 0,100% 0,100% 80%,80% 100%,0 100%)',
  }
  return portrait ? (
    <span
      style={{
        ...base,
        backgroundImage: `url("${portrait}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    />
  ) : (
    <span
      style={{
        ...base,
        fontFamily: 'var(--mono)',
        fontSize: Math.round(size * 0.32),
        color: 'var(--muted)',
      }}
    >
      {/* #306: herói novo sem retrato/classe E sem nome ⇒ iniciais vazias
          deixavam o box em branco; cai no glifo de pessoa pra sempre aparecer. */}
      {initials(nome) || '👤'}
    </span>
  )
}

// Altura fixa da linha e gap da lista: 3 itens visíveis, resto com scroll.
const SWITCHER_ROW_H = 46
const SWITCHER_GAP = 6

/** Avatar do herói atual + apelido = gatilho do popover de troca rápida de
 *  ficha (issue #34), na linguagem dos dropdowns da topbar (vida/moedas:
 *  scrim + caixa panel2/line2 com clip 12 e a mesma sombra). Item atual
 *  destacado com o padrão --on do design (pills do CONFIG); clicar navega
 *  como o card correspondente — Companheiros Animais também vão pra ficha
 *  (/heroi/<id>): a família CA usa a mesma ficha (veredito issue #34,
 *  evidência em tests/ficha-ca.test.tsx). */
function HeroSwitcher({ doc, apelido }: { doc: VaultDoc; apelido: string | null }) {
  const [open, setOpen] = useState(false)
  const assets = useAssetIndex()
  const navigate = useNavigate()
  const { entries, docs } = useSwitcherEntries()

  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        data-testid="topbar-avatar"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 9,
          padding: 0,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text)',
          fontFamily: 'inherit',
        }}
      >
        {apelido !== null ? (
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
        <AvatarBox portrait={creatureImageUrl(doc, assets, true)} nome={heroNome(doc)} size={34} />
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
              width: 290,
              background: 'var(--panel2)',
              border: '1px solid var(--line2)',
              clipPath: clip(12),
              padding: 12,
              boxShadow: '0 14px 44px rgba(0,0,0,.5)',
            }}
          >
            <div
              className="switcher-list"
              data-testid="switcher-list"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: SWITCHER_GAP,
                overflowY: 'auto',
                maxHeight: SWITCHER_ROW_H * 3 + SWITCHER_GAP * 2,
              }}
            >
              {entries.map((entry) => {
                const entryDoc = docs?.get(entry.id)
                const nome = entry.basename ?? entry.id
                const on = entry.id === doc.id
                return (
                  <button
                    key={entry.id}
                    onClick={() => {
                      setOpen(false)
                      navigate(heroPath(entry.id))
                    }}
                    style={
                      {
                        '--on': on ? 1 : 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        height: SWITCHER_ROW_H,
                        flex: 'none',
                        padding: '0 10px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        border:
                          '1px solid color-mix(in srgb,var(--accent) calc(35% + var(--on,0)*65%),var(--line2))',
                        background:
                          'color-mix(in srgb,var(--accent) calc(var(--on,0)*100%),transparent)',
                        color: 'color-mix(in srgb,var(--ink) calc(var(--on,0)*100%),var(--text))',
                        fontFamily: 'var(--body)',
                        fontSize: 13,
                        fontWeight: 600,
                        clipPath: 'polygon(0 0,100% 0,100% 100%,7px 100%,0 calc(100% - 7px))',
                      } as CSSProperties
                    }
                  >
                    <AvatarBox
                      portrait={creatureImageUrl(entryDoc, assets, true)}
                      nome={nome}
                      size={32}
                    />
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {nome}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </>
      ) : null}
    </span>
  )
}

/** Miolo com doc carregado — o modelo mergeado mantém os chips (NVL, EM,
 *  marcas) sincronizados com edições feitas nas abas. */
function TopbarFichaInner({ doc, tab }: { doc: VaultDoc; tab: string }) {
  const model = useHeroModel(doc, 'topbar')
  const rules = useHeroRules(model.fm)
  const vw = useViewportWidth()
  const fm = model.fm
  // Chips leem o MODELO PROJETADO (derivedFm) — Nível/marcas acompanham a
  // cascata de regras da classe, como o restante da ficha.
  const projected = rules?.derivedFm ?? fm
  // Delta por FAMÍLIA (#201): CA sem chip de EM (sem magias) e sem Moedas
  // (tab-inventario.ts:126-128 do plugin) — flags centrais de FICHA_FAMILIA.
  const caps = fichaFamiliaOf(doc)

  const showChips = vw >= 620
  const showVidaChip = tab === 'combate'
  // Chip de EM (#230): aba COMBATE, só pra quem tem magias — agora clicável
  // (padrão do VidaChip), no mesmo slot em que o chip estático ficava.
  const showEmChip = tab === 'combate' && caps.magias
  // Moedas (🪙) na topbar: aba Inventário e também na visão de GRUPO (compras da
  // loja usam o herói selecionado — o saldo fica visível no topo, não na loja).
  const showCoinChip = caps.moedas && (tab === 'inventario' || tab === 'grupos') && vw >= 620
  const showApelido = vw >= 720
  const chips = chipsFor(tab, projected)
  const apelido = str(fmPath(fm, 'Biografia', 'Apelido'))

  return (
    // #237: os chips (vida/EM/moedas) têm PRIORIDADE sobre o título da
    // topbar — flex none garante que nunca sejam cortados; o título cede
    // com "…" (app.css .topbar-title).
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 'none' }}>
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
      {showEmChip ? <EmChip key={`em-${doc.id}`} doc={doc} /> : null}
      {showVidaChip ? <VidaChip key={doc.id} doc={doc} /> : null}
      {showCoinChip ? <CoinsChip key={doc.id} doc={doc} /> : null}
      {/* apelido (slot verbatim do design, gated por vw) + avatar do herói
          atual = seletor rápido de ficha (issue #34) */}
      <HeroSwitcher doc={doc} apelido={showApelido ? apelido : null} />
    </div>
  )
}

export function TopbarFicha({ id, tab }: { id: string; tab: string }) {
  const { doc } = useDoc(id)
  if (!doc) return null
  return <TopbarFichaInner doc={doc} tab={tab} />
}

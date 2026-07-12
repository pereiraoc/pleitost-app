// Aba ANOTAÇÕES da ficha — markup/estilos verbatim do design puxado
// (design/pulled/Companion App.dc.html §ANOTAÇÕES, linhas 721-734): dois
// blocos de texto do modelo salvo LOCAL (Inventario.Tesouros_Especiais e
// Biografia.Anotacoes). Cada tecla grava o overlay NA HORA (useHeroModel,
// canal imediato) — sem botão salvar, sem estado pendente.
import { useState } from 'react'
import type { VaultDoc } from '../../data/types'
import { useHeroModel } from '../../data/useHeroModel'
import { clip, TabStrip } from './bits'
import { fmPath, str } from './hero-model'
import { PessoasPanel } from './PessoasPanel'

function SectionHead({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 9px' }}>
      <span
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 11,
          letterSpacing: '.16em',
          color: 'var(--muted)',
        }}
      >
        {label}
      </span>
      <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
    </div>
  )
}

// Abas CAMPANHA (conteúdo original: tesouros especiais + anotações) e
// PESSOAS (lista pessoal por personagem — reqs 1/3, issues #178/#179).
const ANOT_TABS = [
  { id: 'campanha', label: 'CAMPANHA' },
  { id: 'pessoas', label: 'PESSOAS' },
]

export function AnotacoesTab({ doc }: { doc: VaultDoc }) {
  const model = useHeroModel(doc, 'anotacoes')
  const fm = model.fm
  const tesourosEspeciais = str(fmPath(fm, 'Inventario', 'Tesouros_Especiais'))
  const anotacoes = str(fmPath(fm, 'Biografia', 'Anotacoes'))
  const [tab, setTab] = useState('campanha')

  return (
    <div
      style={{
        maxWidth: 1180,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      <TabStrip tabs={ANOT_TABS} active={tab} onSelect={setTab} pad="10px 16px" />
      {tab === 'pessoas' ? (
        <PessoasPanel doc={doc} />
      ) : (
        <>
      <div>
        <SectionHead label="// TESOUROS ESPECIAIS" />
        <textarea
          value={tesourosEspeciais}
          onChange={(e) => model.set('Inventario.Tesouros_Especiais', e.target.value)}
          placeholder="// Itens narrativos, relíquias e tesouros únicos..."
          style={{
            width: '100%',
            minHeight: 120,
            resize: 'vertical',
            padding: '14px 16px',
            background: 'var(--panel)',
            border: '1px solid var(--line2)',
            color: 'var(--text)',
            fontFamily: 'var(--mono)',
            fontSize: 13,
            lineHeight: 1.7,
            clipPath: clip(12),
          }}
        />
      </div>
      <div>
        <SectionHead label="// ANOTAÇÕES DE CAMPANHA" />
        <textarea
          value={anotacoes}
          onChange={(e) => model.set('Biografia.Anotacoes', e.target.value)}
          placeholder="// Registre suas anotações de campanha aqui..."
          style={{
            width: '100%',
            minHeight: 300,
            resize: 'vertical',
            padding: 16,
            background: 'var(--panel)',
            border: '1px solid var(--line2)',
            color: 'var(--text)',
            fontFamily: 'var(--mono)',
            fontSize: 13,
            lineHeight: 1.7,
            clipPath: clip(14),
          }}
        />
      </div>
        </>
      )}
    </div>
  )
}

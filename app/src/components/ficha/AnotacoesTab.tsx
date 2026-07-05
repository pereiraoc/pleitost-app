// Aba ANOTAÇÕES da ficha — markup/estilos verbatim do design puxado
// (design/pulled/Companion App.dc.html §ANOTAÇÕES, linhas 721-734): dois
// blocos de texto do modelo salvo LOCAL (Inventario.Tesouros_Especiais e
// Biografia.Anotacoes). Cada tecla grava o overlay NA HORA (useHeroModel,
// canal imediato) — sem botão salvar, sem estado pendente.
import type { VaultDoc } from '../../data/types'
import { useHeroModel } from '../../data/useHeroModel'
import { clip } from './bits'
import { fmPath, str } from './hero-model'

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

export function AnotacoesTab({ doc }: { doc: VaultDoc }) {
  const model = useHeroModel(doc, 'anotacoes')
  const fm = model.fm
  const tesourosEspeciais = str(fmPath(fm, 'Inventario', 'Tesouros_Especiais'))
  const anotacoes = str(fmPath(fm, 'Biografia', 'Anotacoes'))

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
    </div>
  )
}

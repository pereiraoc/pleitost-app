// FORMULÁRIO DE CRIAÇÃO DE AVENTURA (#248) — o afixo mestre-gated que aparece
// acima da grade da folha Campanhas/Aventuras. Persiste uma aventura LOCAL
// (store local; a vault é read-only) que passa a listar junto das da vault e
// abre como a MESMA carta de bounty (AventuraView). Rank/subcategoria vêm dos
// registros (criador-aventura-doc.ts) — nada de string inventada no call-site.
//
// Estética: vocabulário dos Criadores do Modo Mestre (ui.tsx) — kicker mono,
// var(--...), clip-path; mesmo precedente do PessoaForm/MestreTables.
import { useState } from 'react'
import { useSettings } from '../../settings'
import {
  AVENTURA_RANKS,
  AVENTURA_SUBCATS,
  createLocalAventura,
} from './criador-aventura-doc'
import { accentBtnStyle, clip, fieldInputStyle, fieldLabelStyle, sectionStyle } from './ui'

/** Parseia "10" ou "10-25" numa quantia (número ou {min,max}); vazio → undefined. */
function parseAmount(raw: string): number | { min: number; max: number } | undefined {
  const s = raw.trim()
  if (!s) return undefined
  const range = s.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/)
  if (range) return { min: Number(range[1]), max: Number(range[2]) }
  if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s)
  return undefined
}

export function AventuraForm() {
  const { mestre } = useSettings()
  const [open, setOpen] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [rank, setRank] = useState<string>('C')
  const [subcategoria, setSubcategoria] = useState<string>(AVENTURA_SUBCATS[0] ?? '')
  const [marcas, setMarcas] = useState('')
  const [ouro, setOuro] = useState('')
  const [objetivo, setObjetivo] = useState('')
  const [local, setLocal] = useState('')

  // gate: sem Modo Mestre não há criação (o afixo some).
  if (!mestre) return null

  function reset() {
    setTitulo('')
    setRank('C')
    setSubcategoria(AVENTURA_SUBCATS[0] ?? '')
    setMarcas('')
    setOuro('')
    setObjetivo('')
    setLocal('')
  }

  function salvar() {
    const t = titulo.trim()
    if (!t) return
    const marcasVal = parseAmount(marcas)
    const ouroVal = parseAmount(ouro)
    const objetivos = objetivo
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    createLocalAventura({
      Titulo: t,
      rank,
      subcategoria,
      Recompensa: {
        ...(marcasVal != null ? { Marcas: marcasVal } : {}),
        ...(ouroVal != null ? { Ouro: ouroVal } : {}),
      },
      ...(objetivos.length ? { Objetivo: objetivos } : {}),
      ...(local.trim() ? { Local: local.trim(), disponivel: [local.trim()] } : {}),
    })
    reset()
    setOpen(false)
  }

  if (!open) {
    return (
      <div style={{ margin: '10px 0' }}>
        <button type="button" onClick={() => setOpen(true)} style={accentBtnStyle(true)}>
          + Criar Aventura
        </button>
      </div>
    )
  }

  return (
    <div style={{ ...sectionStyle, margin: '10px 0' }}>
      <div className="kicker">{'// CRIAR AVENTURA'}</div>
      <label>
        <span style={fieldLabelStyle}>TÍTULO</span>
        <input
          aria-label="Título"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          style={{ ...fieldInputStyle, width: '100%' }}
        />
      </label>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label>
          <span style={fieldLabelStyle}>RANK</span>
          <select
            aria-label="Rank"
            value={rank}
            onChange={(e) => setRank(e.target.value)}
            style={{ ...fieldInputStyle, cursor: 'pointer' }}
          >
            {AVENTURA_RANKS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span style={fieldLabelStyle}>TIPO DE MISSÃO</span>
          <select
            aria-label="Tipo de missão"
            value={subcategoria}
            onChange={(e) => setSubcategoria(e.target.value)}
            style={{ ...fieldInputStyle, cursor: 'pointer' }}
          >
            {AVENTURA_SUBCATS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label>
          <span style={fieldLabelStyle}>MARCAS (ex.: 6 ou 20-25)</span>
          <input
            aria-label="Marcas"
            value={marcas}
            onChange={(e) => setMarcas(e.target.value)}
            style={{ ...fieldInputStyle, width: 160 }}
          />
        </label>
        <label>
          <span style={fieldLabelStyle}>OURO (ex.: 120 ou 50-100)</span>
          <input
            aria-label="Ouro"
            value={ouro}
            onChange={(e) => setOuro(e.target.value)}
            style={{ ...fieldInputStyle, width: 160 }}
          />
        </label>
      </div>
      <label>
        <span style={fieldLabelStyle}>OBJETIVO (um por linha; aceita [[wikilinks]])</span>
        <textarea
          aria-label="Objetivo"
          value={objetivo}
          onChange={(e) => setObjetivo(e.target.value)}
          rows={3}
          style={{ ...fieldInputStyle, width: '100%', resize: 'vertical' }}
        />
      </label>
      <label>
        <span style={fieldLabelStyle}>LOCAL / DISPONÍVEL (ex.: [[Pencas]])</span>
        <input
          aria-label="Local"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          style={{ ...fieldInputStyle, width: '100%' }}
        />
      </label>
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" onClick={salvar} style={accentBtnStyle(!!titulo.trim())}>
          Salvar
        </button>
        <button
          type="button"
          onClick={() => {
            reset()
            setOpen(false)
          }}
          style={{
            padding: '9px 16px',
            background: 'var(--card)',
            border: '1px solid var(--line2)',
            color: 'var(--muted)',
            cursor: 'pointer',
            fontSize: 13,
            fontFamily: 'inherit',
            clipPath: clip(7),
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

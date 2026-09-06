// MAPA DA AVENTURA EM PAPEL (formato de aventura, 2026-09-05) — mesmo padrão
// da ficha de papel (#452): rota irmã do AppShell, pré-visualização A4
// paisagem em tela, `window.print` pra PDF. Página 1 = o mapa com os markers
// da aventura NUMERADOS; páginas seguintes = legenda (nº · Local · 🔊 · campos)
// — SEMPRE com os segredos `[!gm]` (decisão do user: é documento do mestre).
// Aventura trancada → pede pra destravar na página dela.
import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useCatalog } from '../data/CatalogContext'
import { useDoc } from '../data/useDoc'
import { resolveAsset, assetUrl, useAssetIndex } from '../data/assets'
import { reskinName } from '../data/reskin'
import { parseAventura, campo } from '../aventura/parse-aventura'
import { aventuraConfig } from '../aventura/config'
import type { Registro } from '../aventura/types'
import { PAPEL_CSS } from './FichaPapelPage'

const MAPA_CSS = `
.mp-page { width: 297mm; height: 210mm; padding: 8mm 10mm; background: #fff; color: #111; margin: 6mm auto; overflow: hidden; display: flex; flex-direction: column; gap: 3mm; box-shadow: 0 2px 14px rgba(0,0,0,.5); box-sizing: border-box; }
@media print { .mp-page { margin: 0; box-shadow: none; page-break-after: always; } }
.mp-hdr { display: flex; align-items: baseline; gap: 4mm; border-bottom: 1.2pt solid #111; padding-bottom: 1mm; }
.mp-hdr .mp-nome { font-size: 15pt; font-weight: 700; }
.mp-hdr .mp-sub { font-size: 9pt; font-style: italic; color: #333; }
.mp-mapa { position: relative; flex: 1; min-height: 0; display: flex; justify-content: center; }
.mp-mapa img { height: 100%; width: auto; display: block; }
.mp-mapa-wrap { position: relative; height: 100%; }
.mp-pin { position: absolute; transform: translate(-50%, -100%); display: flex; flex-direction: column; align-items: center; }
.mp-pin-n { width: 5.5mm; height: 5.5mm; border-radius: 50%; background: #111; color: #fff; font: 700 8pt 'Courier New', monospace; display: flex; align-items: center; justify-content: center; border: 1.5pt solid #fff; box-shadow: 0 0 0 1pt #111; }
.mp-pin-l { font: 700 6.5pt 'Courier New', monospace; color: #111; background: rgba(255,255,255,.85); padding: 0 1mm; white-space: nowrap; }
.mp-pin.is-bairro .mp-pin-l { font-weight: 400; color: #444; background: transparent; }
.mp-legenda { columns: 2; column-gap: 8mm; font-size: 9pt; line-height: 1.35; }
.mp-item { break-inside: avoid; margin-bottom: 3mm; }
.mp-item-t { font-weight: 700; font-size: 10.5pt; margin-bottom: 1mm; }
.mp-item-t .mp-n { display: inline-flex; width: 5mm; height: 5mm; border-radius: 50%; background: #111; color: #fff; font: 700 7.5pt 'Courier New', monospace; align-items: center; justify-content: center; margin-right: 2mm; vertical-align: middle; }
.mp-leitura { border-left: 2pt solid #111; padding-left: 2mm; margin: 1mm 0; font-style: italic; }
.mp-campo { margin: .6mm 0; }
.mp-campo b { font-family: 'Courier New', monospace; font-size: 7.5pt; letter-spacing: .06em; text-transform: uppercase; }
.mp-gm { border: 1pt dashed #111; padding: 1mm 2mm; margin: 1mm 0; }
.mp-gm b { font-family: 'Courier New', monospace; font-size: 7.5pt; letter-spacing: .1em; }
`

/** Prosa sem wikilinks/negrito (papel não navega). */
function limpa(t: string): string {
  return t
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[#?([^\]]+)\]\]/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/^>\s?/gm, '')
    .trim()
}

const CAMPOS_LEGENDA = ['Descrição', 'Aparência', 'Quem está lá', 'Zonas', 'Elementos de cena']

function ItemLegenda({ n, reg }: { n: number | null; reg: Registro }) {
  return (
    <div className="mp-item">
      <div className="mp-item-t">
        {n != null ? <span className="mp-n">{n}</span> : null}
        {reskinName(reg.nome)}
      </div>
      {reg.leituras.map((l, i) => (
        <div key={i} className="mp-leitura">
          {limpa(l.texto)}
        </div>
      ))}
      {CAMPOS_LEGENDA.map((c) => {
        const v = campo(reg.campos, c)
        return v ? (
          <div key={c} className="mp-campo">
            <b>{c}:</b> {limpa(v)}
          </div>
        ) : null
      })}
      {reg.segredos.map((s, i) => (
        <div key={i} className="mp-gm">
          <b>🔒 MESTRE</b> — {limpa(s)}
        </div>
      ))}
    </div>
  )
}

export function MapaPapelPage() {
  const params = useParams()
  const id = params['*'] ?? ''
  const navigate = useNavigate()
  const catalog = useCatalog()
  const assets = useAssetIndex()
  const { doc, error } = useDoc(id)
  const model = useMemo(() => (doc && !doc.protegido ? parseAventura(doc, aventuraConfig(catalog.contextoDef)) : null), [doc, catalog.contextoDef])

  if (error) return <p role="alert">Aventura não encontrada: {id}</p>
  if (!doc) return <p className="loading">Preparando o mapa…</p>
  if (doc.protegido) return <p role="alert">Aventura trancada — destrave na página dela antes de imprimir o mapa.</p>
  const mapa = model?.mapa ?? null
  const entry = mapa && assets ? resolveAsset(assets, mapa.image) : null
  const latMax = mapa?.bounds ? mapa.bounds[1][0] - mapa.bounds[0][0] : null
  const longMax = mapa?.bounds ? mapa.bounds[1][1] - mapa.bounds[0][1] : null
  // numeração: só markers que são REGISTROS de Local da aventura, na ordem da nota
  const numero = new Map<string, number>()
  model?.locais.forEach((l, i) => numero.set(l.nome, i + 1))
  const nome = reskinName(doc.basename)

  return (
    <div className="pp-root">
      <style>{PAPEL_CSS + MAPA_CSS}</style>
      <div className="pp-bar">
        <button onClick={() => navigate(-1)}>← VOLTAR</button>
        <button className="pp-primario" onClick={() => window.print()}>
          🖨 IMPRIMIR / SALVAR PDF
        </button>
      </div>
      <div className="mp-page" data-mapa-papel="mapa">
        <div className="mp-hdr">
          <span className="mp-nome">{nome}</span>
          <span className="mp-sub">Mapa da aventura · locais numerados na ordem da nota</span>
        </div>
        <div className="mp-mapa">
          {mapa && entry && latMax && longMax ? (
            <div className="mp-mapa-wrap">
              <img src={assetUrl(entry)} alt={`Mapa: ${mapa.image}`} />
              {mapa.markers.map((m) => {
                const n = numero.get(m.nome) ?? null
                return (
                  <span
                    key={`${m.nome}|${m.lat}|${m.long}`}
                    className={`mp-pin${n == null ? ' is-bairro' : ''}`}
                    style={{ left: `${(m.long / longMax) * 100}%`, top: `${(1 - m.lat / latMax) * 100}%` }}
                  >
                    {n != null ? <span className="mp-pin-n">{n}</span> : null}
                    <span className="mp-pin-l">{reskinName(m.nome)}</span>
                  </span>
                )
              })}
            </div>
          ) : (
            <p>Esta aventura não tem seção Mapa (bloco leaflet) — só a legenda dos locais.</p>
          )}
        </div>
      </div>
      <div className="mp-page" data-mapa-papel="legenda">
        <div className="mp-hdr">
          <span className="mp-nome">{nome}</span>
          <span className="mp-sub">Legenda — como descrever, campos e segredos do mestre</span>
        </div>
        <div className="mp-legenda">
          {(model?.locais ?? []).map((l, i) => (
            <ItemLegenda key={l.slug} n={i + 1} reg={l} />
          ))}
        </div>
      </div>
    </div>
  )
}

// FIGURA DE RECURSO (2026-09-08b) — miniatura da nota de Recurso (o embed
// `![[Nome.png]]` da nota, layout flat de Recursos de Contextos) com a carta
// no hover/tap, no MESMO padrão da vitrine de Comércio (ItemFigura + TipHover
// + classes .shc-*). Sem figura na nota, mostra o emoji do Tipo.
import { useAssetIndex, assetUrlFor, resolveAsset } from '../../data/assets'
import { TipHover } from './tooltips'
import { ITEM_CARD_CSS } from '../item-card'
import type { Recurso } from '../../recursos/types'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** URL da figura do recurso (miniatura ou grande) ou null. */
export function useRecursoImagem(r: Pick<Recurso, 'imagem'>): { small: string | null; big: string | null } {
  const assets = useAssetIndex()
  if (!assets || !r.imagem) return { small: null, big: null }
  const entry = resolveAsset(assets, r.imagem)
  if (!entry) return { small: null, big: null }
  return { small: assetUrlFor(entry, true), big: assetUrlFor(entry, false) }
}

/** Carta do hover: figura grande + nome + resumo (texto da nota). */
export function recursoCardHtml(r: Pick<Recurso, 'nome' | 'resumo' | 'tipo'>, big: string | null): string {
  return `<div class="shc-wrap"><div class="shc-card">${big ? `<img class="shc-img" src="${esc(big)}" alt=""/>` : ''}<div class="shc-name">${esc(r.nome)}</div><div class="shc-body"><div class="shc-h">${esc(r.tipo)}</div><p>${esc(r.resumo)}</p></div></div></div>`
}

export function RecursoThumb({ r, icone, size = 40 }: { r: Recurso; icone?: string; size?: number }) {
  const { small, big } = useRecursoImagem(r)
  return (
    <TipHover html={recursoCardHtml(r, big)}>
      <span
        data-recurso-figura={small ? 'img' : 'emoji'}
        aria-hidden
        style={{
          display: 'inline-flex',
          flex: 'none',
          width: size,
          height: size,
          borderRadius: 8,
          border: '1px solid var(--line2)',
          background: small ? `center / cover no-repeat url("${small}")` : 'var(--card)',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: Math.round(size * 0.45),
          cursor: 'zoom-in',
        }}
      >
        {small ? '' : (icone ?? '')}
      </span>
    </TipHover>
  )
}

/** CSS da carta (uma vez por tela que usa a miniatura). */
export function RecursoCardStyle() {
  return <style>{ITEM_CARD_CSS + '\n.shc-card{width:220px;flex:none;display:flex;flex-direction:column;gap:2px;border:2px solid var(--line2);border-radius:11px;padding:7px;background:var(--card)}\n.shc-img{width:100%;max-height:200px;object-fit:cover;border-radius:9px;margin-bottom:3px}\n.shc-name{font-weight:800;font-size:12.5px}\n.shc-body{font-size:11px;line-height:1.35}'}</style>
}

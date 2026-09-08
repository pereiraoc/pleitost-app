// SELETOR DE PARADA (2026-09-08b) — linhas do <select> hierárquico de DE/PARA
// do planejador, no MESMO formato do seletor de naturalidade (árvore do Atlas
// por pasta, cabeçalhos desabilitados, indentação por nível), mas só com o que
// é parada da malha na vista: cada parada entra sob o lugar que a contém
// (Porto Alegre › Bom Fim › Estação Independência); uma nota de lugar que é
// ela mesma parada (Delta Radioativo) fica selecionável; ramo sem parada some.
import type { NaturalidadeLine } from '../rules/naturalidade'

export interface ParadaNoAtlas {
  nome: string
  /** id do doc (Atlas/Porto Alegre/Bom Fim/Estação Independência). */
  id: string
}

interface No {
  segmento: string
  parada: string | null
  filhos: Map<string, No>
  folhas: string[]
}

/** Linhas do <select>: cabeçalhos (disabled) + paradas (value = nome). */
export function paradasSelectLines(paradas: ParadaNoAtlas[], raiz = 'Atlas/'): NaturalidadeLine[] {
  const root: No = { segmento: '', parada: null, filhos: new Map(), folhas: [] }
  for (const p of paradas) {
    const rel = p.id.startsWith(raiz) ? p.id.slice(raiz.length) : p.id
    const partes = rel.split('/')
    let no = root
    for (let i = 0; i < partes.length - 1; i++) {
      const seg = partes[i]!
      if (!no.filhos.has(seg)) no.filhos.set(seg, { segmento: seg, parada: null, filhos: new Map(), folhas: [] })
      no = no.filhos.get(seg)!
    }
    const ultimo = partes[partes.length - 1]!
    if (partes.length >= 2 && ultimo === partes[partes.length - 2]) no.parada = p.nome
    else no.folhas.push(p.nome)
  }
  const temParada = (no: No): boolean => !!no.parada || no.folhas.length > 0 || [...no.filhos.values()].some(temParada)
  const linhas: NaturalidadeLine[] = []
  const achatar = (no: No, prof: number) => {
    const indent = '  '.repeat(Math.max(0, prof))
    if (prof >= 0) linhas.push({ value: no.parada, label: `${indent}${no.segmento}`, disabled: !no.parada })
    for (const k of [...no.filhos.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'))) {
      const f = no.filhos.get(k)!
      if (temParada(f)) achatar(f, prof + 1)
    }
    const indentFolha = '  '.repeat(Math.max(0, prof + 1))
    for (const nome of [...no.folhas].sort((a, b) => a.localeCompare(b, 'pt-BR'))) linhas.push({ value: nome, label: `${indentFolha}${nome}`, disabled: false })
  }
  achatar(root, -1)
  return [{ value: '', label: '—', disabled: false }, ...linhas]
}

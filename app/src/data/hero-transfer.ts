// IMPORTAR/EXPORTAR personagem (#205) — formato de ARQUIVO portátil pra
// herói/companheiro animal + cópia dos EXEMPLOS do compêndio (personagens e
// grupos puxados do Obsidian vivem no compêndio; importar cria uma cópia
// LOCAL editável — a vault segue intocável).
//
// Formato: JSON auto-descritivo com marcador + versão. Carrega a entidade
// INTEIRA do store local (frontmatter + session + extras), então exportar →
// importar é round-trip sem perda.
import {
  createLocalEntity,
  KIND_INFO,
  type LocalKind,
  type StoredEntity,
} from './local-entities'
import type { VaultDoc } from './types'

export const PORTABLE_MARK = 'pleitost-personagem'

export interface PortableEntity {
  pleitost: typeof PORTABLE_MARK
  version: 1
  kind: LocalKind
  basename: string
  frontmatter: Record<string, unknown>
  session?: Record<string, unknown>
  extras?: Record<string, unknown>
}

/** Entidade local → formato portátil (exportação pelo menu "⋮"). */
export function toPortable(rec: StoredEntity): PortableEntity {
  return {
    pleitost: PORTABLE_MARK,
    version: 1,
    kind: rec.kind,
    basename: rec.basename,
    frontmatter: rec.frontmatter,
    session: rec.session,
    extras: rec.extras,
  }
}

/** Exemplo do compêndio (doc da vault) → portátil. O FM da vault é a fonte
 *  de verdade da ficha (migração inline→FM); copiar é lossless. */
export function portableFromDoc(doc: VaultDoc, basename: string): PortableEntity {
  const kind = (Object.keys(KIND_INFO) as LocalKind[]).find(
    (k) => KIND_INFO[k].subtype === doc.subtype,
  )
  if (!kind) throw new Error(`Subtipo sem família local: ${doc.subtype}`)
  // aliases/dg-publish são metadados de publicação do Obsidian, não da ficha
  const { aliases: _a, 'dg-publish': _dg, ...frontmatter } = doc.frontmatter
  return { pleitost: PORTABLE_MARK, version: 1, kind, basename, frontmatter }
}

export function serializePortable(p: PortableEntity): string {
  return JSON.stringify(p, null, 2)
}

/** Valida um arquivo importado; joga Error com mensagem amigável (mostrada
 *  na tela) se não for um personagem exportado pelo app. */
export function parsePortable(text: string): PortableEntity {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('Arquivo inválido: não é um JSON de personagem do Pleitost.')
  }
  const p = raw as Partial<PortableEntity>
  if (!p || typeof p !== 'object' || p.pleitost !== PORTABLE_MARK) {
    throw new Error('Arquivo inválido: não é um personagem exportado pelo Pleitost.')
  }
  if (!p.kind || !(p.kind in KIND_INFO)) {
    throw new Error(`Arquivo com família desconhecida: ${String(p.kind)}`)
  }
  if (typeof p.basename !== 'string' || !p.frontmatter || typeof p.frontmatter !== 'object') {
    throw new Error('Arquivo incompleto: faltam nome ou frontmatter do personagem.')
  }
  return p as PortableEntity
}

/** Cria a entidade LOCAL a partir do portátil e devolve o id novo. */
export function importPortable(p: PortableEntity): string {
  return createLocalEntity(p.kind, p.basename, p.frontmatter, {
    session: p.session,
    extras: p.extras,
  })
}

export function portableFileName(basename: string): string {
  return `${basename.replace(/[/\\:]/g, '-')}.pleitost.json`
}

/** Dispara o download do arquivo no navegador (menu "⋮" → Exportar). */
export function downloadPortable(p: PortableEntity): void {
  const blob = new Blob([serializePortable(p)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = portableFileName(p.basename)
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

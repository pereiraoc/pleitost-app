// IMPORTAR HERÓI / COMPANHEIRO ANIMAL (#205) — modal aberto pelo botão ao
// lado do criar. Duas fontes:
//   1. ARQUIVO — o .pleitost.json exportado pelo menu "⋮" da lista (formato
//      de hero-transfer.ts); inválido mostra o erro na tela.
//   2. COMPÊNDIO — os personagens puxados do Obsidian vivem no compêndio como
//      EXEMPLOS; importar cria uma cópia LOCAL editável (vault intocável).
import { useEffect, useState, type CSSProperties } from 'react'
import { useCatalog } from '../../data/CatalogContext'
import { loadDoc } from '../../data/useDoc'
import type { IndexDocEntry, VaultDoc } from '../../data/types'
import { importPortable, parsePortable, portableFromDoc } from '../../data/hero-transfer'
import { KIND_INFO, type LocalKind } from '../../data/local-entities'
import { clip } from '../ficha/bits'

const WIKI = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/
function plainLabel(value: unknown): string {
  if (typeof value === 'number') return String(value)
  if (typeof value !== 'string' || !value) return ''
  const match = WIKI.exec(value)
  return match ? (match[2] ?? match[1]) : value
}

/** Lê o arquivo como texto via FileReader — Blob.text() não existe no jsdom,
 *  e o FileReader cobre navegador e teste com a mesma API. */
function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler o arquivo.'))
    reader.readAsText(file)
  })
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 60,
  background: 'rgba(0,0,0,.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
}

const panelStyle: CSSProperties = {
  width: 'min(560px, 100%)',
  maxHeight: '82vh',
  overflow: 'auto',
  background: 'var(--panel)',
  border: '1px solid var(--line)',
  clipPath: clip(12),
  padding: '18px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
}

const kickerStyle: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 10,
  letterSpacing: '.16em',
  color: 'var(--muted)',
}

export function ImportarModal({
  kind,
  folder,
  onClose,
  onImported,
}: {
  kind: LocalKind
  /** Pasta da vault com os EXEMPLOS do compêndio dessa família. */
  folder: string
  onClose: () => void
  /** Recebe o id local recém-criado (o caller navega pra ficha). */
  onImported: (id: string) => void
}) {
  const catalog = useCatalog()
  const [erro, setErro] = useState<string | null>(null)
  const [docs, setDocs] = useState<Map<string, VaultDoc>>()
  const node = catalog.folderByPath.get(folder)
  const exemplos: IndexDocEntry[] = node ? node.docs.filter((d) => d.basename !== node.name) : []

  useEffect(() => {
    let alive = true
    Promise.all(exemplos.map((e) => loadDoc(e.id).catch(() => null))).then((loaded) => {
      if (!alive) return
      const byId = new Map<string, VaultDoc>()
      for (const doc of loaded) if (doc) byId.set(doc.id, doc)
      setDocs(byId)
    })
    return () => {
      alive = false
    }
    // exemplos deriva do catálogo estático — a pasta não muda em runtime
  }, [folder])

  const rotulo = KIND_INFO[kind].subtype === 'Heroi' ? 'Herói' : KIND_INFO[kind].subtype

  const importarArquivo = async (file: File) => {
    try {
      const portable = parsePortable(await readFileText(file))
      if (portable.kind !== kind) {
        const dele = KIND_INFO[portable.kind].subtype
        setErro(`Esse arquivo é de ${dele} — aqui só entra ${rotulo}.`)
        return
      }
      onImported(importPortable(portable))
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  const importarExemplo = (entry: IndexDocEntry) => {
    const doc = docs?.get(entry.id)
    if (!doc) return
    try {
      onImported(importPortable(portableFromDoc(doc, entry.basename ?? entry.id)))
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div role="dialog" aria-label={`Importar ${rotulo}`} style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>Importar {rotulo}</span>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid var(--line2)',
              color: 'var(--muted)',
              cursor: 'pointer',
              padding: '4px 10px',
              fontSize: 13,
            }}
          >
            ✕
          </button>
        </div>

        <div style={kickerStyle}>// DE ARQUIVO</div>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 14px',
            border: '1px dashed var(--line2)',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          <span aria-hidden>📄</span>
          <span>
            Escolher um <code>.pleitost.json</code> exportado pelo menu ⋮ da lista
          </span>
          <input
            type="file"
            accept=".json,application/json"
            aria-label="Arquivo do personagem"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importarArquivo(file)
              e.target.value = ''
            }}
          />
        </label>
        {erro ? (
          <div role="alert" style={{ color: 'var(--red)', fontSize: 12.5 }}>
            {erro}
          </div>
        ) : null}

        <div style={kickerStyle}>// EXEMPLOS DO COMPÊNDIO</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {exemplos.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>
              Nenhum exemplo dessa família no compêndio.
            </div>
          ) : (
            exemplos.map((entry) => {
              const doc = docs?.get(entry.id)
              const nome = entry.basename ?? entry.id
              const tipo =
                plainLabel(doc?.frontmatter['Classe']) || plainLabel(doc?.frontmatter['Raça'])
              const nivel = plainLabel(doc?.frontmatter['Nível'])
              return (
                <button
                  key={entry.id}
                  type="button"
                  disabled={!doc}
                  onClick={() => importarExemplo(entry)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '9px 12px',
                    background: 'var(--card)',
                    border: '1px solid var(--line2)',
                    color: 'var(--text)',
                    cursor: doc ? 'pointer' : 'wait',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    fontSize: 13,
                    clipPath: 'polygon(0 0,100% 0,100% 100%,5px 100%,0 calc(100% - 5px))',
                  }}
                >
                  <span style={{ fontWeight: 700, flex: 1 }}>{nome}</span>
                  {tipo ? <span style={{ color: 'var(--muted)', fontSize: 12 }}>{tipo}</span> : null}
                  {nivel ? (
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>
                      NVL {nivel}
                    </span>
                  ) : null}
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

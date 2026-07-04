// Telas HERÓIS e NPCS — markup/estilos VERBATIM do design puxado
// (design/pulled/Companion App.dc.html, seções ===== HERÓIS ===== e
// ===== NPCS =====). Aqui só se liga a fonte de dados real: nada de
// apresentação inventada — mudanças visuais nascem no Claude Design.
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { assetUrl, resolveAsset, useAssetIndex } from '../../data/assets'
import { useCatalog } from '../../data/CatalogContext'
import { useDocs } from '../../data/useDoc'
import type { IndexDocEntry, VaultDoc } from '../../data/types'
import { linkLabel } from '../../markdown/dataview-value'
import { docPath } from '../../paths'

// Pastas reais da vault por trás de cada tela/aba. Labels das abas são os do
// design (NPC_TABS); "pessoas" ainda não tem pasta na vault → painel vazio.
const HEROIS_FOLDER = 'Sistema/Criaturas/Heróis'
const NPC_TABS: { id: string; label: string; folder: string | null }[] = [
  { id: 'pessoas', label: 'PESSOAS', folder: null },
  { id: 'companheiros', label: 'COMPANHEIROS ANIMAIS', folder: 'Sistema/Criaturas/Companheiros Animais' },
  { id: 'bestiario', label: 'BESTIÁRIO', folder: 'Sistema/Criaturas/Bestiário' },
]

/** Iniciais como no design (ini: 'Metis, a Graxaim' → MG): palavras capitalizadas. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /^\p{Lu}/u.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
}

/** Docs da pasta, sem a folder note. */
function folderDocs(entries: IndexDocEntry[] | undefined, folderName: string): IndexDocEntry[] {
  return (entries ?? []).filter((d) => d.basename !== folderName)
}

function fmText(doc: VaultDoc | undefined, key: string): string {
  const value = doc?.frontmatter[key]
  if (value === null || value === undefined || value === '') return ''
  return typeof value === 'string' ? linkLabel(value) : String(value)
}

// ---------- HERÓIS (design linhas ~278-295) ----------

const heroRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 18,
  padding: '14px 18px',
  textAlign: 'left',
  cursor: 'pointer',
  background: 'linear-gradient(135deg,var(--panel2),var(--panel))',
  border: '1px solid var(--line2)',
  clipPath: 'polygon(0 0,calc(100% - 16px) 0,100% 16px,100% 100%,16px 100%,0 calc(100% - 16px))',
  position: 'relative',
  color: 'var(--text)',
  font: 'inherit',
}

const portraitClip = 'polygon(0 0,100% 0,100% 80%,80% 100%,0 100%)'

function HeroPortrait({ doc, name }: { doc: VaultDoc | undefined; name: string }) {
  const assets = useAssetIndex()
  const target = doc?.images.find((img) => img.from.startsWith('frontmatter:'))?.target
  const entry = assets && target ? resolveAsset(assets, target) : null
  if (entry) {
    return (
      <div
        style={{
          width: 56,
          height: 56,
          flex: 'none',
          backgroundImage: `url(${assetUrl(entry)})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          clipPath: portraitClip,
          border: '1px solid var(--line2)',
        }}
      />
    )
  }
  return (
    <span
      style={{
        width: 56,
        height: 56,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--card)',
        border: '1px solid var(--line2)',
        clipPath: portraitClip,
        fontFamily: 'var(--mono)',
        fontSize: 18,
        color: 'var(--muted)',
      }}
    >
      {initials(name)}
    </span>
  )
}

function NvlBox({ nvl }: { nvl: string }) {
  return (
    <div
      style={{
        flex: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: 46,
        height: 46,
        background: 'var(--card)',
        border: '1px solid var(--line2)',
        clipPath: 'polygon(0 0,calc(100% - 7px) 0,100% 7px,100% 100%,7px 100%,0 calc(100% - 7px))',
        lineHeight: 1,
      }}
    >
      <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>{nvl}</span>
      <span
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 7.5,
          letterSpacing: '.1em',
          color: 'var(--muted)',
          marginTop: 2,
        }}
      >
        NVL
      </span>
    </div>
  )
}

export function HeroisPage() {
  const catalog = useCatalog()
  const navigate = useNavigate()
  const entries = folderDocs(catalog.folderByPath.get(HEROIS_FOLDER)?.docs, 'Heróis')
  const docs = useDocs(useMemo(() => entries.map((e) => e.id), [entries]))

  return (
    <div
      style={{
        maxWidth: 1180,
        margin: '0 auto',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {entries.map((entry) => {
        const doc = docs?.get(entry.id)
        const name = entry.basename ?? entry.id
        return (
          <button key={entry.id} style={heroRow} onClick={() => navigate(docPath(entry.id))}>
            <HeroPortrait doc={doc} name={name} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.15, marginBottom: 3 }}>
                {name}
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 500 }}>
                {fmText(doc, 'Classe')}
              </div>
            </div>
            <NvlBox nvl={fmText(doc, 'Nível') || '—'} />
            <span
              style={{
                flex: 'none',
                color: 'var(--muted)',
                fontSize: 20,
                padding: '0 2px',
                alignSelf: 'flex-start',
              }}
            >
              ⋮
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ---------- NPCS (design linhas ~512-548) ----------

/** Subtítulo (linha accent2) composto dos campos reais: Raça/Classe/Tutor. */
function npcTipo(doc: VaultDoc | undefined): string {
  const parts = [fmText(doc, 'Raça'), fmText(doc, 'Classe'), fmText(doc, 'Tutor')]
  return parts.filter(Boolean).join(' · ')
}

function NpcCard({ entry, doc, onOpen }: { entry: IndexDocEntry; doc: VaultDoc | undefined; onOpen: () => void }) {
  const name = entry.basename ?? entry.id
  return (
    <div
      onClick={onOpen}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '15px 18px',
        background: 'linear-gradient(135deg,var(--panel2),var(--panel))',
        border: '1px solid var(--line2)',
        clipPath: 'polygon(0 0,calc(100% - 15px) 0,100% 15px,100% 100%,15px 100%,0 calc(100% - 15px))',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          width: 58,
          height: 58,
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--card)',
          border: '1px solid var(--line2)',
          clipPath: portraitClip,
          fontFamily: 'var(--mono)',
          fontSize: 18,
          color: 'var(--muted)',
        }}
      >
        {initials(name)}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.1, marginBottom: 4 }}>{name}</div>
        <div style={{ color: 'var(--accent2)', fontSize: 13, fontWeight: 500 }}>{npcTipo(doc)}</div>
      </div>
      <div
        style={{
          flex: 'none',
          position: 'relative',
          width: 54,
          height: 54,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            position: 'absolute',
            inset: 0,
            background: 'var(--card)',
            border: '1.5px solid var(--accent2)',
            clipPath: 'polygon(50% 0,100% 50%,50% 100%,0 50%)',
          }}
        />
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            lineHeight: 1,
          }}
        >
          <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--muted)' }}>NVL</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent2)' }}>
            {fmText(doc, 'Nível') || '—'}
          </span>
        </div>
      </div>
      <span style={{ flex: 'none', color: 'var(--muted)', fontSize: 20, alignSelf: 'flex-start' }}>
        ⋮
      </span>
    </div>
  )
}

export function NpcsPage() {
  const catalog = useCatalog()
  const navigate = useNavigate()
  const [tab, setTab] = useState(NPC_TABS[0].id)

  const panels = useMemo(
    () =>
      NPC_TABS.map((t) => ({
        ...t,
        entries: t.folder
          ? folderDocs(catalog.folderByPath.get(t.folder)?.docs, t.folder.split('/').pop()!)
          : [],
      })),
    [catalog],
  )
  const allIds = useMemo(() => panels.flatMap((p) => p.entries.map((e) => e.id)), [panels])
  const docs = useDocs(allIds)
  const activeIndex = Math.max(0, NPC_TABS.findIndex((t) => t.id === tab))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 'none' }}>
        <div
          style={{
            maxWidth: 1180,
            margin: '0 auto',
            display: 'flex',
            gap: 2,
            borderBottom: '1px solid var(--line)',
          }}
        >
          {NPC_TABS.map((t) => {
            const on = t.id === tab
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: '12px 18px',
                  background: on ? 'color-mix(in srgb,var(--accent) 7%,transparent)' : 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${on ? 'var(--accent)' : 'transparent'}`,
                  color: on ? 'var(--accent)' : 'var(--muted)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  letterSpacing: '.07em',
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                  font: 'inherit',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '100%',
            transform: `translateX(-${activeIndex * 100}%)`,
            transition: 'transform .32s cubic-bezier(.2,.85,.32,1)',
          }}
        >
          {panels.map((panel) => (
            <div
              key={panel.id}
              style={{ flex: '0 0 100%', minWidth: 0, height: '100%', overflowY: 'auto', padding: '18px 0' }}
            >
              <div
                style={{
                  maxWidth: 1180,
                  margin: '0 auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 18,
                }}
              >
                {panel.entries.map((entry) => (
                  <NpcCard
                    key={entry.id}
                    entry={entry}
                    doc={docs?.get(entry.id)}
                    onOpen={() => navigate(docPath(entry.id))}
                  />
                ))}
                {panel.entries.length === 0 ? (
                  <div
                    style={{
                      padding: 50,
                      textAlign: 'center',
                      background: 'var(--panel)',
                      border: '1px dashed var(--line2)',
                      clipPath:
                        'polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,14px 100%,0 calc(100% - 14px))',
                      fontFamily: 'var(--mono)',
                      fontSize: 12,
                      letterSpacing: '.12em',
                      color: 'var(--muted)',
                    }}
                  >
                    {'// NENHUM REGISTRO NESTA CATEGORIA'}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  ) as ReactNode
}

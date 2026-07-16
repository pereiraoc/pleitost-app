import { useEffect, useMemo, useRef, useState, type CSSProperties , type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSettings } from '../../settings'
import { useAssetIndex } from '../../data/assets'
import { creatureImageUrl, groupImageUrl } from '../../data/creature-image'
import {
  deleteEntityImage,
  newImageId,
  saveEntityImage,
  useCreaturePortrait,
  useEntityImageUrl,
  usePessoaPortrait,
} from '../../data/images'
import { useCatalog } from '../../data/CatalogContext'
import { loadDoc, useDocs } from '../../data/useDoc'
import type { IndexDocEntry, VaultDoc } from '../../data/types'
import { docPath, heroPath } from '../../paths'
import { useSelectedCreature } from '../../data/selected-creature-store'
import { useDetail } from '../../data/detail-context'
import { tokens } from '../../generated/tokens'
import { GrupoView } from '../../grupo/GrupoView'
import { clip, PanelTrack, TrackPanel } from '../ficha/bits'
import {
  createLocalEntity,
  emptyCompanheiroFrontmatter,
  emptyGroupFrontmatter,
  emptyHeroFrontmatter,
  emptyMonstroFrontmatter,
  getLocalDoc,
  getLocalEntity,
  isLocalId,
  localEntriesOfKind,
  removeLocalEntity,
  PESSOA_RELACOES,
  pessoaFrontmatter,
  resolveGroupMembers,
  useLocalStoreVersion,
  type LocalKind,
} from '../../data/local-entities'
import {
  rankColors,
  rankLetter,
  tierBarColor,
  tierFromLevel,
} from '../../grupo/party'
import { MESA_GRUPO_ID, useLiveSession } from '../../data/session-repo/live-session'
import { useSessionRepo, useSessionUser } from '../../data/session-repo/provider'
import { addMonsterToInitiative } from '../../data/session-repo/encounter-actions'
import { useSessions } from '../../data/session-store'
import { CriadorAventura } from '../mestre/CriadorAventura'
import { CriadorCombate } from '../mestre/CriadorCombate'
import { ImportarModal } from './ImportarModal'
import { downloadPortable, portableFromDoc, toPortable } from '../../data/hero-transfer'

// Telas HERÓIS e NPCS com markup/estilo do design puxado (design/pulled/
// Companion App.dc.html, seções ===== HERÓIS ===== e ===== NPCS =====).
// Aqui SÓ se liga a fonte de dados real (vault-data) — o formato visual
// nunca nasce neste repo, vem do Claude Design.

const HEROIS_FOLDER = 'Sistema/Criaturas/Heróis'

// id sintético da mesa da sessão ativa na lista de GRUPOS (#213)
const MESA_ID = MESA_GRUPO_ID

/** Subtítulo do card da mesa (#235): "X Heróis e Y Companheiros Animais";
 *  sem CA, só "X Heróis". */
function mesaResumo(live: { characters: { kind: string }[] }): string {
  const vivos = live.characters.filter((c) => c.kind !== 'npc')
  const cas = vivos.filter((c) => c.kind === 'companheiro').length
  const herois = vivos.length - cas
  const h = `${herois} ${herois === 1 ? 'Herói' : 'Heróis'}`
  if (!cas) return h
  return `${h} e ${cas} ${cas === 1 ? 'Companheiro Animal' : 'Companheiros Animais'}`
}

// ── Agrupamento por tier (issue #31) ──────────────────────────────────────
// HERÓIS, COMPANHEIROS ANIMAIS e BESTIÁRIO agrupados por tier decrescente
// (S → C) e alfabéticos (pt) dentro do grupo. A letra vem do registro
// espelhado em party.ts: rankLetter({}, tier) ≡ fallbackRankLetterFromTier
// do plugin (tiers-display.ts:44); nada de mapa novo aqui.

/** Tier de herói/CA — tierFromLevel do FM Nível (mesma fonte do badge NVL). */
function tierOfNivel(doc?: VaultDoc): number {
  return tierFromLevel(doc?.frontmatter['Nível'])
}

/** Tier de monstro — FM `Tier` direto (mesma fonte do badge TIER do design);
 *  sem Tier vira NaN e cai no C do fallback, como tier fora de faixa. */
function tierOfFmTier(doc?: VaultDoc): number {
  return Number(doc?.frontmatter['Tier'])
}

const TIER_GROUP_LETTERS = ['S', 'A', 'B', 'C'] as const
const ptAlpha = new Intl.Collator('pt')

/** Grupos ordenados S→C, alfabéticos dentro; grupo vazio não aparece. */
function tierGroups(
  entries: IndexDocEntry[],
  docs: Map<string, VaultDoc>,
  tierOf: (doc?: VaultDoc) => number,
): { letter: string; entries: IndexDocEntry[] }[] {
  const byLetter = new Map<string, IndexDocEntry[]>()
  for (const entry of entries) {
    const letter = rankLetter({}, tierOf(docs.get(entry.id)))
    const bucket = byLetter.get(letter)
    if (bucket) bucket.push(entry)
    else byLetter.set(letter, [entry])
  }
  return TIER_GROUP_LETTERS.filter((letter) => byLetter.has(letter)).map((letter) => ({
    letter,
    entries: byLetter
      .get(letter)!
      .sort((a, b) => ptAlpha.compare(a.basename ?? a.id, b.basename ?? b.id)),
  }))
}

/** Cabeçalho do grupo — kicker mono já usado no app (`// ...`), com a letra
 *  na cor do registro partyBountyRank (rankColors). Extensão sancionada pelo
 *  usuário na issue #31; nenhum chrome novo além do kicker existente. */
function TierKicker({ letter }: { letter: string }) {
  return (
    <div className="kicker">
      {'// TIER '}
      <span style={{ color: rankColors(letter).color }}>{letter}</span>
    </div>
  )
}

// Abas verbatim do NPC_TABS do design; a pasta da vault é a fonte real de
// cada uma (aba sem pasta correspondente rende o empty state desenhado).
// `tierOf` liga o agrupamento da issue #31 (PESSOAS fica sem agrupamento).
const NPC_TABS: {
  id: string
  label: string
  folder: string
  tierOf?: (doc?: VaultDoc) => number
  localKind: LocalKind
}[] = [
  { id: 'pessoas', label: 'PESSOAS', folder: 'Sistema/Criaturas/Pessoas', localKind: 'Pessoa' },
  {
    id: 'companheiros',
    label: 'COMPANHEIROS ANIMAIS',
    folder: 'Sistema/Criaturas/Companheiros Animais',
    tierOf: tierOfNivel,
    localKind: 'CompanheiroAnimal',
  },
  {
    id: 'bestiario',
    label: 'BESTIÁRIO',
    folder: 'Sistema/Criaturas/Bestiário',
    tierOf: tierOfFmTier,
    localKind: 'Monstro',
  },
]

// Abas do Modo Mestre na página CRIATURAS (#194/#195) — decisão de menor
// atrito documentada: nada de rota /mestre (App.tsx e a nav do design são
// contrato congelado das trilhas F1/I), os Criadores entram como abas
// mestre-gated AQUI, reusando a convenção do BESTIÁRIO (issue #35): aba
// :disabled com Mestre OFF, seleção recua pra primeira aba se o modo desligar.
const MESTRE_TABS = [
  { id: 'combate', label: 'COMBATE' },
  { id: 'aventura', label: 'AVENTURA' },
] as const

/** Abas que só existem com Modo Mestre ligado (BESTIÁRIO + Criadores). */
const MESTRE_GATED_IDS = new Set<string>(['bestiario', ...MESTRE_TABS.map((t) => t.id)])

const WIKI = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/

/** Texto plano de um valor FM que pode ser wikilink ("[[Mago|Mago]]" → "Mago"). */
function plainLabel(value: unknown): string {
  if (typeof value === 'number') return String(value)
  if (typeof value !== 'string' || !value) return ''
  const match = WIKI.exec(value)
  return match ? (match[2] ?? match[1]!) : value
}

/** Iniciais pro slot sem retrato (h.ini do design: "Carlos Facão…" → "CF").
 *  Exportada pro avatar da topbar (issue #34) usar o MESMO fallback dos cards. */
export function initials(name: string): string {
  const words = name.split(/[\s,]+/).filter((w) => w.length > 2)
  const two = words
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
  return (two || name.slice(0, 2)).toUpperCase()
}

/** Docs de uma pasta (sem a folder note), com os JSONs carregados em lote.
 *  `localKind` mescla as entidades LOCAIS da família na lista (issues #42/#45–
 *  #47): entries locais aparecem junto das da vault e seus docs entram no mapa. */
function useFolderDocs(folder: string, localKind?: LocalKind, opts?: { includeVault?: boolean }) {
  const catalog = useCatalog()
  const version = useLocalStoreVersion()
  const node = catalog.folderByPath.get(folder)
  // includeVault=false: painel lista SÓ o que o USUÁRIO criou (escrita) —
  // Heróis/Heróis e Criaturas/Pessoas (reqs 4/5, issues #181/#183).
  const includeVault = opts?.includeVault !== false
  const vaultEntries = useMemo(
    () => (includeVault && node ? node.docs.filter((d) => d.basename !== node.name) : []),
    [node, includeVault],
  )
  const localEntries = useMemo(
    () => (localKind ? localEntriesOfKind(localKind) : []),
    [localKind, version],
  )
  const entries = useMemo(
    () => [...vaultEntries, ...localEntries],
    [vaultEntries, localEntries],
  )
  const [vaultDocs, setVaultDocs] = useState<Map<string, VaultDoc>>()

  useEffect(() => {
    if (!vaultEntries.length) {
      setVaultDocs(undefined)
      return
    }
    let alive = true
    Promise.all(vaultEntries.map((entry) => loadDoc(entry.id).catch(() => null))).then((loaded) => {
      if (!alive) return
      const byId = new Map<string, VaultDoc>()
      for (const doc of loaded) if (doc) byId.set(doc.id, doc)
      setVaultDocs(byId)
    })
    return () => {
      alive = false
    }
  }, [vaultEntries])

  const docs = useMemo(() => {
    // Enquanto os docs da vault não chegam, preserva o loading (lista plana);
    // se a pasta é vazia (só locais), monta o mapa na hora.
    if (vaultDocs === undefined && vaultEntries.length > 0) return undefined
    const byId = new Map<string, VaultDoc>(vaultDocs ?? [])
    for (const entry of localEntries) {
      const doc = getLocalDoc(entry.id)
      if (doc) byId.set(entry.id, doc)
    }
    return byId
  }, [vaultDocs, vaultEntries, localEntries])

  return { entries, docs }
}

/** Botão flutuante de criação — MESMO padrão fixed do "+ Adicionar Arma" do
 *  inventário (dc.html:707 right:26 bottom:22 z40; botão accent com clip),
 *  sem o ▾ porque é ação direta (não abre menu). Issue #42 pede explícito
 *  igual Inventário/Armas.
 *
 *  #258: o botão fica ancorado à borda ESQUERDA do painel DIREITO. Quando esse
 *  painel é coluna fixa (telas largas), o FAB recua pra ficar à esquerda dele;
 *  quando o painel está colapsado/off-canvas (telas estreitas), o FAB volta ao
 *  canto da tela. Toda a lógica de `right` responsivo vive na classe
 *  `.create-fab` (app.css); aqui só o empilhamento (`bottom`) e a variante. */
function CreateFab({
  label,
  onClick,
  bottom = 22,
  secondary,
}: {
  label: string
  onClick: () => void
  /** Empilha FABs (#205: Importar fica EM CIMA do criar). */
  bottom?: number
  /** Variante outline (ação secundária — Importar). */
  secondary?: boolean
}) {
  return (
    <button
      className={secondary ? 'create-fab secondary' : 'create-fab'}
      onClick={onClick}
      style={{
        bottom,
        background: secondary ? 'var(--panel)' : 'var(--accent)',
        border: secondary ? '1px solid var(--line2)' : '1px solid var(--accent)',
        color: secondary ? 'var(--text)' : 'var(--ink)',
        clipPath: clip(9),
      }}
    >
      {label}
    </button>
  )
}

/* ===================== formulário de Pessoa (issue #45) ===================== */

const fieldLabelStyle: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '.08em',
  color: 'var(--muted)',
  marginBottom: 6,
  display: 'block',
}
const fieldInputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 12px',
  background: 'var(--card)',
  border: '1px solid var(--line2)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  fontSize: 14,
  outline: 'none',
  clipPath: clip(7),
}
// Botão de imagem do form de Pessoa (#200) — mesmo molde do uploadBtnStyle do
// retrato da ficha (PerfilTab.tsx): mono, accent, clip discreto.
const pessoaImgBtnStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontFamily: 'var(--mono)',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '.08em',
  color: 'var(--accent)',
  background: 'transparent',
  border: '1px solid color-mix(in srgb,var(--accent) 45%,var(--line2))',
  padding: '4px 10px',
  cursor: 'pointer',
  clipPath: clip(6),
}

/** Modal "+ Adicionar Pessoa": campos do #45 (Nome, Relação, Organização,
 *  Posição, Detalhes) na linguagem visual existente (pills/selects do design,
 *  strings sóbrias — não há tela desenhada pra este form). */
export interface PessoaFields2 {
  Nome: string
  Relação: string
  Organização: string
  Posição: string
  Detalhes: string
  /** Imagem própria da pessoa AVULSA (#200): referência pro store de imagens
   *  (IndexedDB, images.ts) — o blob nunca entra no FM. Ausente quando a
   *  pessoa não tem imagem ou quando a linha tem Alvo (usa o retrato do alvo). */
  ImgId?: string
}

export function PessoaForm({
  onSubmit,
  onClose,
  initial,
  lockNome,
  withImage,
}: {
  onSubmit: (fields: PessoaFields2) => void
  onClose: () => void
  /** Pré-preenche (edição / alvo existente com Nome travado). */
  initial?: Partial<PessoaFields2>
  lockNome?: boolean
  /** Campo de imagem própria (#200) — SÓ pessoa nova/avulsa; linha com Alvo
   *  usa o retrato do personagem alvo e não oferece upload. */
  withImage?: boolean
}) {
  const [nome, setNome] = useState(initial?.Nome ?? '')
  const [relacao, setRelacao] = useState<string>(initial?.['Relação'] ?? PESSOA_RELACOES[0])
  const [organizacao, setOrganizacao] = useState(initial?.['Organização'] ?? '')
  const [posicao, setPosicao] = useState(initial?.['Posição'] ?? '')
  const [detalhes, setDetalhes] = useState(initial?.Detalhes ?? '')
  // Imagem (#200): arquivo escolhido agora (preview local) OU a já salva do
  // ImgId (edição); "remover" zera ambos e apaga do store no submit.
  const [imgFile, setImgFile] = useState<File | null>(null)
  const [imgRemoved, setImgRemoved] = useState(false)
  const savedImgUrl = useEntityImageUrl(withImage ? (initial?.ImgId ?? null) : null)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!imgFile) {
      setFileUrl(null)
      return
    }
    const url = URL.createObjectURL(imgFile)
    setFileUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [imgFile])
  const imgPreview = fileUrl ?? (imgRemoved ? null : savedImgUrl)

  const submit = () => {
    const Nome = nome.trim()
    if (!Nome) return
    const fields: PessoaFields2 = {
      Nome,
      Relação: relacao,
      Organização: organizacao.trim(),
      Posição: posicao.trim(),
      Detalhes: detalhes.trim(),
    }
    if (withImage) {
      // A imagem vai pro store (IndexedDB) sob um ImgId estável; a linha da
      // pessoa carrega só a REFERÊNCIA. `ImgId: undefined` explícito limpa a
      // referência antiga no editar ({ ...linha, ...fields } sobrescreve).
      let imgId = initial?.ImgId
      if (imgFile) {
        imgId ??= newImageId()
        void saveEntityImage(imgId, imgFile)
      } else if (imgRemoved && imgId) {
        void deleteEntityImage(imgId)
        imgId = undefined
      }
      fields.ImgId = imgId
    }
    onSubmit(fields)
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(0,0,0,.5)' }} />
      <div
        role="dialog"
        aria-label="Adicionar Pessoa"
        style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%,-50%)',
          zIndex: 60,
          width: 'min(460px,92vw)',
          maxHeight: '86vh',
          overflowY: 'auto',
          background: 'var(--panel2)',
          border: '1px solid var(--line2)',
          clipPath: clip(14),
          padding: 20,
          boxShadow: '0 18px 46px rgba(0,0,0,.5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '.12em',
            color: 'var(--muted)',
          }}
        >
          {'// NOVA PESSOA'}
        </div>
        <label>
          <span style={fieldLabelStyle}>NOME</span>
          <input
            aria-label="Nome"
            autoFocus
            value={nome}
          disabled={lockNome}
            onChange={(e) => setNome(e.target.value)}
            style={fieldInputStyle}
          />
        </label>
        <label>
          <span style={fieldLabelStyle}>RELAÇÃO</span>
          <select
            aria-label="Relação"
            value={relacao}
            onChange={(e) => setRelacao(e.target.value)}
            style={{ ...fieldInputStyle, cursor: 'pointer' }}
          >
            {PESSOA_RELACOES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span style={fieldLabelStyle}>ORGANIZAÇÃO</span>
          <input
            aria-label="Organização"
            value={organizacao}
            onChange={(e) => setOrganizacao(e.target.value)}
            style={fieldInputStyle}
          />
        </label>
        <label>
          <span style={fieldLabelStyle}>POSIÇÃO</span>
          <input
            aria-label="Posição"
            value={posicao}
            onChange={(e) => setPosicao(e.target.value)}
            style={fieldInputStyle}
          />
        </label>
        <label>
          <span style={fieldLabelStyle}>DETALHES</span>
          <textarea
            aria-label="Detalhes"
            value={detalhes}
            onChange={(e) => setDetalhes(e.target.value)}
            rows={4}
            style={{ ...fieldInputStyle, resize: 'vertical' }}
          />
        </label>
        {withImage ? (
          // Imagem própria da pessoa (#200) — mesmos rótulos do upload de
          // retrato da ficha (LocalImageUpload, PerfilTab.tsx): 🖼 Imagem /
          // ✕ Remover; preview pequeno ao lado quando existe imagem.
          <div>
            <span style={fieldLabelStyle}>IMAGEM</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {imgPreview ? (
                <img
                  src={imgPreview}
                  alt="Imagem da pessoa"
                  style={{
                    width: 46,
                    height: 46,
                    objectFit: 'cover',
                    border: '1px solid var(--line2)',
                    clipPath: clip(8),
                    flex: 'none',
                  }}
                />
              ) : null}
              <label style={pessoaImgBtnStyle}>
                🖼 Imagem
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0]
                    // Zera o value antes do setState: re-escolher o MESMO
                    // arquivo (após remover) precisa disparar change de novo.
                    e.currentTarget.value = ''
                    if (file) {
                      setImgFile(file)
                      setImgRemoved(false)
                    }
                  }}
                />
              </label>
              {imgPreview ? (
                <button
                  onClick={() => {
                    setImgFile(null)
                    setImgRemoved(true)
                  }}
                  style={{ ...pessoaImgBtnStyle, color: 'var(--muted)' }}
                >
                  ✕ Remover
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 16px',
              background: 'transparent',
              border: '1px solid var(--line2)',
              color: 'var(--muted)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              clipPath: clip(7),
            }}
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!nome.trim()}
            style={{
              padding: '9px 16px',
              background: 'var(--accent)',
              border: '1px solid var(--accent)',
              color: 'var(--ink)',
              cursor: nome.trim() ? 'pointer' : 'not-allowed',
              opacity: nome.trim() ? 1 : 0.5,
              fontSize: 13,
              fontWeight: 700,
              clipPath: clip(7),
            }}
          >
            Adicionar
          </button>
        </div>
      </div>
    </>
  )
}

function HeroCard({ entry, doc }: { entry: IndexDocEntry; doc?: VaultDoc }) {
  const navigate = useNavigate()
  const assets = useAssetIndex()
  const selected = useSelectedCreature() === entry.id // #86
  const nome = entry.basename ?? entry.id
  const classe = plainLabel(doc?.frontmatter['Classe'])
  const nivel = plainLabel(doc?.frontmatter['Nível'])
  // hierarquia de imagem do plugin (Imagem → Retratos/<nome> → Classes/<classe>);
  // #280: card de lista (pequeno) → thumb.
  const portrait = creatureImageUrl(doc, assets, true)
  // Badge NVL com a cor do tier do herói (issue #17): tierFromLevel (espelho
  // de tier-from-level.ts) + registro partyTierBar (1-3 bronze, 4-6 prata,
  // 7-9 ouro, 10+ cristal). Sem Nível carregado, fica nas cores do design.
  const tierCor = nivel ? tierBarColor(tierFromLevel(doc?.frontmatter['Nível'])) : null
  const [menuOpen, setMenuOpen] = useState(false)
  // Só herói LOCAL pode ser deletado (os da vault são fonte de verdade).
  const canDelete = isLocalId(entry.id)
  const abrir = () => navigate(heroPath(entry.id))

  // `div role=button` (não `<button>`) pra permitir o menu (interativo) aninhado.
  return (
    <div
      className={selected ? 'hero-card selected' : 'hero-card'}
      role="button"
      tabIndex={0}
      aria-current={selected ? 'true' : undefined}
      onClick={abrir}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          abrir()
        }
      }}
      style={{ position: 'relative' }}
    >
      <span className="hero-card-stripe" aria-hidden />
      {portrait ? (
        <div className="hero-portrait" style={{ backgroundImage: `url("${portrait}")` }} />
      ) : (
        <span className="hero-ini">{initials(nome)}</span>
      )}
      <div className="hero-main">
        <div className="hero-nome">{nome}</div>
        <div className="hero-classe">{classe}</div>
      </div>
      <div className="hero-nvl" style={tierCor ? { borderColor: tierCor } : undefined}>
        <span className="hero-nvl-num" style={tierCor ? { color: tierCor } : undefined}>
          {nivel || '—'}
        </span>
        <span className="hero-nvl-label">NVL</span>
      </div>
      <CardDotsMenu
        ariaLabel="Ações do herói"
        open={menuOpen}
        setOpen={setMenuOpen}
        items={[
          { label: 'Abrir', onClick: abrir },
          // #205: exportação pelo menu "⋮" — arquivo .pleitost.json fácil de
          // importar de volta (local exporta o store; da vault exporta o doc).
          {
            label: '📤 Exportar herói',
            onClick: () => {
              const rec = canDelete ? getLocalEntity(entry.id) : undefined
              if (rec) downloadPortable(toPortable(rec))
              else if (doc) downloadPortable(portableFromDoc(doc, nome))
            },
          },
          ...(canDelete
            ? [
                {
                  label: `${tokens.emojis.aventureiro.Deletar} Deletar herói`,
                  // #215: só a CÓPIA LOCAL sai — os exemplos da database
                  // (compêndio) nunca são afetados (a vault é read-only).
                  confirmLabel: '⚠️ Confirmar? Remove só a cópia local',
                  color: 'var(--red)',
                  onClick: () => removeLocalEntity(entry.id),
                },
              ]
            : []),
        ]}
      />
    </div>
  )
}

/** Gatilho "⋮" + menu flutuante dos cards (herói e CA local — #205). Vive
 *  FORA de <button> (os cards com menu usam div role=button) porque menu
 *  interativo aninhado em button é inválido. */
function CardDotsMenu({
  ariaLabel,
  open,
  setOpen,
  items,
}: {
  ariaLabel: string
  open: boolean
  setOpen: (fn: (o: boolean) => boolean) => void
  items: { label: string; color?: string; confirmLabel?: string; onClick: () => void }[]
}) {
  // #215: confirmação IN-APP em dois cliques — window.confirm é suprimido em
  // PWA standalone (iOS) e o item de deletar parecia morto. 1º clique ARMA
  // (troca o rótulo), 2º executa; fechar o menu desarma.
  const [armado, setArmado] = useState<string | null>(null)
  useEffect(() => {
    if (!open) setArmado(null)
  }, [open])
  // #215 (causa raiz): os cards têm clip-path — menu absoluto DENTRO do card
  // é cortado pelo polígono e vira não-clicável no navegador real (jsdom não
  // faz hit-testing, por isso os testes de tela passavam). O menu renderiza
  // num PORTAL no body, posicionado pelo rect do gatilho.
  const triggerRef = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  useEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) setPos({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) })
  }, [open])
  return (
    <>
      <span
        ref={triggerRef}
        className="card-dots"
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            e.stopPropagation()
            setOpen((o) => !o)
          }
        }}
        style={{ cursor: 'pointer' }}
      >
        ⋮
      </span>
      {open ? (
        createPortal(
        <>
          {/* clique fora fecha */}
          <div
            onClick={(e) => {
              e.stopPropagation()
              setOpen(() => false)
            }}
            style={{ position: 'fixed', inset: 0, zIndex: 40 }}
          />
          <div
            role="menu"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: pos?.top ?? 8,
              right: pos?.right ?? 8,
              zIndex: 41,
              minWidth: 150,
              background: 'var(--card)',
              border: '1px solid var(--line2)',
              borderRadius: 8,
              boxShadow: '0 12px 32px rgba(0,0,0,.5)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  if (item.confirmLabel && armado !== item.label) {
                    setArmado(item.label)
                    return
                  }
                  setOpen(() => false)
                  item.onClick()
                }}
                style={item.color ? { ...heroMenuItemStyle, color: item.color } : heroMenuItemStyle}
              >
                {item.confirmLabel && armado === item.label ? item.confirmLabel : item.label}
              </button>
            ))}
          </div>
        </>,
        document.body,
        )
      ) : null}
    </>
  )
}

const heroMenuItemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 13px',
  background: 'transparent',
  border: 'none',
  color: 'var(--text)',
  fontSize: 13,
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
}

// Abas da tela de heróis (pedido do usuário 2026-07-04): HERÓIS | GRUPOS,
// no mesmo padrão de abas desenhado do §NPCS.
const HEROIS_TABS = [
  { id: 'herois', label: 'HERÓIS' },
  { id: 'grupos', label: 'GRUPOS' },
]

/** Card de grupo na linguagem do card de herói (lista sem design dedicado ainda). */
function GroupCard({
  entry,
  memberCount,
  rank,
  onOpen,
}: {
  entry: IndexDocEntry
  memberCount: number
  rank: string
  onOpen: () => void
}) {
  const assets = useAssetIndex()
  // Imagem do grupo (issue #16): Retratos/<basename do grupo> via
  // groupImageUrl; sem retrato mantém o fallback ⚔️. #280: card pequeno → thumb.
  const portrait = groupImageUrl(entry.basename, assets, true)
  // Rank box com as cores do registro partyBountyRank (issue #16) — espelha
  // o rankBadge do plugin (render-party-sheet.ts:215-219) com o glow de
  // .pleitost-party__rank (styles.css:12420: 0 2px 8px var(--party-glow)).
  const rk = rankColors(rank)
  return (
    <button className="hero-card" onClick={onOpen}>
      <span className="hero-card-stripe" aria-hidden />
      {portrait ? (
        <div className="hero-portrait" style={{ backgroundImage: `url("${portrait}")` }} />
      ) : (
        <span className="hero-ini" aria-hidden>
          ⚔️
        </span>
      )}
      <div className="hero-main">
        <div className="hero-nome">{entry.basename ?? entry.id}</div>
        <div className="hero-classe">{memberCount} integrantes</div>
      </div>
      <div
        className="grupo-rank"
        aria-hidden
        style={{
          color: rk.color,
          background: rk.bg,
          borderColor: rk.color,
          boxShadow: `0 2px 8px ${rk.glow}`,
        }}
      >
        {rank}
      </div>
      <span className="card-dots" aria-hidden>
        ⋮
      </span>
    </button>
  )
}

function GruposPanel({
  selected,
  onSelect,
}: {
  selected: string | null
  onSelect: (id: string | null) => void
}) {
  const catalog = useCatalog()
  const version = useLocalStoreVersion()
  // #213: a lista de GRUPOS tem só os grupos DO USUÁRIO (locais — montados
  // com os personagens da lista de heróis) e a MESA da sessão ativa (abaixo).
  // Os grupos puxados do Obsidian são EXEMPLOS e vivem no compêndio
  // (Sistema/Criaturas/Grupos de Criaturas), fora desta lista.
  const groups = useMemo(
    () => localEntriesOfKind('Grupo'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  )
  const live = useLiveSession()
  // #222: "a ficha do grupo não tá aparecendo automaticamente quando a sessão
  // existe" — o card da mesa aparece com a sessão local ATIVA mesmo sem a
  // conexão viva (o GrupoDaSala orienta a conectar); conectado, mostra contagem.
  const { active: sessaoAtiva } = useSessions()
  const membersByGroup = useMemo(
    () => new Map(groups.map((g) => [g.id, resolveGroupMembers(catalog, g.id)])),
    [catalog, groups, version],
  )
  const allIds = useMemo(
    () => [
      ...groups.map((g) => g.id),
      ...groups.flatMap((g) => membersByGroup.get(g.id)!.map((m) => m.id)),
    ],
    [groups, membersByGroup],
  )
  const docs = useDocs(allIds)

  if (selected === MESA_ID) {
    return (
      <div>
        <button className="grupo-voltar" onClick={() => onSelect(null)}>
          ← GRUPOS
        </button>
        {/* #231: a mesa abre a ficha de GRUPO REAL (abas), com os integrantes
            resolvidos da sala viva (resolveGroupMembers + docs sessao:) */}
        <GrupoView groupId={MESA_ID} />
      </div>
    )
  }
  if (selected) {
    return (
      <div>
        <button className="grupo-voltar" onClick={() => onSelect(null)}>
          ← GRUPOS
        </button>
        <GrupoView groupId={selected} />
      </div>
    )
  }

  return (
    <div className="herois-page">
      {/* #213: mesa da sessão ativa como grupo — o grupo "existe a partir da
          sessão" (#203); abre a mesma tabela do DETALHES (GrupoDaSala). */}
      {live || sessaoAtiva ? (
        <button className="hero-card" onClick={() => onSelect(MESA_ID)}>
          <span className="hero-card-stripe" aria-hidden />
          <span className="hero-ini">⚔️</span>
          <div className="hero-main">
            <div className="hero-nome">Grupo da Sessão</div>
            <div className="hero-classe">
              {live
                ? mesaResumo(live)
                : `sessão ${sessaoAtiva!.codigo} — conectar pela aba SESSÃO`}
            </div>
          </div>
        </button>
      ) : null}
      {groups.map((group) => {
        const members = membersByGroup.get(group.id)!
        const maxTier = members.length
          ? Math.max(
              ...members.map((m) => tierFromLevel(docs?.get(m.id)?.frontmatter['Nível'])),
            )
          : 1
        const rank = rankLetter(docs?.get(group.id)?.frontmatter ?? {}, maxTier)
        return (
          <GroupCard
            key={group.id}
            entry={group}
            memberCount={members.length}
            rank={rank}
            onOpen={() => onSelect(group.id)}
          />
        )
      })}
    </div>
  )
}

export function HeroisPage() {
  // req 4 (#181): o painel Heróis lista APENAS os personagens do usuário
  // (criados por ele — escrita); os da vault seguem acessíveis via grupos/
  // compêndio, mas não são "dele" pra jogar.
  const { entries, docs } = useFolderDocs(HEROIS_FOLDER, 'Heroi', { includeVault: false })
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const selectedGroup = searchParams.get('grupo')
  const [tab, setTab] = useState(selectedGroup ? 'grupos' : 'herois')
  const index = Math.max(0, HEROIS_TABS.findIndex((t) => t.id === tab))

  const selectGroup = (id: string | null) => {
    setSearchParams(id ? { grupo: id } : {})
    if (id) setTab('grupos')
  }

  // #42: cria herói local em branco (skeleton válido) e abre a ficha pra
  // montar via rule elements (a cascata fica com outra parte).
  const criarHeroi = () => {
    const id = createLocalEntity('Heroi', 'Novo Herói', emptyHeroFrontmatter())
    navigate(heroPath(id))
  }
  // #205: modal Importar Herói (arquivo .pleitost.json ou exemplo do compêndio)
  const [importOpen, setImportOpen] = useState(false)
  // #43: cria grupo local e o abre (nome + integrantes editáveis no header).
  const criarGrupo = () => {
    const id = createLocalEntity('Grupo', 'Novo Grupo', emptyGroupFrontmatter())
    selectGroup(id)
  }

  return (
    <div className="npcs-page">
      <div className="npc-tabs">
        {HEROIS_TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'npc-tab on' : 'npc-tab'}
            onClick={() => {
              setTab(t.id)
              if (t.id === 'grupos') selectGroup(null)
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <PanelTrack index={index}>
        <TrackPanel pad="0">
          <div className="herois-page">
            {docs
              ? // docs carregados: grupos por tier decrescente (issue #31);
                // lista achatada com key estável por card, pros nós do DOM
                // sobreviverem à transição plano → agrupado
                tierGroups(entries, docs, tierOfNivel).flatMap((group) => [
                  <TierKicker key={`tier-${group.letter}`} letter={group.letter} />,
                  ...group.entries.map((entry) => (
                    <HeroCard key={entry.id} entry={entry} doc={docs.get(entry.id)} />
                  )),
                ])
              : // carregando: lista plana de antes (estado de loading intacto)
                entries.map((entry) => <HeroCard key={entry.id} entry={entry} />)}
          </div>
        </TrackPanel>
        <TrackPanel pad="0">
          <GruposPanel selected={selectedGroup} onSelect={selectGroup} />
        </TrackPanel>
      </PanelTrack>
      {tab === 'herois' ? (
        <>
          <CreateFab label="+ Criar Herói" onClick={criarHeroi} />
          {/* #205: importar de ARQUIVO ou dos EXEMPLOS do compêndio */}
          <CreateFab
            label="📥 Importar Herói"
            secondary
            bottom={74}
            onClick={() => setImportOpen(true)}
          />
        </>
      ) : !selectedGroup ? (
        <CreateFab label="+ Criar Grupo" onClick={criarGrupo} />
      ) : null}
      {importOpen ? (
        <ImportarModal
          kind="Heroi"
          folder={HEROIS_FOLDER}
          onClose={() => setImportOpen(false)}
          onImported={(id) => {
            setImportOpen(false)
            navigate(heroPath(id))
          }}
        />
      ) : null}
    </div>
  )
}

/** Cor do TIER de monstro — espelha tierColorForMonstro (header-monstro.ts:32):
 *  Tier 0 usa o registro tokens.colors.tier.Zero (palette-registry.ts:13,
 *  "Tier 0 do Monstro (sem tier) — usado como --badge-tier-color"); tiers 1+
 *  seguem o registro partyTierBar (issue #19), com teto em Tier4. */
function monsterTierColor(t: number): string {
  if (t <= 0) return tokens.colors.tier.Zero
  return tierBarColor(Math.min(Math.floor(t), 4))
}

function NpcCard({
  entry,
  doc,
  readonly,
}: {
  entry: IndexDocEntry
  doc?: VaultDoc
  /** Selo de companheiro CONHECIDO (sem escrita) vs próprio — req 4.1. */
  readonly?: boolean
}) {
  const navigate = useNavigate()
  const selected = useSelectedCreature() === entry.id // #86
  const nome = entry.basename ?? entry.id
  // subtítulo accent2 do design (n.tipo): Raça, senão Classe, senão subtipo
  const tipo =
    plainLabel(doc?.frontmatter['Raça']) ||
    plainLabel(doc?.frontmatter['Classe']) ||
    entry.subtype ||
    ''
  const nivel = plainLabel(doc?.frontmatter['Nível'])
  // Retrato local-first (#200): imagem subida pelo jogador (inclui a de Pessoa
  // avulsa via FM ImgId) tem precedência; senão hierarquia da vault. #280: ícone
  // da lista de NPCs (pequeno) → thumb.
  const portrait = useCreaturePortrait(doc, true)

  // Badge do losango por subtipo:
  //  - Monstro (issue #19): a divisão é por FM `Tier` (não têm Nível) — o
  //    losango NVL do design vira TIER, rótulo verbatim do badge do plugin
  //    (header-monstro.ts:107) e número = FM Tier, cor via monsterTierColor.
  //  - Companheiro Animal (issue #18): NVL colorido pelo tier do nível,
  //    mesma lógica/registro dos heróis (tierFromLevel + partyTierBar).
  //  - Demais (Pessoas): losango NVL do design, sem cor de tier.
  const subtype = doc?.subtype ?? entry.subtype
  // Local CA/Monstro abrem a ficha formato herói (issues #46/#47). #229:
  // monstro da VAULT abre a MESMA ficha — a rota de doc do compêndio só
  // mostrava o fence autosheet-yaml cru (nenhum stat), e Sistema/Criaturas
  // está fora do compêndio (#213). A FichaPage já carrega qualquer id via
  // useDoc (o Carlos da vault abre assim); edições vão pro overlay local,
  // a vault nunca é escrita. Demais (CA da vault e Pessoa) mantêm o doc.
  const abreFicha =
    subtype === 'Monstro' || (isLocalId(entry.id) && subtype === 'Companheiro Animal')
  const target = abreFicha ? heroPath(entry.id) : docPath(entry.id)
  const isMonstro = subtype === 'Monstro'
  const tierFm = doc?.frontmatter['Tier']
  const tierNum =
    isMonstro && tierFm != null && tierFm !== '' && Number.isFinite(Number(tierFm))
      ? Number(tierFm)
      : null
  const badgeLabel = isMonstro ? 'TIER' : 'NVL'
  const badgeNum = isMonstro ? (tierNum != null ? String(tierNum) : '—') : nivel || '—'
  const badgeCor = isMonstro
    ? tierNum != null
      ? monsterTierColor(tierNum)
      : null
    : subtype === 'Companheiro Animal' && nivel
      ? tierBarColor(tierFromLevel(doc?.frontmatter['Nível']))
      : null

  // #205: CA local exporta pelo menu "⋮" (mesmo formato do herói). O root é
  // div role=button (vide HeroCard) porque menu interativo não pode aninhar
  // em <button>.
  const [menuOpen, setMenuOpen] = useState(false)
  // #229 (b): caminho DIRETO do mestre — monstro (vault OU local) entra na
  // iniciativa da sessão remota ativa pelo menu do card. Gate espelha o
  // Criador de Combate (repo + sala viva) + Modo Mestre; sem sala o item
  // não existe (nada de item morto).
  const { mestre } = useSettings()
  const repo = useSessionRepo()
  const user = useSessionUser()
  const live = useLiveSession()
  const catalog = useCatalog()
  const podeExportar =
    isLocalId(entry.id) && (subtype === 'Companheiro Animal' || subtype === 'Monstro')
  const podeIniciativa = isMonstro && mestre && !!repo && !!user && !!live
  const temMenu = podeExportar || podeIniciativa
  // #241: CA CONHECIDA (vault, sem escrita) abre a ficha RESUMO nos detalhes
  // — o doc do compêndio só mostrava o fence cru. Sem contexto de detalhes,
  // cai na rota antiga.
  const detail = useDetail()
  const resumoConhecido = readonly && subtype === 'Companheiro Animal'
  const abrir = () => {
    if (resumoConhecido && detail) {
      detail.open({ kind: 'resumo', id: entry.id })
      return
    }
    navigate(target)
  }

  return (
    <div
      className={selected ? 'npc-card selected' : 'npc-card'}
      role="button"
      tabIndex={0}
      aria-current={selected ? 'true' : undefined}
      onClick={abrir}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          abrir()
        }
      }}
      style={{ position: 'relative' }}
    >
      {portrait ? (
        <span className="npc-ic" style={{ backgroundImage: `url("${portrait}")` }} />
      ) : (
        <span className="npc-ic npc-ini">{initials(nome)}</span>
      )}
      <div className="npc-main">
        <div className="npc-nome">{nome}</div>
        {/* Selo FORA do .npc-nome — testes/design leem o nome puro ali. */}
        {readonly ? (
          <span
            title="Companheiro conhecido (sem direito de escrita)"
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 8.5,
              letterSpacing: '.08em',
              color: 'var(--muted)',
              border: '1px solid var(--line2)',
              padding: '2px 6px',
              alignSelf: 'flex-start',
              margin: '2px 0',
            }}
          >
            🔒 CONHECIDO
          </span>
        ) : null}
        <div className="npc-tipo">{tipo}</div>
      </div>
      <div className="npc-nvl">
        <span
          className="npc-nvl-diamond"
          aria-hidden
          style={badgeCor ? { borderColor: badgeCor } : undefined}
        />
        <div className="npc-nvl-inner">
          <span className="npc-nvl-label">{badgeLabel}</span>
          <span className="npc-nvl-num" style={badgeCor ? { color: badgeCor } : undefined}>
            {badgeNum}
          </span>
        </div>
      </div>
      {temMenu ? (
        <CardDotsMenu
          ariaLabel={subtype === 'Monstro' ? 'Ações da criatura' : 'Ações do companheiro'}
          open={menuOpen}
          setOpen={setMenuOpen}
          items={[
            { label: 'Abrir', onClick: abrir },
            ...(podeExportar
              ? [
                  {
                    label:
                      subtype === 'Monstro' ? '📤 Exportar criatura' : '📤 Exportar companheiro',
                    onClick: () => {
                      const rec = getLocalEntity(entry.id)
                      if (rec) downloadPortable(toPortable(rec))
                    },
                  },
                ]
              : []),
            ...(isMonstro && mestre && repo && user && live
              ? [
                  {
                    label: '⚔️ Adicionar à iniciativa',
                    onClick: () =>
                      void addMonsterToInitiative({
                        repo,
                        catalog,
                        live,
                        memberId: user.id,
                        // vault: path da nota (.md); local: o id é o path
                        sourcePath: entry.path,
                        label: nome,
                      }),
                  },
                ]
              : []),
          ]}
        />
      ) : (
        <span className="card-dots" aria-hidden>
          ⋮
        </span>
      )}
    </div>
  )
}

function NpcPanel({
  folder,
  tierOf,
  localKind,
  includeVault,
  vaultReadonly,
  prepend,
}: {
  folder: string
  tierOf?: (doc?: VaultDoc) => number
  localKind: LocalKind
  /** false = só entidades do usuário (Criaturas/Pessoas, req 5). */
  includeVault?: boolean
  /** true = entradas da vault ganham o selo SOMENTE LEITURA (companheiros
   *  conhecidos vs próprios — req 4.1, #182). */
  vaultReadonly?: boolean
  /** Cards extras ANTES da lista (Pessoas das anotações dos heróis — req 5). */
  prepend?: ReactNode
}) {
  const { entries, docs } = useFolderDocs(folder, localKind, { includeVault })
  return (
    <TrackPanel pad="0">
      <div className="npc-panel-inner">
        {prepend}
        {docs && tierOf
          ? // docs carregados: grupos por tier decrescente (issue #31);
            // lista achatada com key estável por card (vide HeroisPage)
            tierGroups(entries, docs, tierOf).flatMap((group) => [
              <TierKicker key={`tier-${group.letter}`} letter={group.letter} />,
              ...group.entries.map((entry) => (
                <NpcCard
                  key={entry.id}
                  entry={entry}
                  doc={docs.get(entry.id)}
                  readonly={vaultReadonly && !isLocalId(entry.id)}
                />
              )),
            ])
          : // carregando (ou aba sem agrupamento): lista plana de antes
            entries.map((entry) => (
              <NpcCard
                key={entry.id}
                entry={entry}
                doc={docs?.get(entry.id)}
                readonly={vaultReadonly && !isLocalId(entry.id)}
              />
            ))}
        {entries.length === 0 ? (
          <div className="npc-empty">// NENHUM REGISTRO NESTA CATEGORIA</div>
        ) : null}
      </div>
    </TrackPanel>
  )
}

/** Pessoas cadastradas nas ANOTAÇÕES dos heróis do usuário (req 5, #183):
 *  aparecem em Criaturas/Pessoas com o herói de origem; clicar abre a aba
 *  ANOTAÇÕES do herói (onde a edição vive — os campos são pessoais dele). */
function PessoasDeAnotacoes() {
  const version = useLocalStoreVersion()
  const rows = useMemo(() => {
    const out: Array<{
      heroId: string
      heroNome: string
      Nome: string
      rel: string
      alvo?: string
      imgId?: string
    }> = []
    for (const h of localEntriesOfKind('Heroi')) {
      const fmp = getLocalDoc(h.id)?.frontmatter as Record<string, unknown> | undefined
      const pessoas = Array.isArray(fmp?.['Pessoas']) ? (fmp!['Pessoas'] as Record<string, string>[]) : []
      for (const p of pessoas) {
        out.push({
          heroId: h.id,
          heroNome: h.basename ?? h.id,
          Nome: p['Nome'] ?? '',
          rel: p['Relação'] ?? '',
          alvo: p['Alvo'],
          imgId: p['ImgId'],
        })
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version])
  if (!rows.length) return null
  return (
    <>
      {rows.map((r, i) => (
        <PessoaDeAnotacaoCard key={`${r.heroId}-${r.Nome}-${i}`} row={r} />
      ))}
    </>
  )
}

/** Card de pessoa das anotações — retrato (#200): Alvo → retrato do alvo;
 *  avulsa → imagem própria (ImgId); sem imagem → iniciais (fallback padrão). */
function PessoaDeAnotacaoCard({
  row,
}: {
  row: { heroId: string; heroNome: string; Nome: string; rel: string; alvo?: string; imgId?: string }
}) {
  const navigate = useNavigate()
  const portrait = usePessoaPortrait(row.alvo, row.imgId)
  return (
    <button
      className="npc-card"
      onClick={() => navigate(heroPath(row.heroId, 'anotacoes'))}
      title={`Anotações de ${row.heroNome}`}
    >
      {portrait ? (
        <span className="npc-ic" style={{ backgroundImage: `url("${portrait}")` }} />
      ) : (
        <span className="npc-ic npc-ini">{initials(row.Nome)}</span>
      )}
      <div className="npc-main">
        <div className="npc-nome">{row.Nome}</div>
        <div className="npc-tipo">
          {row.rel ? `${row.rel} · ` : ''}conhecido de {row.heroNome}
        </div>
      </div>
    </button>
  )
}

export function NpcsPage() {
  // #249: deep-link de aba via `?tab=` (mesmo padrão do FichaPage/SessaoFicha) —
  // ex.: o "criar combate" da tela de Combates do compêndio abre `?tab=combate`.
  const [searchParams] = useSearchParams()
  const tabPedida = searchParams.get('tab')
  const abaInicial =
    tabPedida && [...NPC_TABS, ...MESTRE_TABS].some((t) => t.id === tabPedida)
      ? tabPedida
      : NPC_TABS[0]!.id
  const [tab, setTab] = useState(abaInicial)
  const [pessoaOpen, setPessoaOpen] = useState(false)
  // #205: modal Importar Companheiro Animal (arquivo ou exemplo do compêndio)
  const [importCAOpen, setImportCAOpen] = useState(false)
  // #185: criação rápida de monstro a partir do bestiário da vault
  const [importMonstroOpen, setImportMonstroOpen] = useState(false)
  const navigate = useNavigate()
  // Modo Mestre (issue #35): com Mestre OFF as abas gated (BESTIÁRIO +
  // COMBATE/AVENTURA dos Criadores, #194/#195) ficam bloqueadas pra clique
  // (convenção :disabled existente — opacity/cursor, sem mensagem nova);
  // reativo via useSettings — se o modo desligar com a aba ativa, a
  // seleção recua pra primeira aba.
  const { mestre } = useSettings()
  const allTabs = [...NPC_TABS.map(({ id, label }) => ({ id, label })), ...MESTRE_TABS]
  const activeTab = !mestre && MESTRE_GATED_IDS.has(tab) ? NPC_TABS[0]!.id : tab
  const index = allTabs.findIndex((t) => t.id === activeTab)

  // #46: Companheiro Animal local → ficha (família CA: Tutor). #47: Monstro
  // local → ficha formato herói (família Monstro: Tier/Raça).
  const criarCompanheiro = () => {
    const id = createLocalEntity(
      'CompanheiroAnimal',
      'Novo Companheiro',
      emptyCompanheiroFrontmatter('Novo Companheiro'),
    )
    navigate(heroPath(id))
  }
  const criarCriatura = () => {
    const id = createLocalEntity('Monstro', 'Nova Criatura', emptyMonstroFrontmatter())
    navigate(heroPath(id))
  }
  // #45: Pessoa local via formulário → entra na lista de PESSOAS
  // (com imagem própria opcional — #200: ImgId referencia o store de imagens).
  const criarPessoa = (fields: PessoaFields2) => {
    createLocalEntity('Pessoa', fields.Nome, pessoaFrontmatter(fields))
    setPessoaOpen(false)
  }

  return (
    <div className="npcs-page">
      <div className="npc-tabs">
        {allTabs.map((t) => (
          <button
            key={t.id}
            className={activeTab === t.id ? 'npc-tab on' : 'npc-tab'}
            disabled={MESTRE_GATED_IDS.has(t.id) && !mestre}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <PanelTrack index={index}>
        {NPC_TABS.map((t) => (
          <NpcPanel
            key={t.id}
            folder={t.folder}
            tierOf={t.tierOf}
            localKind={t.localKind}
            includeVault={t.id !== 'pessoas'}
            vaultReadonly={t.id === 'companheiros'}
            prepend={t.id === 'pessoas' ? <PessoasDeAnotacoes /> : undefined}
          />
        ))}
        {/* Criadores do Modo Mestre (#195/#194) — só montam com Mestre ON
            (gate interno dos componentes cobre o painel fora de foco) */}
        <TrackPanel>
          <CriadorCombate />
        </TrackPanel>
        <TrackPanel>
          <CriadorAventura />
        </TrackPanel>
      </PanelTrack>
      {activeTab === 'pessoas' ? (
        <CreateFab label="+ Adicionar Pessoa" onClick={() => setPessoaOpen(true)} />
      ) : activeTab === 'companheiros' ? (
        <>
          <CreateFab label="+ Adicionar Companheiro Animal" onClick={criarCompanheiro} />
          {/* #205: "o mesmo pra companheiro animal" — importar de arquivo/compêndio */}
          <CreateFab
            label="📥 Importar Companheiro"
            secondary
            bottom={74}
            onClick={() => setImportCAOpen(true)}
          />
        </>
      ) : activeTab === 'bestiario' && mestre ? (
        <>
          {/* gating do Modo Mestre (issue #35) também vale pra criação */}
          <CreateFab label="+ Adicionar Criatura" onClick={criarCriatura} />
          {/* #185: criação RÁPIDA — copia um monstro do bestiário da vault
              como base editável (mesmo fluxo de importar do compêndio, #205) */}
          <CreateFab
            label="📥 Criar do Bestiário"
            secondary
            bottom={74}
            onClick={() => setImportMonstroOpen(true)}
          />
        </>
      ) : null}
      {pessoaOpen ? (
        <PessoaForm withImage onSubmit={criarPessoa} onClose={() => setPessoaOpen(false)} />
      ) : null}
      {importCAOpen ? (
        <ImportarModal
          kind="CompanheiroAnimal"
          folder="Sistema/Criaturas/Companheiros Animais"
          onClose={() => setImportCAOpen(false)}
          onImported={(id) => {
            setImportCAOpen(false)
            navigate(heroPath(id))
          }}
        />
      ) : null}
      {importMonstroOpen ? (
        <ImportarModal
          kind="Monstro"
          folder="Sistema/Criaturas/Bestiário"
          onClose={() => setImportMonstroOpen(false)}
          onImported={(id) => {
            setImportMonstroOpen(false)
            navigate(heroPath(id))
          }}
        />
      ) : null}
    </div>
  )
}

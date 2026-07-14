// ENTIDADES LOCAIS (issues #42–#47): heróis/grupos/pessoas/companheiros animais/
// monstros CRIADOS no navegador. A vault é READ-ONLY (o app nunca escreve nela),
// então uma entidade nova não pode virar um .md — ela vive NESTE store local,
// espelhando o padrão do hero-store: leitura SÍNCRONA pra hidratar no primeiro
// render, cache em memória + notify pra useSyncExternalStore, canal 'imediato'
// (cada mutação grava o localStorage na hora — não há edits debounced aqui).
//
// Dois namespaces:
//   pleitost.localEntities   — Record<id, StoredEntity> por id local
//                              (`local:<Kind>:<rand>`), com o FM completo.
//   pleitost.groupMembership  — Record<groupId, {add, remove}>: override de
//                              integrantes por grupo (issue #44). Para grupos
//                              DA VAULT o override soma/subtrai à derivação de
//                              member-resolver (party.groupMembers) sem tocar a
//                              vault; para grupos LOCAIS o `add` É a lista.
//
// Diferente do hero-store (overlay ESPARSO sobre um FM extraído imutável), aqui
// o FM local é a ÚNICA fonte de verdade da entidade: editar grava o path direto
// no FM guardado (não há overlay — diretriz da fundação). O skeleton do FM em
// branco espelha a forma de um herói real esvaziado (listas vazias, atributos 0),
// pra ficha e abas renderizarem sem crash.
import { useMemo, useSyncExternalStore } from 'react'
import type { Catalog } from './catalog'
import type { IndexDocEntry, VaultDoc } from './types'
import { groupMembers } from '../grupo/party'
import {
  getLiveSession,
  MESA_GRUPO_ID,
  useLiveSession,
} from './session-repo/live-session'

export const LOCAL_PREFIX = 'local:'
export function isLocalId(id: string): boolean {
  return id.startsWith(LOCAL_PREFIX)
}

/** Famílias de entidade local. O slug entra no id (`local:<Kind>:<rand>`); o
 *  subtype real (com espaço, ex. "Companheiro Animal") vive no registro. */
export type LocalKind =
  | 'Heroi'
  | 'Grupo'
  | 'Pessoa'
  | 'CompanheiroAnimal'
  | 'Monstro'
  | 'Aventura'

interface KindInfo {
  type: string
  subtype: string
  /** Rota de abertura: 'hero' → ficha de herói (/heroi); 'doc' → /doc; 'group'. */
  ficha: 'hero' | 'doc' | 'group'
}

/** Registro central das famílias — type/subtype espelham o que o extractor grava
 *  pros docs reais da vault (Criatura/Heroi, Criatura/Companheiro Animal,
 *  Criatura/Monstro, Grupo/Aventureiros). */
export const KIND_INFO: Record<LocalKind, KindInfo> = {
  Heroi: { type: 'Criatura', subtype: 'Heroi', ficha: 'hero' },
  CompanheiroAnimal: { type: 'Criatura', subtype: 'Companheiro Animal', ficha: 'hero' },
  Monstro: { type: 'Criatura', subtype: 'Monstro', ficha: 'hero' },
  Pessoa: { type: 'Criatura', subtype: 'Pessoa', ficha: 'doc' },
  Grupo: { type: 'Grupo', subtype: 'Aventureiros', ficha: 'group' },
  // #248 — aventura criada no Modo Mestre. type: Aventura (espelha o extractor:
  // FM.categoria = 'Aventura'). O subtype do entry fica constante 'Aventura'; a
  // subcategoria REAL da missão (Neutralização/Resgate/…) vive no FM e é a fonte
  // do chip de subcat na carta (bountyMetaFromDoc lê fm.subcategoria primeiro).
  Aventura: { type: 'Aventura', subtype: 'Aventura', ficha: 'doc' },
}

export interface StoredEntity {
  id: string
  kind: LocalKind
  type: string
  subtype: string
  basename: string
  frontmatter: Record<string, unknown>
  /** Estado de UI sem home no FM (chips/escudo erguido/consumível usado). */
  session: Record<string, unknown>
  /** Adições sem linha de FM (extras dos painéis ADICIONADAS). */
  extras: Record<string, unknown>
}

interface Membership {
  add: string[]
  remove: string[]
}

const ENTITIES_KEY = 'pleitost.localEntities'
const MEMBERSHIP_KEY = 'pleitost.groupMembership'

/* ===================== storage ===================== */

function storage(): Storage | null {
  return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
}
function safeGet(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null
  } catch {
    return null
  }
}
function safeSet(key: string, value: string): void {
  try {
    storage()?.setItem(key, value)
  } catch {
    /* memória continua a fonte da sessão */
  }
}

/* ===================== memória + reatividade ===================== */

let entities: Map<string, StoredEntity> | null = null
let membership: Map<string, Membership> | null = null
let version = 0
const listeners = new Set<() => void>()

/** Único canal de notificação: qualquer mutação (entidade OU membership) bumpa
 *  a versão e acorda os assinantes — coarse, mas suficiente pra escala do app. */
function bump(): void {
  version++
  for (const cb of listeners) cb()
}

export function subscribeLocalStore(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
export function localStoreVersion(): number {
  return version
}

/** Versão reativa dos stores locais — componentes a incluem nas deps de memo
 *  pra recomputar listas/membros quando uma entidade local muda. */
export function useLocalStoreVersion(): number {
  return useSyncExternalStore(subscribeLocalStore, localStoreVersion, localStoreVersion)
}

function hydrateEntities(): Map<string, StoredEntity> {
  if (entities) return entities
  const map = new Map<string, StoredEntity>()
  const raw = safeGet(ENTITIES_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, StoredEntity>
      for (const [id, rec] of Object.entries(parsed)) {
        if (rec && typeof rec === 'object' && typeof rec.id === 'string') {
          map.set(id, {
            ...rec,
            frontmatter: rec.frontmatter ?? {},
            session: rec.session ?? {},
            extras: rec.extras ?? {},
          })
        }
      }
    } catch {
      /* corrompido → começa vazio */
    }
  }
  entities = map
  return map
}

function hydrateMembership(): Map<string, Membership> {
  if (membership) return membership
  const map = new Map<string, Membership>()
  const raw = safeGet(MEMBERSHIP_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, Membership>
      for (const [id, m] of Object.entries(parsed)) {
        map.set(id, {
          add: Array.isArray(m?.add) ? m.add.filter((x) => typeof x === 'string') : [],
          remove: Array.isArray(m?.remove) ? m.remove.filter((x) => typeof x === 'string') : [],
        })
      }
    } catch {
      /* corrompido → começa vazio */
    }
  }
  membership = map
  return map
}

function persistEntities(): void {
  const map = hydrateEntities()
  safeSet(ENTITIES_KEY, JSON.stringify(Object.fromEntries(map)))
}
function persistMembership(): void {
  const map = hydrateMembership()
  // grupos sem override não ocupam espaço
  const obj: Record<string, Membership> = {}
  for (const [id, m] of map) if (m.add.length || m.remove.length) obj[id] = m
  safeSet(MEMBERSHIP_KEY, JSON.stringify(obj))
}

/* ===================== ids + deep-set ===================== */

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Set imutável num dot-path: clona só a espinha, substitui o nó inteiro
 *  (mesma semântica do setAtPath do hero-store). */
function deepSet(
  root: Record<string, unknown>,
  segs: string[],
  value: unknown,
): Record<string, unknown> {
  const out = { ...root }
  let node = out
  for (let i = 0; i < segs.length - 1; i++) {
    const cur = node[segs[i]]
    const clone =
      cur && typeof cur === 'object' && !Array.isArray(cur)
        ? { ...(cur as Record<string, unknown>) }
        : {}
    node[segs[i]] = clone
    node = clone
  }
  node[segs[segs.length - 1]] = value
  return out
}

/* ===================== skeletons (template base do plugin) ===================== */

// O skeleton NÃO nasce vazio: espelha o `defaultModelFor` (+ pericia-defaults)
// do plugin pleitost-autosheet (src/data/family-defaults.ts) serializado no
// SHAPE do FM (nomes ACENTUADOS como serialize-to-fm.ts grava, confirmados no
// FM real do Thoren). Assim a ficha nova nasce com atributos {3,2,1,0}+Principal,
// 13 perícias / 4 defesas / 2 sentidos / 3 ofícios / movimento base em rank N e
// a estrutura de Magias com as 4 escolas. Sem isso as abas renderizavam listas
// vazias e atributos "repetidos" (issues #52–#56). Regras/slots sobem POR CIMA
// disto (merge-calculated); os campos de identidade (Nível/Tier/Raça/Tutor/
// subcategoria) são ajustados por família.

/** 13 perícias base em rank N — nome ACENTUADO (FM) + atributo default do
 *  plugin (PERICIA_ATRIBUTO_DEFAULT), na ordem canônica de PERICIAS. */
const PERICIA_BASE: ReadonlyArray<readonly [string, string]> = [
  ['Atletismo', 'FOR'],
  ['Acrobacia', 'AGI'],
  ['Furtividade', 'AGI'],
  ['Ladinagem', 'AGI'],
  ['Arcana', 'INT'],
  ['Sociedades', 'INT'],
  ['Guerra', 'INT'],
  ['Medicina', 'INT'],
  ['Sobrevivência', 'INT'],
  ['Anima', 'PRE'],
  ['Diplomacia', 'PRE'],
  ['Enganação', 'PRE'],
  ['Intimidação', 'PRE'],
]

function defaultPericiasLista(): Record<string, unknown>[] {
  return PERICIA_BASE.map(([Nome, Atributo]) => ({
    Nome,
    Atributo,
    Proficiencia: 'N',
    Bonus_Item: 0,
    Bonus_Especial: 0,
    Especializacao: '',
    Maestria: '',
    Incrementos: [],
  }))
}

/** 4 defesas + 2 sentidos base (defaultDefesas/defaultSentidos do plugin;
 *  nomes acentuados como o FM grava: Ímpeto/Percepção/Intuição). */
function defaultDefesasLista(): Record<string, unknown>[] {
  return [
    { Nome: 'Defesa', Atributo: 'AGI', Proficiencia: 'N', Bonus_Item: 0, Bonus_Especial: 0 },
    { Nome: 'Vigor', Atributo: 'FOR', Proficiencia: 'N', Bonus_Item: 0, Bonus_Especial: 0 },
    { Nome: 'Reflexo', Atributo: 'AGI', Proficiencia: 'N', Bonus_Item: 0, Bonus_Especial: 0 },
    { Nome: 'Ímpeto', Atributo: 'PRE', Proficiencia: 'N', Bonus_Item: 0, Bonus_Especial: 0 },
  ]
}
function defaultSentidosLista(): Record<string, unknown>[] {
  return [
    { Nome: 'Percepção', Atributo: 'INT', Proficiencia: 'N', Bonus_Item: 0, Bonus_Especial: 0 },
    { Nome: 'Intuição', Atributo: 'PRE', Proficiencia: 'N', Bonus_Item: 0, Bonus_Especial: 0 },
  ]
}
/** 3 ofícios base (defaultOficios do plugin — nomes SEM acento, com Complemento). */
function defaultOficiosLista(): Record<string, unknown>[] {
  return [
    { Nome: 'Oficio', Complemento: '', Atributo: 'INT', Proficiencia: 'N', Bonus_Item: 0, Bonus_Especial: 0, Incrementos: [] },
    { Nome: 'Atuacao', Complemento: '', Atributo: 'PRE', Proficiencia: 'N', Bonus_Item: 0, Bonus_Especial: 0, Incrementos: [] },
    { Nome: 'Conhecimento', Complemento: '', Atributo: 'INT', Proficiencia: 'N', Bonus_Item: 0, Bonus_Especial: 0, Incrementos: [] },
  ]
}
/** Estrutura de Magias: 4 escolas na primária, 3 na secundária (sem Tesouros),
 *  cada uma em rank N com Lista vazia — shape de serialize-to-fm.ts. Assim a aba
 *  MAGIAS computa Potência/EM/slots e oferece o catálogo de não-aprendidas
 *  quando uma regra concede slot (issue #56). */
function defaultMagias(): Record<string, unknown> {
  const escola = (Nome: string, Atributo: string) => ({
    Nome,
    Atributo,
    Proficiencia: 'N',
    Bonus_Item: 0,
    Bonus_Especial: 0,
    Lista: [],
  })
  return {
    Potencia: 0,
    EM: 0,
    Slots: { B: 0, A: 0, E: 0, M: 0 },
    Lista: [
      escola('Arcana Negra', 'INT'),
      escola('Arcana Branca', 'INT'),
      escola('Anima', 'PRE'),
      escola('Tesouros', ''),
    ],
    Secundaria: {
      Potencia: 0,
      EM: 0,
      Slots: { B: 0, A: 0, E: 0, M: 0 },
      Lista: [
        escola('Arcana Negra', 'INT'),
        escola('Arcana Branca', 'INT'),
        escola('Anima', 'PRE'),
      ],
    },
  }
}

function baseCreatureFm(): Record<string, unknown> {
  return {
    aliases: [],
    categoria: 'Criatura',
    subcategoria: '',
    grupo: [],
    Imagem: '',
    Classe: '',
    Sintonia: '',
    Tamanho: 'Médio',
    Vida: { Vitalidade: 0, Moral: 0 },
    Atributos: { Principal: 'FOR', FOR: 3, AGI: 2, INT: 1, PRE: 0 },
    Defesas_Resistencias: { Lista: defaultDefesasLista() },
    Sentidos: { Lista: defaultSentidosLista() },
    Movimento: { Lista: [{ Nome: 'Terrestre', Atributo: 'AGI', Bonus_Item: 0, Bonus_Especial: 0 }] },
    Pericias: { Slots: { A: 0, E: 0, M: 0 }, Lista: defaultPericiasLista() },
    Oficios: { Lista: defaultOficiosLista() },
    Habilidades: { Lista: [], Especiais: [] },
    Tecnicas: { Slots: { A: 0, E: 0, M: 0 }, Lista: [] },
    Magias: defaultMagias(),
    Acoes: { Lista: [] },
    Ataques: {
      Proficiencia: 'N',
      Lista: [
        { Nome: 'Manobras', Atributo: 'FOR', Bonus_Item: 0, Bonus_Especial: 0, Categoria: null, Propriedade: null, Fonte: 'Padrao' },
      ],
    },
    Inventario: {
      Ouro: 0,
      Armadura: {
        Nome: '',
        Categoria: '',
        Propriedade: '',
        Proficiencia: { Sem: 'N', Leve: 'N', Pesada: 'N' },
      },
      Escudo: { Nome: '', Dano: 0, Dureza: 0, Categoria: '', Propriedade: '', Proficiencia: 'N' },
      Tesouros: [],
      Tesouros_Especiais: '',
      Consumiveis: [],
      Armas: { Proficiencia: { Simples: 'N', Marciais: 'N', Especificas: [] }, Lista: [] },
    },
    Experiencia: { Marcas: [], Reconhecimentos: [] },
    Biografia: {
      Passado: '',
      Motivacao: '',
      Genero: '',
      Idade: '',
      Naturalidade: '',
      Altura: '',
      Peso: '',
      Ideais: [],
      Desprezos: [],
      Qualidades: [],
      Defeitos: [],
      Anotacoes: '',
    },
    Papel: { Lider: 0, Controlador: 0, Abatedor: 0, Vanguarda: 0 },
    Interativa: {
      Imunidades: {},
      Recursos_Restantes: {
        // Vitalidade/Moral/EM/EM_Secundaria AUSENTES de propósito: ficha nova
        // nasce CHEIA — o corrente cai no máximo (Vida.*/Magias.EM do derivedFm,
        // definidos pela classe) quando não está definido. Espelha o plugin
        // (frontmatter-extract-interativa.ts:36-66: `num(rec.EM) ?? model.magias.em`)
        // e a política já aplicada a Vitalidade/Moral. Gravar `EM: 0` fazia o
        // Combate/topbar lerem 0 explícito (fallback `?? emMax` só semeia o máximo
        // quando AUSENTE), mostrando "0/3" em vez de "3/3". Ao gastar EM/tomar
        // dano, o corrente passa a ser gravado e a barra rastreia o valor real.
        Moral_Temporaria: 0,
        Escudo_Dano: 0,
      },
      Condicoes_Ativas: {},
      Efeitos_Ativos: {},
      Usos_Recursos: {},
      Seletores: {},
    },
  }
}

/** Herói em branco — subcategoria Heroi + Nível 1 (mínimo sensato: tierFromLevel
 *  trata <1 como 1, nunca NaN). */
export function emptyHeroFrontmatter(): Record<string, unknown> {
  return { ...baseCreatureFm(), subcategoria: 'Heroi', Nível: 1 }
}

/** Companheiro Animal em branco — família CompanheiroAnimal do plugin (Tutor). */
export function emptyCompanheiroFrontmatter(nome: string): Record<string, unknown> {
  return {
    ...baseCreatureFm(),
    subcategoria: 'Companheiro Animal',
    Nível: 1,
    Tutor: '',
    nome,
  }
}

/** Monstro em branco — família Monstro do plugin: Tier em vez de Nível + Raça
 *  (espelha o FM real do Goblin Batedor: Vida só com Vitalidade). */
export function emptyMonstroFrontmatter(): Record<string, unknown> {
  const fm: Record<string, unknown> = { ...baseCreatureFm(), subcategoria: 'Monstro', Tier: 0, Raça: '' }
  fm.Vida = { Vitalidade: 0 }
  // Vitalidade corrente ausente → nasce cheia (default = máximo do derivedFm).
  fm.Interativa = { Imunidades: {}, Recursos_Restantes: {} }
  return fm
}

export const PESSOA_RELACOES = [
  'Neutro',
  'Amigo',
  'Inimigo',
  'Romance',
  'Família',
  'Conhecido',
  'Negócios',
] as const
export type PessoaRelacao = (typeof PESSOA_RELACOES)[number]

export interface PessoaFields {
  Nome: string
  Relação: string
  Organização: string
  Posição: string
  Detalhes: string
  /** Imagem própria (#200): referência pro store de imagens (images.ts) —
   *  o retrato do card resolve por ela (useCreaturePortrait lê FM ImgId). */
  ImgId?: string
}

/** Pessoa (NPC) — não é ficha de herói: guarda os campos do formulário do #45. */
export function pessoaFrontmatter(fields: Omit<PessoaFields, 'Nome'>): Record<string, unknown> {
  return {
    categoria: 'Criatura',
    subcategoria: 'Pessoa',
    grupo: null,
    Relação: fields.Relação,
    Organização: fields.Organização,
    Posição: fields.Posição,
    Detalhes: fields.Detalhes,
    ...(fields.ImgId ? { ImgId: fields.ImgId } : {}),
  }
}

/** Grupo local em branco — FM mínimo espelhando um doc de Grupo real. */
export function emptyGroupFrontmatter(): Record<string, unknown> {
  return { aliases: null, categoria: 'Grupo', subcategoria: 'Aventureiros', grupo: null }
}

/* ===================== CRUD de entidade ===================== */

export function createLocalEntity(
  kind: LocalKind,
  basename: string,
  frontmatter: Record<string, unknown>,
  // Import (#205) restaura a entidade INTEIRA (session/extras do arquivo
  // exportado) — criação normal segue sem o parâmetro.
  opts?: { session?: Record<string, unknown>; extras?: Record<string, unknown> },
): string {
  const info = KIND_INFO[kind]
  const id = `${LOCAL_PREFIX}${kind}:${randomId()}`
  const rec: StoredEntity = {
    id,
    kind,
    type: info.type,
    subtype: info.subtype,
    basename,
    frontmatter,
    session: opts?.session ?? {},
    extras: opts?.extras ?? {},
  }
  hydrateEntities().set(id, rec)
  persistEntities()
  bump()
  return id
}

export function getLocalEntity(id: string): StoredEntity | undefined {
  return hydrateEntities().get(id)
}

/** Todas as entidades de uma família (pra mesclar nas listas). */
export function localEntitiesOfKind(kind: LocalKind): StoredEntity[] {
  return [...hydrateEntities().values()].filter((r) => r.kind === kind)
}

function replaceEntity(id: string, next: StoredEntity): void {
  hydrateEntities().set(id, next)
  persistEntities()
  bump()
}

/** Renomeia (nome editável do grupo/entidade). */
export function setLocalEntityBasename(id: string, basename: string): void {
  const rec = getLocalEntity(id)
  if (!rec) return
  replaceEntity(id, { ...rec, basename })
}

/** Grava um path do FM local NA HORA (write-through; sem overlay). */
export function setLocalEntityFm(id: string, path: string, value: unknown): void {
  const rec = getLocalEntity(id)
  if (!rec) return
  const frontmatter = deepSet(rec.frontmatter, path.split('.'), value)
  // #218: o basename espelha o NOME exibido (regra do plugin: FM nome, senão
  // basename) — renomear no PERFIL reflete nas listas/seletores/exports, que
  // leem basename. Nome vazio mantém o basename anterior (fallback).
  const basename =
    path === 'nome' && typeof value === 'string' && value.trim() ? value.trim() : rec.basename
  replaceEntity(id, { ...rec, frontmatter, basename })
}

export function getLocalEntitySession(id: string): Record<string, unknown> {
  return getLocalEntity(id)?.session ?? {}
}
export function setLocalEntitySession(id: string, path: string, value: unknown): void {
  const rec = getLocalEntity(id)
  if (!rec) return
  replaceEntity(id, { ...rec, session: { ...rec.session, [path]: value } })
}

export function getLocalEntityExtras(id: string): { armas: string[]; tesouros: string[] } {
  const extras = getLocalEntity(id)?.extras ?? {}
  const list = (k: string) => (Array.isArray(extras[k]) ? (extras[k] as string[]) : [])
  return { armas: list('armas'), tesouros: list('tesouros') }
}
export function setLocalEntityExtras(id: string, key: 'armas' | 'tesouros', list: string[]): void {
  const rec = getLocalEntity(id)
  if (!rec) return
  replaceEntity(id, { ...rec, extras: { ...rec.extras, [key]: list } })
}

export function removeLocalEntity(id: string): void {
  const map = hydrateEntities()
  if (!map.delete(id)) return
  persistEntities()
  bump()
}

/* ===================== entidade ⇢ doc/entry ===================== */

/** Campos da Pessoa expostos como inline fields → DocView os renderiza na
 *  tabela existente (InlineFieldsTable) sem tocar o DocPage. */
function pessoaInlineFields(rec: StoredEntity): Record<string, string> {
  const fm = rec.frontmatter
  const out: Record<string, string> = {}
  for (const key of ['Relação', 'Organização', 'Posição', 'Detalhes']) {
    const v = fm[key]
    if (typeof v === 'string' && v.trim()) out[key] = v
  }
  return out
}

// Cache por identidade do registro: como toda mutação cria um rec NOVO
// (updates imutáveis), o doc só é reconstruído quando a entidade muda —
// mantém a referência estável entre renders (deps de useMemo/useEffect).
const docCache = new WeakMap<StoredEntity, VaultDoc>()

function buildDoc(rec: StoredEntity): VaultDoc {
  const grupo = rec.frontmatter['grupo']
  return {
    id: rec.id,
    path: rec.id,
    basename: rec.basename,
    type: rec.type,
    subtype: rec.subtype,
    grupo: (Array.isArray(grupo) || typeof grupo === 'string' ? grupo : null) as
      | string
      | string[]
      | null,
    frontmatter: rec.frontmatter,
    inlineFields: rec.kind === 'Pessoa' ? pessoaInlineFields(rec) : {},
    ruleElements: [],
    links: [],
    images: [],
    headings: [],
    body: '',
  }
}

/** Doc (formato VaultDoc) de uma entidade local, ou undefined se não existe. */
export function getLocalDoc(id: string): VaultDoc | undefined {
  const rec = getLocalEntity(id)
  if (!rec) return undefined
  let doc = docCache.get(rec)
  if (!doc) {
    doc = buildDoc(rec)
    docCache.set(rec, doc)
  }
  return doc
}

/** Doc local por BASENAME (#206) — contraparte do resolve do catálogo pras
 *  entidades criadas no app (o Tutor de um CA local geralmente é um herói
 *  local, referenciado por wikilink "[[Nome]]"). Basename duplicado entre
 *  entidades locais fica com a primeira (mesma regra de ambiguidade do
 *  catálogo: nunca chutar entre docs distintos, ordenação de inserção). */
export function localDocByBasename(basename: string): VaultDoc | undefined {
  for (const rec of hydrateEntities().values()) {
    if (rec.basename === basename) return getLocalDoc(rec.id)
  }
  return undefined
}

/** IndexDocEntry sintético (mesma forma dos entries do índice) pra listas. */
export function syntheticEntry(rec: StoredEntity): IndexDocEntry {
  const grupo = rec.frontmatter['grupo']
  return {
    id: rec.id,
    path: rec.id,
    basename: rec.basename,
    type: rec.type,
    subtype: rec.subtype,
    grupo: (Array.isArray(grupo) || typeof grupo === 'string' ? grupo : null) as
      | string
      | string[]
      | null,
    kind: 'content',
  }
}

/** Entries locais de uma família (pra mesclar nas listas das telas). */
export function localEntriesOfKind(kind: LocalKind): IndexDocEntry[] {
  return localEntitiesOfKind(kind).map(syntheticEntry)
}

/* ===================== membership (issue #44) ===================== */

function getMembership(groupId: string): Membership {
  return hydrateMembership().get(groupId) ?? { add: [], remove: [] }
}

/** Base de integrantes (sem override): grupo da vault → member-resolver do
 *  plugin (FM.grupo); grupo local → vazio (a lista vive no override `add`). */
export function groupBaseMemberIds(catalog: Catalog, groupId: string): string[] {
  if (isLocalId(groupId)) return []
  return groupMembers(catalog, groupId).map((e) => e.id)
}

function memberEntry(catalog: Catalog, id: string): IndexDocEntry | null {
  if (isLocalId(id)) {
    const rec = getLocalEntity(id)
    return rec ? syntheticEntry(rec) : null
  }
  return catalog.entryById.get(id) ?? null
}

/** Integrantes finais = (base ∪ add) \ remove, resolvidos a entries (catálogo
 *  + locais). Ordem: base primeiro, adicionados depois. Reativo via os stores;
 *  balanceamento/agregados recomputam porque os callers observam a versão. */
export function resolveGroupMembers(catalog: Catalog, groupId: string): IndexDocEntry[] {
  // #231: o grupo da MESA resolve os integrantes da SALA viva — entries
  // sintéticos `sessao:<charId>` que o useDoc/useDocs materializa via
  // synthDocFromCharacter (mesmos canos do resto do GrupoView).
  if (groupId === MESA_GRUPO_ID) {
    const live = getLiveSession()
    return (live?.characters ?? [])
      .filter((c) => c.kind !== 'npc')
      .map((c) => ({
        id: `sessao:${c.id}`,
        path: c.characterPath,
        basename: c.summary.nome,
        type: 'Criatura',
        subtype: c.summary.family === 'CompanheiroAnimal' ? 'Companheiro Animal' : c.summary.family,
        kind: 'content',
      }) as IndexDocEntry)
  }
  const baseIds = groupBaseMemberIds(catalog, groupId)
  const { add, remove } = getMembership(groupId)
  const removeSet = new Set(remove)
  const ids: string[] = []
  const seen = new Set<string>()
  for (const id of [...baseIds, ...add]) {
    if (removeSet.has(id) || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids.map((id) => memberEntry(catalog, id)).filter((e): e is IndexDocEntry => e !== null)
}

/** Hook reativo dos integrantes de um grupo (uma chamada por render — GrupoView). */
export function useGroupMembers(catalog: Catalog, groupId: string): IndexDocEntry[] {
  const v = useLocalStoreVersion()
  const live = useLiveSession() // #231: mesa reage à sala
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => resolveGroupMembers(catalog, groupId), [catalog, groupId, v, live])
}

/** Inclui/remove um integrante no override do grupo, normalizando contra a base:
 *  incluir membro da base só limpa um remove; excluir membro da base grava um
 *  remove; incluir fora da base grava um add; excluir fora da base limpa o add. */
export function setGroupMember(
  groupId: string,
  memberId: string,
  include: boolean,
  baseIds: string[],
): void {
  const inBase = baseIds.includes(memberId)
  const cur = getMembership(groupId)
  const add = cur.add.filter((x) => x !== memberId)
  const remove = cur.remove.filter((x) => x !== memberId)
  if (include && !inBase) add.push(memberId)
  if (!include && inBase) remove.push(memberId)
  hydrateMembership().set(groupId, { add, remove })
  persistMembership()
  bump()
}

/** Criaturas disponíveis pro seletor de integrantes (#44): Criaturas do catálogo
 *  + criaturas locais (heróis/CAs/monstros; Pessoas não entram em grupo). */
export function availableMemberEntries(catalog: Catalog): IndexDocEntry[] {
  const vault = catalog.content.filter((e) => e.type === 'Criatura')
  const local = [...hydrateEntities().values()]
    .filter((r) => r.type === 'Criatura' && r.subtype !== 'Pessoa')
    .map(syntheticEntry)
  return [...vault, ...local]
}

/* ===================== testes ===================== */

/** SÓ testes: zera a memória (não o localStorage) — simula reload da página. */
export function __resetLocalStoreForTests(): void {
  entities = null
  membership = null
  version = 0
  listeners.clear()
}

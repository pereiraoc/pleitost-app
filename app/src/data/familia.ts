// FAMÍLIA DA FICHA (issue #201) — porta o delta CompanheiroAnimal↔Heroi do
// plugin pleitost-autosheet pro app. PRINCÍPIO ARQUITETURAL: a família decide
// o delta NUM PONTO CENTRAL (este módulo, espelho de types/family.ts +
// data/family-compat.ts + data/family-pericias.ts do plugin); as abas da
// ficha LEEM os flags de `FICHA_FAMILIA` — nunca `if (subcategoria === X)`
// inventado em call-site.
//
// Fonte de verdade do delta (plugin pleitost-autosheet, src/):
//   - render/tabs/ca/tab-completa.ts — a ficha Editável do CA: Perfil (Tipo/
//     Tutor/Sintonia/Nível/Atributos) + Vida, Perícias (só 6), Defesas +
//     Sentidos, Combate (armas naturais) + Movimentos, Habilidades, Ações e
//     Tesouros (só 3 permitidos). SEM Passado/Biografia, Ofícios,
//     Especializações, Técnicas, Magias, Equipamentos/proficiências, Moedas,
//     Consumíveis, Anotações ou Experiência.
//   - render/modes/interativa/mount-interativa.ts:534/574/785/897 — abas e
//     clusters por família (CA: só Recursos; sem Anotações/Moedas/Extras;
//     showMagias só Heroi).
//   - render/modes/interativa/tabs/tab-inventario.ts:126-128 — Consumíveis/
//     Moedas escondidos fora de Heroi.
//   - render/modes/leitura/sections/especializacoes-block.ts:11 — só Heroi.
//   - render/groups/biografia-card.ts:20 — biografia só Heroi.
//   - render/groups/perfil-card.ts:315-342 — CA mostra Tipo/Tutor/Nível.
//   - extract/sync-ca-tutor-nivel.ts — nível do CA é satélite do tutor.
import type { VaultDoc } from './types'

/** Famílias canônicas das fichas — VERBATIM do plugin types/family.ts:4. */
export type SheetFamily = 'Heroi' | 'Monstro' | 'CompanheiroAnimal'

/** `fm.subcategoria` → família — espelho de resolveFamilyFromFrontmatter do
 *  plugin (data/family-compat.ts:6-13), incluindo o shim legado "Jogador". */
export function resolveFamilyFromFrontmatter(fm: Record<string, unknown>): SheetFamily | null {
  const raw = String(fm['subcategoria'] ?? '').trim()
  if (raw === 'Heroi' || raw === 'Herói') return 'Heroi'
  if (raw === 'Jogador') return 'Heroi' // legado pré-v0.9.0
  if (raw === 'Monstro') return 'Monstro'
  if (raw === 'Companheiro Animal') return 'CompanheiroAnimal'
  return null
}

/** Path → família — espelho de resolveFamilyFromPath (family-compat.ts:15-26). */
export function resolveFamilyFromPath(filePath: string): SheetFamily | null {
  if (/\/(Criaturas?|Templates?)\/Her[óo]is?\//i.test(filePath)) return 'Heroi'
  if (/\/(Criaturas?|Templates?)\/Jogadores?\//i.test(filePath)) return 'Heroi'
  if (/\/(Criaturas?|Templates?)\/(Monstro|Bestiário)\//i.test(filePath)) return 'Monstro'
  if (/\/(Criaturas?|Templates?)\/Companheiros? Anima(l|is)\//i.test(filePath)) {
    return 'CompanheiroAnimal'
  }
  return null
}

/** FM → path → default Heroi — espelho de resolveFamily (family-compat.ts:28-36). */
export function resolveFamily(fm: Record<string, unknown>, filePath: string): SheetFamily {
  return resolveFamilyFromFrontmatter(fm) ?? resolveFamilyFromPath(filePath) ?? 'Heroi'
}

/** Família de um doc da ficha (vault OU entidade local — ids locais têm
 *  subcategoria no FM desde a criação, local-entities.ts). */
export function familiaOf(doc: VaultDoc): SheetFamily {
  return resolveFamily((doc.frontmatter ?? {}) as Record<string, unknown>, doc.path ?? '')
}

/** Perícias do CA (slugs NFD, chaves do registro `pericia` do plugin) —
 *  VERBATIM de CA_PERICIAS (plugin data/family-pericias.ts:9-16). */
export const CA_PERICIAS: readonly string[] = [
  'Atletismo',
  'Acrobacia',
  'Furtividade',
  'Sobrevivencia',
  'Enganacao',
  'Intimidacao',
]

/** A família possui a perícia? `slug` = slugify(Nome) (registry.slugify, o
 *  slug NFD do plugin util/display-names.ts) — espelho de periciasForFamily
 *  (family-pericias.ts:18-20): CA usa a whitelist, o resto tem todas. */
export function familiaTemPericia(familia: SheetFamily, slug: string): boolean {
  return familia !== 'CompanheiroAnimal' || CA_PERICIAS.includes(slug)
}

/** Tesouros que o CA pode equipar (regra do sistema) — VERBATIM de
 *  CA_TESOUROS_PERMITIDOS (plugin render/tabs/ca/tab-completa.ts:33-37). */
export const CA_TESOUROS_PERMITIDOS: ReadonlySet<string> = new Set([
  'Anel do Equilíbrio',
  'Anel da Resistência',
  'Pulseira da Potência',
])

/** O que a ficha de cada família mostra — projeção declarativa dos gates que
 *  o plugin espalha por seção (fontes no cabeçalho deste módulo). */
export interface FichaFamilia {
  /** Campo Tutor no Perfil (perfil-card.ts:333-342; header-ca.ts). */
  tutor: boolean
  /** Campo de classe no Editável: Heroi edita "Classe" com dropdown de
   *  classes (perfil-card.ts:398+); CA mostra "Tipo" estático (perfil-
   *  card.ts:322-331). O rótulo é chave do registro tokens.emojis.perfil. */
  classe: { rotulo: 'Classe' | 'Tipo'; editavel: boolean }
  /** Nível satélite do tutor (extract/sync-ca-tutor-nivel.ts): o nível exibido
   *  vem do tutor e NÃO é editável na ficha. */
  nivelDoTutor: boolean
  /** Biografia/Passado/Apelido (biografia-card.ts:20 — só Heroi). */
  biografia: boolean
  /** Banner/registro de classe de aventureiro + Experiência (aventureiro-card
   *  e cluster Extras/experiência — tabs/heroi/tab-perfil.ts;
   *  mount-interativa.ts:574: CA não tem cluster Extras). */
  experiencia: boolean
  /** Aba Anotações (mount-interativa.ts:897 — CA fica só com Recursos). */
  anotacoes: boolean
  /** Seção Ofícios (ausente em tabs/ca/tab-completa.ts). */
  oficios: boolean
  /** Seção Especializações (leitura/sections/especializacoes-block.ts:11). */
  especializacoes: boolean
  /** Seção Técnicas (ausente em tabs/ca/tab-completa.ts). */
  tecnicas: boolean
  /** Magias/EM/invocações (mount-interativa.ts:785 showMagias = Heroi;
   *  leitura/sections/magias-block.ts:27). */
  magias: boolean
  /** Card de proficiências de equipamento + pickers de armadura/escudo
   *  (CA usa Armadura Natural — interativa/panel/sections/defesa.ts:58-64;
   *  tab-completa do CA não tem card Equipamentos). */
  equipamentos: boolean
  /** Moedas/Tesouros Especiais (tab-inventario.ts:126-128 — só Heroi). */
  moedas: boolean
  /** Consumíveis (tab-inventario.ts:126 — só Heroi). */
  consumiveis: boolean
  /** Whitelist de perícias (null = todas as 13) — family-pericias.ts. */
  pericias: readonly string[] | null
  /** Tesouros equipáveis (null = todos) — tabs/ca/tab-completa.ts:33-43. */
  tesourosPermitidos: ReadonlySet<string> | null
}

const HEROI_FICHA: FichaFamilia = {
  tutor: false,
  classe: { rotulo: 'Classe', editavel: true },
  nivelDoTutor: false,
  biografia: true,
  experiencia: true,
  anotacoes: true,
  oficios: true,
  especializacoes: true,
  tecnicas: true,
  magias: true,
  equipamentos: true,
  moedas: true,
  consumiveis: true,
  pericias: null,
  tesourosPermitidos: null,
}

export const FICHA_FAMILIA: Record<SheetFamily, FichaFamilia> = {
  Heroi: HEROI_FICHA,
  // Monstro tem delta próprio no plugin (tabs/monstro/tab-completa.ts) — fora
  // do escopo do #201 (CA); mantém o comportamento atual do app (ficha cheia)
  // até a issue do Monstro portar o delta dele.
  Monstro: HEROI_FICHA,
  CompanheiroAnimal: {
    tutor: true,
    classe: { rotulo: 'Tipo', editavel: false },
    nivelDoTutor: true,
    biografia: false,
    experiencia: false,
    anotacoes: false,
    oficios: false,
    especializacoes: false,
    tecnicas: false,
    magias: false,
    equipamentos: false,
    moedas: false,
    consumiveis: false,
    pericias: CA_PERICIAS,
    tesourosPermitidos: CA_TESOUROS_PERMITIDOS,
  },
}

/** Caps da ficha de um doc — atalho familiaOf → FICHA_FAMILIA. */
export function fichaFamiliaOf(doc: VaultDoc): FichaFamilia {
  return FICHA_FAMILIA[familiaOf(doc)]
}

/** Aba da ficha (CHAR_TABS/?tab=) visível pra família? Único gate de abas —
 *  AppShell (sidebar) e FichaPage (rota) consomem o MESMO predicado. */
export function abaFichaVisivel(familia: SheetFamily, tabId: string): boolean {
  if (tabId === 'anotacoes') return FICHA_FAMILIA[familia].anotacoes
  return true
}

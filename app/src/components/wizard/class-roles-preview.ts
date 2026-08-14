// PREVIEW DE PAPÉIS por classe/subclasse no wizard (#461 item 2) — módulo PURO.
//
// Fonte de verdade: o bloco ```class-roles``` no INÍCIO de cada nota de classe
// (parser existente markdown/class-roles/parse.ts; cor/descrição no ROLE_META).
// Cada build é `[nome, {Papel: estrelas}]` — ex.: Arcanista tem
// ["Espiritualista", {Líder:3}] / ["Bruxo", {Controlador:3}]; o Monge varia por
// SINTONIA: ["Monge (Água)", {Vanguarda:2, Controlador:1}]…
//
// Política de match (exposta pra teste):
//  - barra da CLASSE fechada → UNIÃO MÁXIMA dos builds (as possibilidades);
//  - barra de OPÇÃO de subclasse → builds cujo nome contém o rótulo da opção,
//    refinados pelos rótulos das OUTRAS escolhas já feitas (Bardo: 2 dimensões);
//  - classe SEM subclasse → build casada pela SINTONIA curta ("Água" casa
//    "Monge (Água)" e "Fogo" casa "Monge (Fogo/Terra)"); classe de build único
//    (Mago) usa o próprio.
//  Sem match → união máxima (nunca esconde as possibilidades).
import { parseClassRolesSource, type Build } from '../../markdown/class-roles/parse'
import type { RoleName } from '../../markdown/class-roles/role-meta'

const FENCE_RE = /```class-roles\s*\n([\s\S]*?)```/

/** Builds do bloco class-roles do CORPO da nota (vazio se ausente/inválido). */
export function buildsDoCorpo(body: string): Build[] {
  const m = FENCE_RE.exec(body ?? '')
  if (!m) return []
  try {
    return parseClassRolesSource(m[1]!)
  } catch {
    return []
  }
}

/** União MÁXIMA por papel — o teto de estrelas que a classe alcança em cada. */
export function uniaoMaxima(builds: Build[]): Partial<Record<RoleName, number>> {
  const out: Partial<Record<RoleName, number>> = {}
  for (const [, roles] of builds) {
    for (const [role, valor] of Object.entries(roles) as [RoleName, number][]) {
      out[role] = Math.max(out[role] ?? 0, valor)
    }
  }
  return out
}

const contem = (nome: string, texto: string) =>
  nome.toLowerCase().includes(texto.trim().toLowerCase())
const contemAlgum = (nome: string, textos: string[]) =>
  textos.some((t) => t.trim() && contem(nome, t))

/** Aliases de classe COMPOSTOS pelos elementos de regra de uma nota
 *  (`Alias Classe Compor N "X"`) — é assim que os builds do class-roles nomeiam
 *  as variantes (ex.: a opção "Estudos do Vazio" compõe "Bruxo"). */
export function aliasesDeCompose(ruleElements: unknown): string[] {
  const lista = Array.isArray(ruleElements) ? ruleElements : []
  const out: string[] = []
  for (const el of lista) {
    const m = /Alias\s+Classe\s+Compor\s+\d+\s+"([^"]+)"/i.exec(String(el))
    if (m) out.push(m[1]!)
  }
  return out
}

/**
 * Papéis previstos pra UMA opção de subclasse: builds cujo nome contém ALGUM
 * dos textos da opção (rótulo + aliases de Compor da nota dela); se as OUTRAS
 * escolhas têm pick, refina exigindo os textos delas (casa a variante exata do
 * Bardo). 1 build → estrelas dela; vários → união máxima; nenhum → null.
 */
export function papeisDaOpcao(
  builds: Build[],
  textosDaOpcao: string[],
  textosOutrasEscolhas: string[][],
): Partial<Record<RoleName, number>> | null {
  let candidatos = builds.filter(([nome]) => contemAlgum(nome, textosDaOpcao))
  if (!candidatos.length) return null
  for (const outro of textosOutrasEscolhas) {
    const refinado = candidatos.filter(([nome]) => contemAlgum(nome, outro))
    if (refinado.length) candidatos = refinado
  }
  return candidatos.length === 1 ? candidatos[0]![1] : uniaoMaxima(candidatos)
}

/**
 * Papéis da CLASSE SEM subclasse "considerando a sintonia" (#461: Monge) —
 * casa a sintonia curta no nome do build; classe de build único (Mago) usa o
 * próprio; sem match → união máxima.
 */
export function papeisDaClasseSemSubclasse(
  builds: Build[],
  sintoniaCurta: string,
): Partial<Record<RoleName, number>> {
  if (builds.length === 1) return builds[0]![1]
  if (sintoniaCurta) {
    const match = builds.find(([nome]) => contem(nome, sintoniaCurta))
    if (match) return match[1]
  }
  return uniaoMaxima(builds)
}

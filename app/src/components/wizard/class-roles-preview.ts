// PREVIEW DE PAPÉIS por classe/subclasse no wizard (#461/#452 r4) — módulo PURO.
//
// Fontes de verdade:
//  - bloco ```class-roles``` no INÍCIO da nota de classe (parser existente
//    markdown/class-roles/parse.ts) — os TOTAIS de cada variante/build;
//  - elementos de regra `Somar Papel.<Id> <N>` — o que a CLASSE (base) e cada
//    OPÇÃO de subclasse ADICIONAM ("+★" das barras);
//  - `Alias Classe Compor` — como os builds nomeiam as variantes ("Estudos do
//    Vazio" compõe "Bruxo"), usado no HIGHLIGHT da possibilidade atual.
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


const contem = (nome: string, texto: string) =>
  nome.toLowerCase().includes(texto.trim().toLowerCase())
const contemAlgum = (nome: string, textos: string[]) =>
  textos.some((t) => t.trim() && contem(nome, t))

/** NFD-strip local (espelho do strip de grupo/party.ts) pro match de slug. */
const semAcento = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Slug ASCII do FM.Papel → RoleName acentuado (chaves do ROLE_META). */
const ROLE_POR_SLUG = new Map<string, RoleName>(
  (['Líder', 'Vanguarda', 'Abatedor', 'Controlador'] as RoleName[]).map((n) => [semAcento(n), n]),
)

/**
 * O que uma nota ADICIONA de papéis (#452 r4): parse dos elementos de regra
 * `Somar Papel.<Id> <N>` — a classe soma a base (Bardo: Lider 1) e cada opção
 * de subclasse soma o resto (Método Manipulador: Controlador 1). É o "+★" das
 * barras; os TOTAIS continuam sendo os builds do class-roles.
 */
export function somaPapeis(ruleElements: unknown): Partial<Record<RoleName, number>> {
  const lista = Array.isArray(ruleElements) ? ruleElements : []
  const out: Partial<Record<RoleName, number>> = {}
  for (const el of lista) {
    const texto = String(el)
    // Só o INCONDICIONAL: o Monge tem `Condicional Sintonia,[[X]] Somar
    // Papel.Y 1` por sintonia — somar tudo inflaria o "+" (a variante já
    // aparece nas possibilidades/highlight).
    if (/Condicional/i.test(texto)) continue
    const m = /Somar\s+Papel\.([A-Za-zÀ-ÿ]+)\s+(\d+)/i.exec(texto)
    if (!m) continue
    const role = ROLE_POR_SLUG.get(semAcento(m[1]!))
    if (role) out[role] = (out[role] ?? 0) + Number(m[2])
  }
  return out
}

/**
 * Somas CONDICIONAIS por sintonia (#452 r9): `Condicional Sintonia,[[X]] Somar
 * Papel.<Id> <N>` no doc da CLASSE — o que cada sintonia adiciona de papéis
 * pra esta classe (Monge/Animista). Chave = TARGET do wikilink da condição
 * ("Traço Elemental da Água"). Vazio pra classes sem condicionais (Mago).
 */
export function somaPapeisPorSintonia(
  ruleElements: unknown,
): Map<string, Partial<Record<RoleName, number>>> {
  const lista = Array.isArray(ruleElements) ? ruleElements : []
  const out = new Map<string, Partial<Record<RoleName, number>>>()
  for (const el of lista) {
    const m =
      /Condicional\s+Sintonia\s*,\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s+Somar\s+Papel\.([A-Za-zÀ-ÿ]+)\s+(\d+)/i.exec(
        String(el),
      )
    if (!m) continue
    const role = ROLE_POR_SLUG.get(semAcento(m[2]!))
    if (!role) continue
    const alvo = m[1]!.trim()
    const soma = out.get(alvo) ?? {}
    soma[role] = (soma[role] ?? 0) + Number(m[3])
    out.set(alvo, soma)
  }
  return out
}

/**
 * Índices dos builds compatíveis com o que JÁ está definido (#452 r4 —
 * highlight da possibilidade atual): cada grupo de textos (pick de uma escolha
 * com seus aliases, ou a sintonia curta) precisa casar no nome do build.
 * Grupos vazios são ignorados; sem grupo válido → [] (nada destacado).
 *
 * Report 2026-08-16 (Druida): escolha que NÃO aparece em NENHUM build (o
 * Círculo Druídico não muda papel — os builds são "Druida Guardião"/"Druida
 * Xamã") não pode zerar o highlight — grupo que não casa com build algum não
 * discrimina nada e é IGNORADO.
 */
export function indicesDoBuildAtual(builds: Build[], grupos: string[][]): number[] {
  const validos = grupos
    .filter((g) => g.some((t) => t.trim()))
    .filter((g) => builds.some(([nome]) => contemAlgum(nome, g)))
  if (!validos.length) return []
  const out: number[] = []
  builds.forEach(([nome], i) => {
    if (validos.every((g) => contemAlgum(nome, g))) out.push(i)
  })
  return out
}

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




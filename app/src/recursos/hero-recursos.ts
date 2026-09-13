// Estado de RECURSOS do herói + operações PURAS (sem React). O estado vive no
// FM salvo local do herói (`Recursos_do_Mundo`, gravado inteiro via
// model.set/writeHero) e o saldo em `Inventario.Ouro` (PO INTEIRO — a ficha
// conta em milhares: Cz$ 1.000 = 1). Toda compra converte a moeda do mundo
// em unidades da ficha arredondando PRA CIMA ao milhar; nada fracionário.
//
// v3 (2026-09-08): o CUSTO DE VIDA são três PLANOS mensais pagos adiantado
// (plano TRI de transporte, moradia alugada sem posse, padrão de alimentação)
// — notas `Tipo = cfg.tipos.estilo`, uma por classe — mais a MANUTENÇÃO
// mensal do que se tem de posse (carro, imóvel), definida na nota do item.
// Nada avulso se controla aqui (sem saldo de TRI, sem estoque de comida).
//
// v4 (2026-09-08): o mês se paga NA ENTRADA — `abrirMes` cobra os planos, a
// manutenção da posse e a parcela das dívidas antes de o mês contar, e é onde
// os veículos rolam o d6 de pane. Um eixo pode ser PAGO POR TERCEIRO (regalia
// de classe): aparece na ficha e não sai do saldo. EMPRÉSTIMO é uma lógica só
// (notas `Tipo = cfg.tipos.emprestimo`): principal vira dívida, todo mês juros
// sobre o saldo mais um décimo do principal, amortização livre. Regra em
// `Custo de Vida` na vault — nada aqui é número inventado.
import { rngDe } from './ofertas'
import type { Papel, Recurso, RecursosCfg } from './types'

export const RECURSOS_FM = 'Recursos_do_Mundo'
export const OURO_FM = 'Inventario.Ouro'

export const PAPEIS: Papel[] = ['moradia', 'transporte', 'alimentacao']

export interface ItemTido {
  nome: string
  /** aba (subcategoria) da nota — a ficha lista a posse dentro do eixo. */
  aba: string
  qtd: number
  estado?: 'novo' | 'usado'
  /** Quanto pagou por unidade (moeda do mundo) — a venda devolve metade. */
  pago: number
  /** Cedido por terceiro (regalia de classe): não paga manutenção nem vende —
   *  o carro é da firma, e é a firma que o mantém. */
  pagoPor?: string
  /** O DISFARCE (2026-09-13): posse do herói REGISTRADA em nome de outro (a
   *  facção, o Círculo, o pelotão). Ele usa e mantém, mas escapa do imposto
   *  pagando a `disfarce.fracao` a quem segura — e o bem deixa de ser dele:
   *  não conta como patrimônio e não se vende. */
  emNomeDe?: string
  /** Como entrou na ficha. Ausente = comprada, que é todo item salvo até
   *  2026-09-13. A posta à mão não devolve dinheiro na venda: não entrou. */
  origem?: 'manual'
  /** Em pane NESTE mês (rolado ao abrir o mês); consertar custa em dobro. */
  pane?: boolean
}
/** Dívida contraída numa fonte de crédito (nota `Tipo = cfg.tipos.emprestimo`). */
export interface Divida {
  /** Nome da nota da fonte. */
  fonte: string
  /** Principal original — a amortização mínima é um décimo dele. */
  principal: number
  /** Saldo devedor (moeda do mundo). */
  saldo: number
}
/** O que a REGALIA da classe põe no mês. O cálculo mora em `concessoes.ts`;
 *  aqui só se aplica. Opcional em toda API: ausente = o comportamento de antes
 *  de 2026-09-13, bit a bit. */
export interface RegaliaAtiva {
  pisos: Partial<Record<Papel, { plano: Recurso; quem: string }>>
  posse: ItemTido[]
  renda: number
}

export interface RecursosDoHeroi {
  /** Plano (nome da nota) escolhido em cada eixo; null = classe 1 sem plano. */
  estilos: Record<Papel, string | null>
  /** Eixos cujo PLANO é pago por terceiro (regalia): papel → quem paga. */
  pagoPor: Partial<Record<Papel, string>>
  /** Posse: veículos, imóveis e afins (Cobrança única). */
  itens: ItemTido[]
  dividas: Divida[]
  /** Meses já abertos — conta o calendário e semeia o d6 de pane. */
  mes: number
}

export const RECURSOS_VAZIO: RecursosDoHeroi = {
  estilos: { transporte: null, moradia: null, alimentacao: null },
  pagoPor: {},
  itens: [],
  dividas: [],
  mes: 0,
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null
}

/** Lê o bloco do FM salvo (tolerante a ausência/lixo/versões anteriores). */
export function recursosDoFm(fm: Record<string, unknown>): RecursosDoHeroi {
  const raw = fm[RECURSOS_FM]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return RECURSOS_VAZIO
  const r = raw as Record<string, unknown>
  const est = r.estilos && typeof r.estilos === 'object' ? (r.estilos as Record<string, unknown>) : {}
  const itens = Array.isArray(r.itens)
    ? (r.itens as unknown[])
        .map((v) => {
          if (!v || typeof v !== 'object') return null
          const o = v as Record<string, unknown>
          const nome = str(o.nome)
          const aba = str(o.aba)
          if (!nome || !aba) return null
          const it: ItemTido = { nome, aba, qtd: Math.max(0, Math.round(num(o.qtd) || 1)), pago: Math.max(0, Math.round(num(o.pago))) }
          if (o.estado === 'novo' || o.estado === 'usado') it.estado = o.estado
          const quem = str(o.pagoPor)
          if (quem) it.pagoPor = quem
          const nomeDe = str(o.emNomeDe)
          if (nomeDe) it.emNomeDe = nomeDe
          if (o.origem === 'manual') it.origem = 'manual'
          if (o.pane === true) it.pane = true
          return it
        })
        .filter((v): v is ItemTido => v !== null && v.qtd > 0)
    : []
  const pp = r.pagoPor && typeof r.pagoPor === 'object' ? (r.pagoPor as Record<string, unknown>) : {}
  const pagoPor: Partial<Record<Papel, string>> = {}
  for (const papel of PAPEIS) {
    const quem = str(pp[papel])
    if (quem) pagoPor[papel] = quem
  }
  const dividas = Array.isArray(r.dividas)
    ? (r.dividas as unknown[])
        .map((v) => {
          if (!v || typeof v !== 'object') return null
          const o = v as Record<string, unknown>
          const fonte = str(o.fonte)
          const principal = Math.max(0, Math.round(num(o.principal)))
          const saldo = Math.max(0, Math.round(num(o.saldo)))
          return fonte && principal > 0 && saldo > 0 ? { fonte, principal, saldo } : null
        })
        .filter((v): v is Divida => v !== null)
    : []
  return {
    estilos: { transporte: str(est.transporte), moradia: str(est.moradia), alimentacao: str(est.alimentacao) },
    pagoPor,
    itens,
    dividas,
    mes: Math.max(0, Math.round(num(r.mes))),
  }
}

/* ─────────────────────────── config ─────────────────────────── */

export function papelDaAba(cfg: RecursosCfg, aba: string): Papel | null {
  return cfg.abas.find((a) => a.nome === aba)?.papel ?? null
}
export function abaDoPapel(cfg: RecursosCfg, papel: Papel): string | null {
  return cfg.abas.find((a) => a.papel === papel)?.nome ?? null
}
/** Nome do degrau NO EIXO (índice 0 = Nível 1). Desde 2026-09-12 cada eixo tem
 *  a sua escada ("Kitnet", "Marmita", "TRI Ouro"); mundo com lista única
 *  (legado) ignora o papel. */
export function nomeNivel(cfg: RecursosCfg, n: number, papel?: Papel): string {
  const escada = Array.isArray(cfg.niveis) ? cfg.niveis : papel ? (cfg.niveis[papel] ?? []) : []
  return escada[n - 1] ?? `Nível ${n}`
}

/** O MAIOR do eixo (pedido 2026-09-12): entre o plano do mês e o que o herói
 *  tem de posse, a nota de degrau mais alto — empate desempata pelo preço de
 *  referência (compra, senão o do mês). É dela a figura que o sumário mostra. */
/** O MAIOR de dois recursos do mesmo eixo: vence o degrau, e o preço de
 *  referência (compra, senão o do mês) desempata. Usado pra escolher a figura
 *  do sumário e, desde 2026-09-13, pra decidir o plano EFETIVO quando a
 *  regalia garante um piso — assim "qual é o piso" e "qual figura aparece"
 *  nunca divergem. */
export function maisAlto(a: Recurso | null, b: Recurso | null): Recurso | null {
  if (!a) return b
  if (!b) return a
  const ref = (x: Recurso) => x.compra ?? x.preco
  const acima = (b.nivel ?? 0) - (a.nivel ?? 0)
  return acima > 0 || (acima === 0 && ref(b) > ref(a)) ? b : a
}

export function melhorDoEixo(eixo: EixoDoMes): Recurso | null {
  return [eixo.plano, ...eixo.posse.map((p) => p.recurso)]
    .filter((r): r is Recurso => r != null)
    .reduce<Recurso | null>(maisAlto, null)
}

/** Rótulo de um degrau CROSS-EIXO (exigência de crédito, por exemplo): a classe
 *  social quando o mundo declara a régua; senão o degrau da escada única. */
export function nomeDegrauGeral(cfg: RecursosCfg, n: number): string {
  const cs = cfg.classeSocial
  if (!cs) return nomeNivel(cfg, n)
  const letra = cs.letras[n - 1]
  if (!letra) return `Nível ${n}`
  const rotulo = cs.rotulos[letra]
  return rotulo ? `Classe ${letra} · ${rotulo}` : `Classe ${letra}`
}
export function isEstilo(cfg: RecursosCfg, r: Recurso): boolean {
  return r.tipo === cfg.tipos.estilo
}
/** Fonte de crédito. Mundo sem `tipos.emprestimo` não tem empréstimo. */
export function isEmprestimo(cfg: RecursosCfg, r: Recurso): boolean {
  return cfg.tipos.emprestimo !== undefined && r.tipo === cfg.tipos.emprestimo
}

/** O que se pode FAZER com uma nota — derivado da config + Cobrança. */
export type Acao =
  | 'escolher' // plano do mês (só na ficha)
  | 'info' // tarifa avulsa: nem aparece nos lugares (o plano TRI cobre)
  | 'referencia' // aluguel de moradia sem `Compra`: aparece na vitrine só como preço de referência
  | 'comprar' // vira POSSE (Cobrança única, ou imóvel com `Compra`)
  | 'diaria' // por dia/noite: paga na hora
  | 'avista' // consumo que fecha um milhar: paga na hora, sem registro
  | 'miudeza' // abaixo de um milhar: sai do bolso, sem registro

export function acaoDe(cfg: RecursosCfg, r: Recurso, fator: number): Acao {
  if (r.tipo === cfg.tipos.estilo) return 'escolher'
  // Crédito não se compra: contrai dívida na ficha, e por isso não entra na
  // vitrine dos lugares (como a tarifa avulsa).
  if (isEmprestimo(cfg, r)) return 'info'
  if (r.tipo === cfg.tipos.passagem) return 'info'
  if (r.cobranca === 'única') return 'comprar'
  if (r.cobranca === 'dia' || r.cobranca === 'noite') return 'diaria'
  const papel = papelDaAba(cfg, r.aba)
  if (papel === 'moradia' && r.cobranca === 'mês') return r.compra !== undefined ? 'comprar' : 'referencia'
  return r.preco >= fator ? 'avista' : 'miudeza'
}

/** Preço de compra de uma nota (posse): imóvel = `Compra`; usado = `Usado`. */
export function precoDeCompra(r: Recurso, estado?: 'novo' | 'usado'): number {
  if (r.compra !== undefined && r.cobranca !== 'única') return r.compra
  return estado === 'usado' ? (r.usado ?? r.preco) : r.preco
}

/* ─────────────────────────── dinheiro ─────────────────────────── */

/** Régua do bairro sobre um preço: arredonda pra dezena, nunca abaixo de 10. */
export function precoNaRegua(preco: number, mult: number): number {
  if (preco <= 0) return 0
  return Math.max(10, Math.round((preco * mult) / 10) * 10)
}

/** IMPOSTO (2026-09-13): alíquota (%) do bem pelo `Nível` — a escada de luxo
 *  que toda nota de Recurso já traz. Dado do mundo (`recursos.imposto`), nunca
 *  do código. Mundo sem o bloco, ou bem sem nível, é isento. */
export function aliquotaDoNivel(cfg: RecursosCfg, nivel?: number): number {
  const escada = cfg.imposto?.porNivel
  if (!escada || !nivel) return 0
  return escada[nivel - 1] ?? 0
}

/** Valor mensal já com o imposto do nível. Incide sobre o MÊS (manutenção da
 *  posse e preço do plano), nunca sobre a compra e nunca sobre a caixinha. */
export function comImposto(cfg: RecursosCfg, valor: number, nivel?: number): number {
  const pct = aliquotaDoNivel(cfg, nivel)
  return pct ? Math.round(valor * (1 + pct / 100)) : valor
}

/** Moeda do mundo → unidades da ficha, PRA CIMA ao milhar (nada fracionário). */
export function custoEmOuro(valorMoeda: number, fator: number): number {
  if (valorMoeda <= 0) return 0
  return Math.ceil(valorMoeda / Math.max(1, fator))
}

/** Manutenção mensal de um item de posse: o USADO custa ×1,5 (peça pirata,
 *  oficina de bairro, combustível do mercado negro), à centena pra cima, e o
 *  IMPOSTO do nível entra por cima — IPVA e IPTU sempre moraram nesta linha, e
 *  desde 2026-09-13 sobem com o luxo da coisa. O cedido por terceiro não custa
 *  nada: não está no nome do herói, então não paga imposto nem oficina. Sem
 *  `cfg` não há imposto, que é o comportamento de todo mundo antes disso. */
export function manutencaoDoItem(rec: Recurso | undefined, item: ItemTido, cfg?: RecursosCfg): number {
  if (item.pagoPor) return 0
  const base = rec?.manutencao ?? 0
  // No nome de terceiro não se paga imposto — paga-se a quem segura o bem, e
  // a conta dele é uma fração do que o Estado cobraria.
  const tributo = cfg ? comImposto(cfg, base, rec?.nivel) - base : 0
  const fracao = cfg?.imposto?.disfarce?.fracao ?? 0
  const comTributo = item.emNomeDe ? base + Math.round((tributo * fracao) / 100) : base + tributo
  const unidade = item.estado === 'usado' ? Math.ceil((comTributo * 1.5) / 100) * 100 : comTributo
  return unidade * item.qtd
}

/** Vagas de veículo que o plano de moradia garante (FM `Vagas` da nota). */
/** Vagas da moradia EFETIVA (a escolhida ou o piso da regalia, o que for
 *  maior). Ler só o nome salvo faria o Apartamento concedido ao Ídolo não
 *  contar, e o carro dele dormiria na rua dentro do próprio apartamento. */
export function vagasDe(
  r: RecursosDoHeroi,
  porNome: Map<string, Recurso>,
  cfg: RecursosCfg,
  pisos?: RegaliaAtiva['pisos'],
): number {
  const nome = r.estilos.moradia
  const escolhido = nome ? porNome.get(nome) : undefined
  const valido = escolhido && isEstilo(cfg, escolhido) ? escolhido : null
  const plano = maisAlto(valido, pisos?.moradia?.plano ?? null)
  return plano?.vagas ?? 0
}

/** Índices dos veículos que não couberam na garagem — dormem na rua e rolam
 *  o d6 de pane mesmo sendo novos (roubo de carro é o crime que mais paga). */
export function naRua(
  r: RecursosDoHeroi,
  porNome: Map<string, Recurso>,
  cfg: RecursosCfg,
  pisos?: RegaliaAtiva['pisos'],
): number[] {
  const aba = abaDoPapel(cfg, 'transporte')
  const vagas = vagasDe(r, porNome, cfg, pisos)
  const fora: number[] = []
  let usadas = 0
  r.itens.forEach((item, indice) => {
    if (item.aba !== aba) return
    for (let k = 0; k < item.qtd; k++) {
      if (usadas < vagas) usadas++
      else if (!fora.includes(indice)) fora.push(indice)
    }
  })
  return fora
}

export interface PosseDoMes {
  indice: number
  item: ItemTido
  recurso: Recurso | undefined
  /** Manutenção mensal (nota × qtd; usado ×1,5; cedido = 0). */
  valor: number
  /** Sem vaga na moradia: dorme na rua e rola pane. */
  naRua: boolean
  /** Cedida pela regalia: derivada, não está em `itens`, e por isso `indice`
   *  vem -1 — não se vende, não se conserta, não ocupa vaga. */
  concedido?: true
}
export interface EixoDoMes {
  papel: Papel
  /** Plano escolhido (nota) ou null. */
  plano: Recurso | null
  planoValor: number
  /** Quem banca o plano (regalia de classe) — então ele não sai do saldo. */
  pagoPor?: string
  /** Piso garantido pela regalia neste eixo (undefined = eixo sem regalia). */
  piso?: { plano: Recurso; quem: string }
  /** Quanto do plano o terceiro põe: o preço do piso, no máximo o do efetivo.
   *  Com `pagoPor` manual, é o plano inteiro (o override do mestre). */
  pagoPorValor: number
  posse: PosseDoMes[]
  posseValor: number
  /** Plano + manutenção da posse (o que o eixo custa, pago por quem for). */
  total: number
  /** O que sai do bolso do herói (exclui o plano cedido). */
  doBolso: number
  /** Quanto do `total` é IMPOSTO (plano + posse). Zero em mundo sem o bloco,
   *  e zero no que está em nome de terceiro. É linha de leitura, não de conta:
   *  já está dentro de `planoValor`, `posseValor` e `total`. */
  imposto: number
  nivel: number
}
/** Parcela de uma dívida no mês: juros do saldo + amortização mínima. */
export interface ParcelaDoMes {
  indice: number
  divida: Divida
  fonte: Recurso | undefined
  juros: number
  amortizacao: number
  total: number
}
export interface CustoMensal {
  eixos: EixoDoMes[]
  parcelas: ParcelaDoMes[]
  parcelasTotal: number
  /** O que sai do bolso no mês (eixos do bolso + parcelas). */
  total: number
  /** Total em unidades da ficha (milhares, pra cima). */
  ouro: number
  /** Classe do herói = menor eixo. */
  classe: number
  /** RENDA da regalia neste mês (moeda do mundo). NÃO entra em `total`: netar
   *  ali encolheria o teto de crédito (`tetoMeses × total`), e o Ídolo passaria
   *  a poder pegar MENOS emprestado por ganhar mais. É linha à parte. */
  renda: number
  /** Renda em unidades da ficha, PRA BAIXO — dinheiro que entra nunca
   *  arredonda a favor (o que sai arredonda pra cima, em `custoEmOuro`). */
  rendaOuro: number
  /** `total − renda`: o que falta (positivo) ou sobra (negativo) no mês. */
  liquido: number
}

/** Arredonda pra cima na unidade da ficha (POA: o milhar). */
function aoMilhar(v: number, fator: number): number {
  const u = Math.max(1, fator)
  return Math.ceil(v / u) * u
}

/** Custo do mês: por eixo (plano + manutenção da posse) e as parcelas das
 *  dívidas. O plano cedido por terceiro aparece, mas não sai do bolso. */
export function custoMensal(
  r: RecursosDoHeroi,
  porNome: Map<string, Recurso>,
  fator: number,
  cfg: RecursosCfg,
  regalia?: RegaliaAtiva,
): CustoMensal {
  const fora = new Set(naRua(r, porNome, cfg, regalia?.pisos))
  const eixos: EixoDoMes[] = []
  for (const papel of PAPEIS) {
    const aba = abaDoPapel(cfg, papel)
    const nome = r.estilos[papel]
    const n = nome ? porNome.get(nome) : undefined
    const escolhido = n && isEstilo(cfg, n) ? n : null
    // PISO da regalia: o herói pode subir, nunca descer. O plano EFETIVO é o
    // maior entre o que ele marcou e o que o terceiro garante.
    const piso = regalia?.pisos[papel]
    const plano = maisAlto(escolhido, piso?.plano ?? null)
    const posse: PosseDoMes[] = []
    r.itens.forEach((item, indice) => {
      if (item.aba !== aba) return
      const rec = porNome.get(item.nome)
      posse.push({ indice, item, recurso: rec, valor: manutencaoDoItem(rec, item, cfg), naRua: fora.has(indice) })
    })
    // CEDIDAS pela regalia: derivadas, nunca gravadas — por isso `indice: -1`,
    // que nenhum mutador aceita (`venderItem`/`consertar` leem `r.itens[i]`).
    // Não ocupam vaga nem rolam pane: a Kombi é do sindicato e quem guarda e
    // conserta é quem paga.
    for (const cedida of regalia?.posse ?? []) {
      if (cedida.aba !== aba || r.itens.some((i) => i.nome === cedida.nome)) continue
      posse.push({ indice: -1, item: cedida, recurso: porNome.get(cedida.nome), valor: 0, naRua: false, concedido: true })
    }
    // o plano do mês também é consumo taxado: o degrau alto custa mais
    // porque o Estado cobra mais dele, não porque a nota mudou de preço.
    const planoValor = comImposto(cfg, plano?.preco ?? 0, plano?.nivel)
    const manual = r.pagoPor[papel]
    // O terceiro põe o valor do plano CONCEDIDO (no máximo o do efetivo) e o
    // herói completa a diferença — subir acima do piso não faz a firma sumir.
    // O `pagoPor` manual é o override do mestre e cobre o plano inteiro.
    const pisoValor = piso ? comImposto(cfg, piso.plano.preco, piso.plano.nivel) : 0
    const pagoPorValor = manual ? planoValor : Math.min(pisoValor, planoValor)
    const pagoPor = manual ?? piso?.quem
    const posseValor = posse.reduce((a, p) => a + p.valor, 0)
    // quanto do eixo é tributo: a diferença entre o que se paga e o que se
    // pagaria num mundo sem imposto (o cedido não entra, porque já vale 0).
    const semImposto =
      (plano?.preco ?? 0) +
      posse.reduce((a, p) => a + manutencaoDoItem(p.recurso, p.item), 0)
    eixos.push({
      papel,
      plano,
      planoValor,
      ...(pagoPor ? { pagoPor } : {}),
      posse,
      posseValor,
      total: planoValor + posseValor,
      ...(piso ? { piso } : {}),
      pagoPorValor,
      doBolso: Math.max(0, planoValor - pagoPorValor) + posseValor,
      imposto: Math.max(0, planoValor + posseValor - semImposto),
      nivel: plano?.nivel ?? 1,
    })
  }
  const parcelas = r.dividas.map((divida, indice) => {
    const fonte = porNome.get(divida.fonte)
    const juros = aoMilhar((divida.saldo * (fonte?.juros ?? 0)) / 100, fator)
    const amortizacao = Math.min(divida.saldo, aoMilhar(divida.principal / 10, fator))
    return { indice, divida, fonte, juros, amortizacao, total: juros + amortizacao }
  })
  const parcelasTotal = parcelas.reduce((a, p) => a + p.total, 0)
  const total = eixos.reduce((a, e) => a + e.doBolso, 0) + parcelasTotal
  const renda = regalia?.renda ?? 0
  return {
    eixos,
    parcelas,
    parcelasTotal,
    total,
    ouro: custoEmOuro(total, fator),
    renda,
    rendaOuro: Math.floor(renda / Math.max(1, fator)),
    liquido: total - renda,
    classe: Math.min(...eixos.map((e) => e.nivel)),
  }
}

/* ─────────────────────────── operações ───────────────────────────
 * Cada op devolve o novo estado (+ saldo quando mexe nele) ou null quando
 * não dá (saldo insuficiente). Nunca muta o estado recebido. */

export interface Resultado {
  recursos: RecursosDoHeroi
  ouro?: number
}

function pagar(ouro: number, valorMoeda: number, fator: number): number | null {
  const custo = custoEmOuro(valorMoeda, fator)
  return ouro >= custo ? ouro - custo : null
}

export function escolherEstilo(r: RecursosDoHeroi, papel: Papel, rec: Recurso | null): Resultado {
  return { recursos: { ...r, estilos: { ...r.estilos, [papel]: rec ? rec.nome : null } } }
}

/** Marca (ou tira) o TERCEIRO que banca o plano de um eixo — a regalia de
 *  classe. Texto vazio volta a sair do bolso do herói. */
export function marcarPagoPor(r: RecursosDoHeroi, papel: Papel, quem: string): Resultado {
  const pagoPor = { ...r.pagoPor }
  if (quem.trim()) pagoPor[papel] = quem.trim()
  else delete pagoPor[papel]
  return { recursos: { ...r, pagoPor } }
}

/** Compra que vira POSSE (veículo novo/usado, imóvel). `preco` já com a régua. */
export function comprarItem(
  r: RecursosDoHeroi,
  rec: Recurso,
  opts: { preco: number; estado?: 'novo' | 'usado' },
  ouro: number,
  fator: number,
): Resultado | null {
  const novoOuro = pagar(ouro, opts.preco, fator)
  if (novoOuro === null) return null
  const item: ItemTido = { nome: rec.nome, aba: rec.aba, qtd: 1, pago: opts.preco, ...(opts.estado ? { estado: opts.estado } : {}) }
  return { recursos: { ...r, itens: [...r.itens, item] }, ouro: novoOuro }
}

/** Põe uma posse na ficha SEM débito: concessão do mestre, ou o que o herói
 *  já tinha antes de a ficha existir. `pago` recebe o PREÇO DE TABELA (não
 *  zero) porque é dele que sai o patrimônio do retrato social — com zero, um
 *  carro dado pelo mestre não contaria e o banner mentiria. Nunca falha: não
 *  mexe no saldo. */
export function adicionarItem(
  r: RecursosDoHeroi,
  rec: Recurso,
  opts?: { estado?: 'novo' | 'usado'; emNomeDe?: string },
): Resultado {
  const item: ItemTido = {
    nome: rec.nome,
    aba: rec.aba,
    qtd: 1,
    pago: precoDeCompra(rec, opts?.estado),
    origem: 'manual',
    ...(opts?.estado ? { estado: opts.estado } : {}),
    ...(opts?.emNomeDe ? { emNomeDe: opts.emNomeDe } : {}),
  }
  return { recursos: { ...r, itens: [...r.itens, item] } }
}

/** Põe (ou tira) o bem do NOME DE TERCEIRO — o disfarce contra o imposto.
 *  Texto vazio traz o bem de volta pro nome do herói. */
export function porNoNomeDe(r: RecursosDoHeroi, indice: number, quem: string): Resultado {
  const itens = r.itens.map((it, k) => {
    if (k !== indice) return it
    const limpo = { ...it }
    delete limpo.emNomeDe
    return quem.trim() ? { ...limpo, emNomeDe: quem.trim() } : limpo
  })
  return { recursos: { ...r, itens } }
}

/** Vende UMA unidade pela METADE do que pagou (na ficha, pra baixo). O que
 *  está em nome de terceiro não é do herói e não se vende; o que ele pôs à
 *  mão não devolve dinheiro, porque dinheiro nenhum entrou. */
export function venderItem(r: RecursosDoHeroi, indice: number, ouro: number, fator: number): Resultado | null {
  const it = r.itens[indice]
  if (!it || it.emNomeDe) return null
  const volta = it.origem === 'manual' ? 0 : Math.floor(it.pago / 2 / Math.max(1, fator))
  const itens = it.qtd > 1 ? r.itens.map((i, k) => (k === indice ? { ...i, qtd: i.qtd - 1 } : i)) : r.itens.filter((_, k) => k !== indice)
  return { recursos: { ...r, itens }, ouro: ouro + volta }
}

/** Pagamento à vista sem registro (diária, corrida, janta fora do plano). */
export function pagarAvista(r: RecursosDoHeroi, preco: number, ouro: number, fator: number): Resultado | null {
  const novoOuro = pagar(ouro, preco, fator)
  if (novoOuro === null) return null
  return { recursos: r, ouro: novoOuro }
}

/* ─────────────────────────── empréstimo ───────────────────────────
 * Uma lógica só: o principal vira dívida, todo mês paga juros sobre o saldo
 * mais um décimo do principal, e amortiza-se livremente. Sem financiamento. */

/** Teto da fonte: `Teto_Meses` × o mês do herói, ou o teto fixo da nota.
 *  `null` = fonte sem teto no sistema (agiota, penhor, dólar): a mesa decide. */
export function tetoDoEmprestimo(fonte: Recurso, custoMes: number): number | null {
  if (fonte.tetoMeses !== undefined) return fonte.tetoMeses * custoMes
  return fonte.preco > 0 ? fonte.preco : null
}

/** Pega o principal à vista e abre a dívida. Nega acima do teto da fonte. */
export function pegarEmprestimo(
  r: RecursosDoHeroi,
  fonte: Recurso,
  valor: number,
  ouro: number,
  fator: number,
  custoMes: number,
): Resultado | null {
  if (valor <= 0) return null
  const teto = tetoDoEmprestimo(fonte, custoMes)
  if (teto !== null && valor > teto) return null
  const divida: Divida = { fonte: fonte.nome, principal: valor, saldo: valor }
  return { recursos: { ...r, dividas: [...r.dividas, divida] }, ouro: ouro + Math.floor(valor / Math.max(1, fator)) }
}

/** Abate o saldo (qualquer valor até o saldo); quitou, a dívida some. */
export function amortizar(r: RecursosDoHeroi, indice: number, valor: number, ouro: number, fator: number): Resultado | null {
  const d = r.dividas[indice]
  if (!d || valor <= 0 || valor > d.saldo) return null
  const novoOuro = pagar(ouro, valor, fator)
  if (novoOuro === null) return null
  const saldo = d.saldo - valor
  const dividas = saldo > 0 ? r.dividas.map((x, k) => (k === indice ? { ...x, saldo } : x)) : r.dividas.filter((_, k) => k !== indice)
  return { recursos: { ...r, dividas }, ouro: novoOuro }
}

/** Conserta um veículo em pane pagando a manutenção EM DOBRO (oficina de
 *  sucata) — vale pelo mês corrente; o mês seguinte rola o d6 de novo. */
export function consertar(r: RecursosDoHeroi, indice: number, porNome: Map<string, Recurso>, ouro: number, fator: number, cfg?: RecursosCfg): Resultado | null {
  const it = r.itens[indice]
  if (!it?.pane) return null
  const novoOuro = pagar(ouro, manutencaoDoItem(porNome.get(it.nome), it, cfg) * 2, fator)
  if (novoOuro === null) return null
  const itens = r.itens.map((x, k) => (k === indice ? { ...x, pane: false } : x))
  return { recursos: { ...r, itens }, ouro: novoOuro }
}

/** ABRE o mês: paga adiantado os planos que saem do bolso, a manutenção da
 *  posse e a parcela das dívidas; rola o d6 de pane dos veículos usados e dos
 *  que dormem na rua; e vira o calendário. Nega quando falta saldo — quem não
 *  paga cai de classe (decisão do jogador, na virada). */
export function abrirMes(
  r: RecursosDoHeroi,
  porNome: Map<string, Recurso>,
  cfg: RecursosCfg,
  ouro: number,
  fator: number,
  heroi: string,
  regalia?: RegaliaAtiva,
): Resultado | null {
  const custo = custoMensal(r, porNome, fator, cfg, regalia)
  // A renda da regalia cai ANTES da checagem: o Profeta com 20.000/mês de
  // doações não pode ser impedido de abrir o mês que a renda dele paga.
  const caixa = ouro + custo.rendaOuro
  if (caixa < custo.ouro) return null
  const dividas = custo.parcelas
    .map((p) => ({ ...p.divida, saldo: p.divida.saldo - p.amortizacao }))
    .filter((d) => d.saldo > 0)
  const mes = r.mes + 1
  const fora = new Set(naRua(r, porNome, cfg, regalia?.pisos))
  const itens = r.itens.map((item, indice) => {
    const arrisca = item.aba === abaDoPapel(cfg, 'transporte') && (item.estado === 'usado' || fora.has(indice))
    const pane = arrisca && Math.floor(rngDe(`${heroi}|${mes}|${indice}|${item.nome}`)() * 6) + 1 === 1
    return pane ? { ...item, pane: true } : item.pane ? { ...item, pane: false } : item
  })
  return { recursos: { ...r, itens, dividas, mes }, ouro: caixa - custo.ouro }
}

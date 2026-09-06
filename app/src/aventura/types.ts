// FORMATO DE AVENTURA (docs/plano-aventuras-na-sessao.md v2.1, aprovado
// 2026-09-05) — modelo PURO que o parser produz a partir de uma nota
// `categoria: Aventura` escrita no esqueleto fixo (Resumo · Contexto · Cenas)
// com registros `### Nome` + callout `[!info]` de `**Rótulo:** valor`.
// A UI (AventuraSheet, painel da sessão, PDF do mapa) consome SÓ este modelo.
import type { CalloutField } from '../components/compendium/callout-template-fields'
import type { EncounterRoster } from '../data/session-repo/contract'
import type { LeafletBlock } from '../map/parse-leaflet'

/** Um bloco `> [!quote] 🔊 …` — texto pra ler/parafrasear pra mesa. */
export interface Leitura {
  /** Título do callout (sem o marcador), ex.: "🔊 Como descrever (a frente)". */
  titulo: string
  /** Corpo do callout, markdown sem o prefixo `> `. */
  texto: string
}

/** Referência de um campo (`Local:`/`Personagens:`/`Atlas:`/`Nota:`):
 *  `[[#Nome]]` = registro INTERNO da própria nota; `[[Nota]]` = doc da vault. */
export interface Ref {
  alvo: string
  label: string
  interno: boolean
}

/** Registro de Personagem ou Local (2.3/2.4): heading `###` + callout
 *  `[!info]` com campos. Campos-núcleo E extras vêm na ORDEM da nota — quem
 *  decide destaque/ordem fixa é o registro de campos (registros.ts). */
export interface Registro {
  slug: string
  nome: string
  campos: CalloutField[]
  leituras: Leitura[]
  /** Blocos `[!gm]` (título + corpo, markdown). */
  segredos: string[]
  /** Markdown que sobrou fora dos callouts (raro nos registros). */
  corpo: string
}

export type Segmento =
  | { kind: 'md'; md: string }
  | {
      kind: 'combate'
      /** 1-based dentro da cena. */
      n: number
      /** Heading `####` mais próximo acima do fence (ex.: "Combate — Fase 1: …"). */
      titulo: string
      roster: EncounterRoster
      /** Corpo cru do fence (pra reuso do CombatMarkerBlock). */
      code: string
      /** Chave estável do prep por monstro e do sourceNotePath do encounter:
       *  `<docId>#<cenaSlug>#<n>`. */
      encounterPath: string
    }

export interface Cena {
  n: number
  titulo: string
  slug: string
  campos: CalloutField[]
  tipo: string | null
  locais: Ref[]
  personagens: Ref[]
  leituras: Leitura[]
  /** Corpo da cena em ordem, com os fences de combate destacados. */
  segmentos: Segmento[]
}

export interface AventuraModel {
  /** false = nota sem o esqueleto (aventura só-bounty da fantasia, "Encontro"…):
   *  a view cai no render de hoje (carta + corpo). */
  temFormato: boolean
  resumo: {
    /** Corpo do `[!abstract] Resumo` (markdown). */
    texto: string
    /** Campos do `[!info] Estrutura da sessão` que NÃO são refs `= this.X`
     *  (os do FM a view lê direto do frontmatter). */
    estruturaExtra: CalloutField[]
    /** Corpo do `[!info] Como ler esta nota`, se houver. */
    comoLer: string | null
    /** Seção "Roteiro em uma página" (markdown). */
    roteiro: string | null
  }
  /** 2.1 e 2.2 — markdown inteiro das seções (prosa livre). */
  contextoAventura: string | null
  notasMestre: string | null
  personagens: Registro[]
  locais: Registro[]
  mapa: LeafletBlock | null
  abertura: { campos: CalloutField[]; corpo: string } | null
  cenas: Cena[]
  desfecho: { campos: CalloutField[]; corpo: string; leituras: Leitura[] } | null
  /** Combates fora do roteiro (nota legada com fence solto). */
  combatesSoltos: Extract<Segmento, { kind: 'combate' }>[]
}

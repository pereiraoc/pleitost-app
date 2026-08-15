// PASSO 9 — MAGIAS (#452 §8, #458; lore + proficiências no r7). Passo
// CONDICIONAL: só aparece se o personagem tem magias pra escolher — escola com
// proficiência ≠ N ou magia já concedida por regra (caso do Animista) — na
// primária OU na secundária.
//
// Em cima, os CHIPS de proficiência (idioma do passo de Equipamento): o TIPO
// de magia (Magia Arcana/Magia Anima — página do tipo nos Detalhes ao clicar),
// a Potência Mágica e o EM Máximo (páginas de Potência Mágica e Energia
// Mágica). Reusa o MagiasHabPanel real (forceEdit): catálogo/slots/aprender/
// remover são os da aba COMPETÊNCIAS, sem lógica própria.
import { useCatalog } from '../../../data/CatalogContext'
import { useDetail } from '../../../data/detail-context'
import { fmPath, num, str } from '../../ficha/hero-model'
import { MagiasHabPanel } from '../../ficha/HabilidadesTab'
import { PROF_LABEL, TipProvider } from '../../ficha/tooltips'
import { RANK_ORDER, tokens, type RankLetter } from '../../ficha/registry'
import { docIdOf, ProfChip, WizSecao } from '../bits'
import type { WizardCtx } from '../steps'

/** Lore de abertura + regras de conjuração (texto do usuário, verbatim). */
const LORE_MAGIAS =
  'Com gestos e palavras mágicas, um conjurador pode manifestar energias naturais para atacar, proteger-se, afetar o corpo e mente de uma criatura ou até criar algo do nada. Cada classe com poderes de conjurador tem seu próprio método mágico, com foco em aspectos diferentes da magia. Cada magia tem um efeito especifico que amplia as possibilidades do conjurador que optar por aprende-la.'
const BLOCOS_MAGIA: Array<{ titulo: string; texto: string }> = [
  {
    titulo: 'Conjurando uma Magia',
    texto:
      'Conjurar uma Magia de qualquer tipo necessita de ao menos uma mão livre para realizar os gestos mágicos. Uma mão ocupada por um implemento mágico conta como livre para conjurar magias. Caso a Magia use pelo menos uma ação, esses gestos contam como uma ação de Manipulação. Magias que tem tempo de conjuração de 2 ações ou mais requerem também a capacidade de falar livremente, em tom forte.',
  },
  {
    titulo: 'Recursos Mágicos',
    texto:
      'Um conjurador não pode continuamente despejar poder mágico expressivo. Qualquer Magia de poder superior a uma magia básica requer recursos para ser conjurada. O recurso usual para utilizar magia é Energia Mágica. Conjurar uma Magia Adepta custa 2 de Energia Mágica, uma Magia Experiente requer 3 e uma Magia Mestre requer 5.',
  },
]

interface EscolaLike {
  Nome?: unknown
  Proficiencia?: unknown
  Lista?: unknown
}

function escolasCom(fm: Record<string, unknown>, ...path: string[]): EscolaLike[] {
  const lista = fmPath(fm, ...path)
  return Array.isArray(lista) ? (lista as EscolaLike[]) : []
}

function temEscolaAtiva(escolas: EscolaLike[]): boolean {
  return escolas.some((e) => {
    if (str(e.Nome) === 'Tesouros') return false // exclusiva, não se aprende por slot
    const aprendidas = Array.isArray(e.Lista) ? e.Lista.length : 0
    return aprendidas > 0 || str(e.Proficiencia) !== 'N'
  })
}

/** O herói tem magias? (decide a visibilidade do passo no registro). */
export function temMagias(ctx: WizardCtx): boolean {
  const fm = (ctx.rules?.derivedFm ?? ctx.fm) as Record<string, unknown>
  return (
    temEscolaAtiva(escolasCom(fm, 'Magias', 'Lista')) ||
    temEscolaAtiva(escolasCom(fm, 'Magias', 'Secundaria', 'Lista'))
  )
}

/** TIPOS de magia proficientes (escola "Arcana Negra" → tipo "Arcana"), com a
 *  MAIOR proficiência entre as escolas do tipo — vira o chip "MAGIA ARCANA
 *  (ADEPTO)" que abre a página do tipo nos Detalhes. */
function tiposProficientes(fm: Record<string, unknown>): Array<{ tipo: string; prof: RankLetter }> {
  const out = new Map<string, RankLetter>()
  for (const e of [...escolasCom(fm, 'Magias', 'Lista'), ...escolasCom(fm, 'Magias', 'Secundaria', 'Lista')]) {
    const nome = str(e.Nome)
    const prof = str(e.Proficiencia) as RankLetter
    if (!nome || nome === 'Tesouros' || !prof || prof === 'N') continue
    const tipo = nome.split(' ')[0]!
    const atual = out.get(tipo)
    if (!atual || RANK_ORDER.indexOf(prof) > RANK_ORDER.indexOf(atual)) out.set(tipo, prof)
  }
  return [...out.entries()].map(([tipo, prof]) => ({ tipo, prof }))
}

export function PassoMagias({ ctx }: { ctx: WizardCtx }) {
  const catalog = useCatalog()
  const detail = useDetail()
  const fm = (ctx.rules?.derivedFm ?? ctx.fm) as Record<string, unknown>
  const temSec = temEscolaAtiva(escolasCom(fm, 'Magias', 'Secundaria', 'Lista'))
  const tipos = tiposProficientes(fm)
  const potencia = num(fmPath(fm, 'Magias', 'Potencia'))
  const emMax = num(fmPath(fm, 'Magias', 'EM'))

  const abrir = (nome: string) => {
    const id = docIdOf(catalog, nome)
    if (id) detail?.open({ kind: 'doc', id })
  }

  return (
    <WizSecao
      titulo="Magias"
      nota={
        <>
          <span style={{ display: 'block', marginBottom: 8 }}>{LORE_MAGIAS}</span>
          {BLOCOS_MAGIA.map((b) => (
            <span key={b.titulo} style={{ display: 'block', marginBottom: 8 }}>
              <strong style={{ color: 'var(--text)' }}>{b.titulo}.</strong> {b.texto}
            </span>
          ))}
          <span style={{ display: 'block' }}>
            Aprenda magias nos slots disponíveis — o catálogo mostra o que as suas escolas
            oferecem; toque nos chips acima do painel pra ler as regras de cada recurso.
          </span>
        </>
      }
    >
      {/* Chips de proficiência/recursos (idioma do Equipamento) — cada um abre
          a nota correspondente nos Detalhes. */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {tipos.map((t) => (
          <ProfChip
            key={t.tipo}
            ic={(tokens.emojis.escola as Record<string, string>)[t.tipo] ?? ''}
            nome={`Magia ${t.tipo} (${PROF_LABEL[t.prof] ?? t.prof})`}
            onClick={() => abrir(`Magia ${t.tipo}`)}
          />
        ))}
        <ProfChip
          ic={tokens.emojis.subcategoria.PotenciaMagica}
          nome={`Potência Mágica ${potencia}`}
          onClick={() => abrir('Potência Mágica')}
        />
        <ProfChip
          ic={(tokens.emojis.subcategoria as Record<string, string>)['EnergiaMagica'] ?? ''}
          nome={`EM Máximo ${emMax}`}
          onClick={() => abrir('Energia Mágica')}
        />
      </div>
      <TipProvider>
        <MagiasHabPanel doc={ctx.doc} refs={ctx.refs} forceEdit semRecursos />
        {temSec ? <MagiasHabPanel doc={ctx.doc} refs={ctx.refs} sec forceEdit semRecursos /> : null}
      </TipProvider>
    </WizSecao>
  )
}

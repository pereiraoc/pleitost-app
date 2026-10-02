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
import { reskinText } from '../../../data/reskin'
import { useNamedDocs } from '../../ficha/useNamedDocs'
import { MarkdownBody } from '../../../markdown/MarkdownBody'

// A regra de conjuração NÃO mora aqui (2026-10-02): é a nota `Conjuração
// Mágica` renderizada — o mundo que tiver corpo próprio pra regra
// (reskin.descricoes) mostra o dele, a fantasia mostra o canônico. Antes era
// string fixa em português de fantasia, que na POA saía "Conjurando uma
// Tecnologia… gestos tecnológicos".
const REGRA_CONJURACAO_CSS = `
.wiz-regra h1,.wiz-regra h2,.wiz-regra h3,.wiz-regra h4{font-size:12.5px;margin:8px 0 2px;color:var(--text);font-weight:700;letter-spacing:0}
.wiz-regra p{margin:0 0 6px}
.wiz-regra p:last-child{margin-bottom:0}
`

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
  const namedDoc = useNamedDocs(['Conjuração Mágica'])
  const regra = namedDoc('Conjuração Mágica')

  return (
    <WizSecao
      titulo="Magias"
      nota={
        <>
          {regra ? (
            <span className="wiz-regra" data-wizard-regra-conjuracao="" style={{ display: 'block', marginBottom: 8 }}>
              <style>{REGRA_CONJURACAO_CSS}</style>
              <MarkdownBody doc={regra} hideLeadingTitle context="sem-embeds" />
            </span>
          ) : null}
          <span style={{ display: 'block' }}>
            {reskinText(
              'Aprenda magias nos slots disponíveis — o catálogo mostra o que as suas escolas oferecem; toque nos chips acima do painel pra ler as regras de cada recurso.',
            )}
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

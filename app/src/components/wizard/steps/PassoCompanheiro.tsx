// PASSO 11 — COMPANHEIRO ANIMAL (#452 r15). Visível só quando o herói COMANDA
// um animal: a ação derivada [[Comandar Animal]] (concedida por "Estratégia de
// Caça (Domador)" do Caçador) é o marcador mecânico — sem heurística de nome.
//
// Ao ENTRAR, o passo cria a entidade LOCAL do CA (uma vez — o id fica em
// Wizard.companheiroId do herói e some junto com o marcador no Concluir) com o
// TUTOR TRAVADO no herói, re-carimbado a cada entrada (cobre voltar e
// renomear o herói). Tudo numa página: Sintonia, Tipo, Nome, Imagem + os
// previews derivados (combate + perícias adeptas, leitura). Concluir é o do
// wizard do herói — os dois personagens ficam na base; Descartar apaga os dois
// (WizardView). O nível do CA espelha o do tutor (nivelDoTutor, familia.ts).
import { useEffect, useMemo } from 'react'
import { reskinName, reskinText } from '../../../data/reskin'
import { linkLabelDisplay } from '../../../markdown/dataview-value'
import { useCatalog } from '../../../data/CatalogContext'
import {
  createLocalEntity,
  emptyCompanheiroFrontmatter,
  getLocalDoc,
  setLocalEntityFm,
  useLocalStoreVersion,
} from '../../../data/local-entities'
import { useEntityImageUrl } from '../../../data/images'
import { useHeroModel } from '../../../data/useHeroModel'
import { useHeroRules } from '../../../rules/useHeroRules'
import { sintoniaEmojiDe } from '../../../grupo/party'
import type { VaultDoc } from '../../../data/types'
import { fmPath, listaEntries, sintoniaDisplay, str, wikiTarget } from '../../ficha/hero-model'
import { displayName, periciaEmoji, slugify, tokens } from '../../ficha/registry'
import { PROF_LABEL } from '../../ficha/tooltips'
import type { RankLetter } from '../../ficha/registry'
import { clip } from '../../ficha/bits'
import { PreviewCombate } from './PassoAtributos'
import { LocalImageUpload } from '../../ficha/PerfilTab'
import { docIdOf, WizCampo, WizCardLista, WizSecao, wizTitulo } from '../bits'
import type { WizardCtx } from '../steps'

/** Lore de abertura — fantasia: texto da nota [[Companheiro Animal]] da
 *  vault, verbatim (sem os wikilinks). POA 1987: cópia própria no registro
 *  do Empregado (Contexto POA §3) — o passo escolhe pela presença do rename
 *  no mundo ativo. */
const LORE_COMPANHEIRO = [
  'Você recebe um companheiro animal. As características do animal são determinadas pelo tipo. O tipo de animal é determinado pela sua sintonia: Ave (Vento/Fogo), Canino (Fogo/Terra), Ursino (Terra/Água) ou Felino (Água/Vento).',
  'Companheiros animais são parceiros de Domadores, tendo uma conexão forte com o caçador. Um companheiro animal tem nível igual ao nível de seu Domador. Um Domador pode comandar seu companheiro para realizar ações que condizem com a capacidade intelectual de um animal. Em combate, um Domador pode, uma vez por turno, Comandar Animal.',
]
const LORE_EMPREGADO = [
  'Você recebe um Empregado na folha. As características dele são determinadas pelo tipo de contrato, que combina com a Tipagem: Zangão (Vento/Fogo — drone pilotado por link neural), Segurança (Fogo/Terra), Capanga (Terra/Água) ou Espião (Água/Vento).',
  'Empregados respondem a Gestores — o Plano de Carreira de quem administra gente. Um Empregado tem nível igual ao do seu Empregador, e cumpre ordens que caibam no contrato. Em combate, o Gestor pode, uma vez por turno, Dar Ordens.',
]

/** O herói comanda um animal? (decide a visibilidade do passo — a ação
 *  derivada é a fonte, concedida pela habilidade de Domador.) */
export function temCompanheiro(ctx: WizardCtx): boolean {
  const fm = (ctx.rules?.derivedFm ?? ctx.fm) as Record<string, unknown>
  return listaEntries(fmPath(fm, 'Acoes', 'Lista')).some((e) => e.target === 'Comandar Animal')
}

/** Gate: CA criado com Sintonia + Tipo + Nome preenchidos. */
export function companheiroCompleto(ctx: WizardCtx): boolean {
  const caId = str(fmPath(ctx.fm, 'Wizard', 'companheiroId'))
  if (!caId) return false
  const ca = getLocalDoc(caId)
  if (!ca) return false
  const fm = ca.frontmatter
  return (
    str(fm['Sintonia']).trim() !== '' &&
    str(fm['Classe']).trim() !== '' &&
    str(fm['nome']).trim() !== ''
  )
}

/** Stub pros hooks no primeiro render (o CA nasce num efeito) — mesmo idioma
 *  do use-pending-tabs. */
const STUB_DOC = {
  id: '',
  path: '',
  basename: '',
  type: null,
  subtype: null,
  grupo: null,
  kind: 'content',
  frontmatter: {},
  body: '',
  inlineFields: {},
  ruleElements: [],
} as unknown as VaultDoc

export function PassoCompanheiro({ ctx }: { ctx: WizardCtx }) {
  const catalog = useCatalog()
  const heroNome = str(ctx.fm['nome']).trim() || ctx.doc.basename
  // Mundo com rename (POA: Empregado) → cópia, emoji e rótulos do mundo.
  const mundoEmpregado = reskinName('Companheiro Animal') !== 'Companheiro Animal'
  const bicho = reskinText('companheiro animal') // 'companheiro animal' | 'empregado'
  const lore = mundoEmpregado ? LORE_EMPREGADO : LORE_COMPANHEIRO
  const caId = str(fmPath(ctx.fm, 'Wizard', 'companheiroId'))

  // Cria o CA na PRIMEIRA entrada; nas seguintes re-carimba o Tutor (o herói
  // pode ter sido renomeado ao voltar). O Tutor não é editável aqui.
  useEffect(() => {
    if (!caId) {
      const id = createLocalEntity('CompanheiroAnimal', mundoEmpregado ? 'Novo Empregado' : 'Novo Companheiro', {
        ...emptyCompanheiroFrontmatter(''),
        Tutor: `[[${heroNome}]]`,
      })
      ctx.model.set('Wizard.companheiroId', id)
    } else if (getLocalDoc(caId)) {
      setLocalEntityFm(caId, 'Tutor', `[[${heroNome}]]`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caId, heroNome])

  const storeVersion = useLocalStoreVersion()
  const caDoc = useMemo(
    () => (caId ? getLocalDoc(caId) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [caId, storeVersion],
  )
  const caModel = useHeroModel(caDoc ?? STUB_DOC, 'wizard-ca')
  const caRules = useHeroRules(caModel.fm)
  const caFm = caModel.fm
  const caDerivado = (caRules?.derivedFm ?? caFm) as Record<string, unknown>
  const imgUrl = useEntityImageUrl(caId || null)

  if (!caDoc) {
    return <span style={{ fontSize: 13, color: 'var(--muted)' }}>Criando o {bicho}…</span>
  }

  const sintoniaAtual = wikiTarget(str(caFm['Sintonia']))
  const tipoAtual = wikiTarget(str(caFm['Classe']))
  // Perícias ADEPTAS+ concedidas pela cascata (Tipo + base) — resumo leitura.
  const periciasDadas = ((fmPath(caDerivado, 'Pericias', 'Lista') ?? []) as Record<
    string,
    unknown
  >[]).filter((p) => {
    const prof = str(p['Proficiencia'])
    return prof !== '' && prof !== 'N'
  })

  return (
    <div>
      <WizSecao
        titulo={reskinText('Companheiro Animal')}
        pendente={!companheiroCompleto(ctx)}
        nota={
          <>
            {lore.map((p) => (
              <span key={p} style={{ display: 'block', marginBottom: 8 }}>
                {p}
              </span>
            ))}
            <span style={{ display: 'block' }}>
              {`O ${reskinText('Tutor').toLowerCase()} já está definido (é o seu herói) e os dois nascem juntos ao concluir a criação.`}
            </span>
          </>
        }
      >
        {/* TUTOR travado — só informação, sem edição neste passo. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ ...wizTitulo, fontSize: 10 }}>
            {tokens.emojis.perfil.Tutor} {reskinText('Tutor').toUpperCase()}
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 12px',
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--text)',
              background: 'color-mix(in srgb,var(--muted) 7%,transparent)',
              border: '1px dashed color-mix(in srgb,var(--muted) 55%,transparent)',
              clipPath: clip(7),
            }}
          >
            {heroNome}
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>
              definido pela criação
            </span>
          </span>
        </div>
      </WizSecao>

      {/* r16: RETRATO + NOME logo após o tutor (pedido do usuário) — o
          quadrado é o MESMO idioma do retrato do herói (PassoNome), com o
          pipeline local-first LocalImageUpload/useEntityImageUrl. */}
      <WizSecao titulo={`Quem é seu ${bicho}?`} pendente={str(caFm['nome']).trim() === ''}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
          <span
            style={{
              width: 84,
              height: 84,
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 30,
              overflow: 'hidden',
              background: 'var(--panel2)',
              border: '1px solid var(--line2)',
              clipPath: clip(10),
            }}
          >
            {imgUrl ? (
              <img
                src={imgUrl}
                alt={`Retrato do ${bicho}`}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              // POA: Empregado é gente (ou drone) — nada de patinhas.
              mundoEmpregado ? '👤' : '🐾'
            )}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ ...wizTitulo, fontSize: 10 }}>{`IMAGEM DO ${bicho.toUpperCase()}`}</span>
            <LocalImageUpload id={caId} />
          </div>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <WizCampo
              label={`Nome do ${bicho}`}
              value={str(caFm['nome'])}
              onChange={(v) => caModel.set('nome', v)}
              placeholder={mundoEmpregado ? 'Neide, Índio, Sombra…' : 'Rex, Nimbus, Malha…'}
            />
          </div>
        </div>
      </WizSecao>

      <WizSecao titulo={`${reskinText('Sintonia')} do ${bicho}`} pendente={sintoniaAtual === ''}>
        <WizCardLista
          ariaLabel={`${reskinText('Sintonia')} do ${bicho}`}
          itens={(caRules?.sintonias ?? []).map((o) => ({
            id: o.value,
            titulo: sintoniaDisplay(o.value),
            ic: sintoniaEmojiDe(o.value) ?? undefined,
            detalheId: docIdOf(catalog, o.value),
          }))}
          selecionado={
            (caRules?.sintonias ?? []).find((o) => wikiTarget(o.value) === sintoniaAtual)?.value ??
            null
          }
          onPick={(v) => caModel.set('Sintonia', v)}
        />
      </WizSecao>

      <WizSecao
        titulo="Tipo"
        pendente={tipoAtual === ''}
        nota={`O tipo define atributos, ataques, movimento e perícias do ${bicho} — toque pra ler a regra nos detalhes.`}
      >
        <WizCardLista
          ariaLabel={`Tipos de ${bicho}`}
          itens={(caRules?.tiposCompanheiro ?? []).map((o) => ({
            id: o.value,
            // POA: o card mostra o nome do CONTRATO (Segurança/Espião/Zangão/
            // Capanga); fantasia segue o curto (Canino/Felino/Ave/Ursino).
            titulo: mundoEmpregado ? linkLabelDisplay(o.value) : o.label,
            ic: tokens.emojis.categoria.Habilidade,
            detalheId: docIdOf(catalog, o.value),
          }))}
          selecionado={
            (caRules?.tiposCompanheiro ?? []).find((o) => wikiTarget(o.value) === tipoAtual)
              ?.value ?? null
          }
          onPick={(v) => caModel.set('Classe', v)}
        />
      </WizSecao>

      {/* Perícias concedidas pela cascata (leitura — no nível 1 não há slot a
          gastar; os slots do CA chegam com o nível do tutor). */}
      <WizSecao
        titulo={`Perícias do ${bicho}`}
        nota="Concedidas pelo tipo e pela regra base — sem escolhas no nível 1."
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {periciasDadas.length ? (
            periciasDadas.map((p) => {
              const nome = str(p['Nome'])
              const prof = str(p['Proficiencia']) as RankLetter
              return (
                <span
                  key={nome}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    fontSize: 13,
                    background: 'var(--card)',
                    border: '1px solid var(--line2)',
                    clipPath: clip(7),
                  }}
                >
                  <span>{periciaEmoji(nome)}</span>
                  <span style={{ fontWeight: 700 }}>{displayName(slugify(nome))}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: 'var(--accent)' }}>
                    {(PROF_LABEL[prof] ?? prof).toUpperCase()}
                  </span>
                </span>
              )
            })
          ) : (
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              Escolha o tipo pra ver as perícias concedidas.
            </span>
          )}
        </div>
      </WizSecao>

      <PreviewCombate
        derivado={caDerivado}
        titulo={`Como seu ${bicho} se defende`}
        nota={`Derivado do tipo escolhido e do nível do ${reskinText('Tutor').toLowerCase()} — é assim que aparece na ficha do ${bicho}.`}
      />
    </div>
  )
}

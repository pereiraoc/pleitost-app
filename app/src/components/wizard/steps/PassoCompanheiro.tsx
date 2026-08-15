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
import { useCatalog } from '../../../data/CatalogContext'
import {
  createLocalEntity,
  emptyCompanheiroFrontmatter,
  getLocalDoc,
  setLocalEntityFm,
  useLocalStoreVersion,
} from '../../../data/local-entities'
import { saveEntityImage, useEntityImageUrl } from '../../../data/images'
import { useHeroModel } from '../../../data/useHeroModel'
import { useHeroRules } from '../../../rules/useHeroRules'
import { sintoniaEmojiDe } from '../../../grupo/party'
import type { VaultDoc } from '../../../data/types'
import { fmPath, listaEntries, str, wikiTarget } from '../../ficha/hero-model'
import { displayName, periciaEmoji, slugify, tokens } from '../../ficha/registry'
import { PROF_LABEL } from '../../ficha/tooltips'
import type { RankLetter } from '../../ficha/registry'
import { clip } from '../../ficha/bits'
import { PreviewCombate } from './PassoAtributos'
import { docIdOf, WizCampo, WizCardLista, WizSecao, wizTitulo } from '../bits'
import type { WizardCtx } from '../steps'

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
  const caId = str(fmPath(ctx.fm, 'Wizard', 'companheiroId'))

  // Cria o CA na PRIMEIRA entrada; nas seguintes re-carimba o Tutor (o herói
  // pode ter sido renomeado ao voltar). O Tutor não é editável aqui.
  useEffect(() => {
    if (!caId) {
      const id = createLocalEntity('CompanheiroAnimal', 'Novo Companheiro', {
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
    return <span style={{ fontSize: 13, color: 'var(--muted)' }}>Criando o companheiro…</span>
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
        titulo="Companheiro Animal"
        pendente={!companheiroCompleto(ctx)}
        nota="Seu herói comanda um animal — monte o companheiro aqui. O tutor já está definido (é o seu herói) e os dois nascem juntos ao concluir a criação; o nível do companheiro acompanha o do tutor."
      >
        {/* TUTOR travado — só informação, sem edição neste passo. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ ...wizTitulo, fontSize: 10 }}>
            {tokens.emojis.perfil.Tutor} TUTOR
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

      <WizSecao titulo="Sintonia do companheiro" pendente={sintoniaAtual === ''}>
        <WizCardLista
          ariaLabel="Sintonias do companheiro"
          itens={(caRules?.sintonias ?? []).map((o) => ({
            id: o.value,
            titulo: o.label,
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
        nota="O tipo define atributos, ataques, movimento e perícias do companheiro — toque pra ler a regra nos detalhes."
      >
        <WizCardLista
          ariaLabel="Tipos de companheiro animal"
          itens={(caRules?.tiposCompanheiro ?? []).map((o) => ({
            id: o.value,
            titulo: o.label,
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

      <WizSecao titulo="Nome e imagem" pendente={str(caFm['nome']).trim() === ''}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, alignItems: 'end' }}>
          <WizCampo
            label="Nome do companheiro"
            value={str(caFm['nome'])}
            onChange={(v) => caModel.set('nome', v)}
            placeholder="Rex, Nimbus, Malha…"
          />
          {/* Retrato local-first: o upload grava no store sob o id da ENTIDADE
              (useCreaturePortrait resolve igual em toda lista/ficha). */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              padding: '7px 12px',
              background: 'var(--card)',
              border: '1px solid var(--line2)',
              clipPath: clip(7),
            }}
          >
            {imgUrl ? (
              <img
                src={imgUrl}
                alt="Retrato do companheiro"
                style={{ width: 44, height: 44, objectFit: 'cover', clipPath: clip(6) }}
              />
            ) : (
              <span style={{ fontSize: 22 }}>🐾</span>
            )}
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--muted)' }}>
              {imgUrl ? 'TROCAR IMAGEM' : 'ENVIAR IMAGEM'}
            </span>
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f && caId) void saveEntityImage(caId, f)
                e.target.value = ''
              }}
            />
          </label>
        </div>
      </WizSecao>

      {/* Perícias concedidas pela cascata (leitura — no nível 1 não há slot a
          gastar; os slots do CA chegam com o nível do tutor). */}
      <WizSecao
        titulo="Perícias do companheiro"
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
        titulo="Como seu companheiro se defende"
        nota="Derivado do tipo escolhido e do nível do tutor — é assim que aparece na ficha do companheiro."
      />
    </div>
  )
}

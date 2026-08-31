// PASSO 7 — EQUIPAMENTO INICIAL (#452 §6, #457; feedback r2 #464 itens 12-15).
//
// Grátis pro herói novo: SÓ as armas das mãos + armadura. As mãos nascem com
// ATAQUE DESARMADO (o doc real de Armas Simples) — mão desarmada permite
// manobras; a secundária também aceita ESCUDO (aba própria do picker). Duas
// armas de verdade (1 mão cada) exibem o aviso do "Lutar com Duas Armas"
// apontando as notas de regra; desarmado/escudo NÃO contam pra isso.
//
// Recomendações: `rules/equip-recomendacao.ts` sobre o FM DERIVADO — com o
// STEP-DOWN das simples (#464 item 14), poupado pelas armas com BÔNUS DE
// ESPECIALIZAÇÃO (grupoArma.armas dos Efeitos_Interativos das habilidades,
// via interativa). A armadura RECOMENDADA já entra selecionada por default
// (uma vez, marcador Wizard.equipInit). Writes espelham o InventarioTab.
import { useEffect, useMemo, useState } from 'react'
import { reskinName, reskinText } from '../../../data/reskin'
import { useCatalog } from '../../../data/CatalogContext'
import { useDetail } from '../../../data/detail-context'
import { useDocs } from '../../../data/useDoc'
import {
  armaInfoDoFm,
  proficienciasArmaduraDoFm,
  proficienciasDoFm,
  recomendacaoArma,
  recomendacaoArmadura,
  GRUPOS_WIZARD,
  type ArmaInfo,
} from '../../../rules/equip-recomendacao'
import { deriveArmaAtributo, fmPath, num, str, wikiTarget } from '../../ficha/hero-model'
import { EQUIP_TYPES, tokens } from '../../ficha/registry'
import { PROF_LABEL } from '../../ficha/tooltips'
import { useAssetIndex } from '../../../data/assets'
import { weaponImageUrl } from '../../../data/creature-image'
import { escudoImageUrl } from '../../../data/equipment-image'
import { useInterativaCtx } from '../../../interativa/useInterativaCtx'
import { wikilinkBasename } from '../../../rules/wikilink'
import { clip } from '../../ficha/bits'
import { ProfChip, WizCardLista, WizPillBtn, WizSecao, WizThumb, wizTitulo, type WizCardItem } from '../bits'
import type { WizardCtx } from '../steps'
import type { RankLetter } from '../../ficha/registry'

/** O doc canônico do golpe desarmado (Armas Simples/Corpo-a-Corpo). */
const ATAQUE_DESARMADO = 'Ataque Desarmado'

interface ArmaCatalogada extends ArmaInfo {
  id: string
  dano: string
  tipo: string
}

/** Gate: armadura escolhida (a recomendada entra por default; mãos podem
 *  seguir desarmadas — Ataque Desarmado é equipamento válido). */
export function equipamentoCompleto(ctx: WizardCtx): boolean {
  return str(fmPath(ctx.fm, 'Inventario', 'Armadura', 'Nome')).trim() !== ''
}


const BADGE_POR_NIVEL: Record<string, string> = {
  extremamente: 'EXTREMAMENTE RECOMENDADA',
  muito: 'MUITO RECOMENDADA',
  recomendada: 'RECOMENDADA',
}

export function PassoEquipamento({ ctx }: { ctx: WizardCtx }) {
  const { doc, fm, model, rules, refs } = ctx
  const catalog = useCatalog()
  const detail = useDetail()
  const assets = useAssetIndex()
  const derivado = (rules?.derivedFm ?? fm) as Record<string, unknown>

  // — Herói: atributos + proficiências (derivadas da classe) —
  const at = (derivado['Atributos'] ?? {}) as Record<string, unknown>
  const hero = { FOR: num(at['FOR']), AGI: num(at['AGI']) }
  const atributos = { FOR: num(at['FOR']), AGI: num(at['AGI']), INT: num(at['INT']), PRE: num(at['PRE']) }
  const profArmas = proficienciasDoFm(derivado)
  const profArmadura = proficienciasArmaduraDoFm(derivado)
  const profEscudo = str(fmPath(derivado, 'Inventario', 'Escudo', 'Proficiencia')) === 'P'
  const profAtaques = (str(fmPath(derivado, 'Ataques', 'Proficiencia')) || 'N') as RankLetter

  // — Bônus de ESPECIALIZAÇÃO em armas (#464 item 14): grupoArma.armas dos
  //   Efeitos_Interativos das habilidades (ex.: Especialização em Arma (X)). —
  const inter = useInterativaCtx(doc, refs)
  const armasEspecializadas = useMemo(() => {
    const out = new Set<string>()
    for (const d of inter.descriptors) {
      if (d.sharedFrom || !d.grupoArma) continue
      for (const a of d.grupoArma.armas) {
        const base = wikilinkBasename(a)
        if (base) out.add(base)
      }
    }
    return out
  }, [inter.descriptors])

  // — Catálogo de armas dos 4 grupos do wizard (docs completos pra FM) —
  const armaEntryIds = useMemo(
    () =>
      catalog.content
        .filter((e) => e.subtype === 'Arma' && GRUPOS_WIZARD.includes(str(e.grupo) as never))
        .map((e) => e.id),
    [catalog],
  )
  const armaDocs = useDocs(armaEntryIds)
  const armas: ArmaCatalogada[] = useMemo(() => {
    const out: ArmaCatalogada[] = []
    for (const id of armaEntryIds) {
      const d = armaDocs?.get(id)
      if (!d) continue
      const info = armaInfoDoFm(d.basename ?? id, d.frontmatter as Record<string, unknown>)
      if (!info) continue
      out.push({
        ...info,
        id,
        dano: str((d.frontmatter as Record<string, unknown>)['dano']),
        tipo: str((d.frontmatter as Record<string, unknown>)['tipo']),
      })
    }
    return out
  }, [armaDocs, armaEntryIds])
  const armaPorNome = useMemo(
    () => new Map(armas.map((a) => [a.basename.toLowerCase(), a])),
    [armas],
  )
  const desarmado = armaPorNome.get(ATAQUE_DESARMADO.toLowerCase()) ?? null

  // — Estado dos slots a partir do FM (única fonte) —
  const lista = (fmPath(fm, 'Inventario', 'Armas', 'Lista') ?? []) as Record<string, unknown>[]
  const nomeDe = (i: number) => wikiTarget(str(lista[i]?.['Nome']))
  const principal = lista.length > 0 ? armaPorNome.get(nomeDe(0).toLowerCase()) ?? null : null
  const secundaria = lista.length > 1 ? armaPorNome.get(nomeDe(1).toLowerCase()) ?? null : null
  const escudoNome = wikiTarget(str(fmPath(fm, 'Inventario', 'Escudo', 'Nome')))
  const duasMaos = !!principal && principal.maos >= 2
  const duasArmas = !!principal && !!secundaria && !duasMaos

  const [maoAberta, setMaoAbertaState] = useState<'principal' | 'secundaria' | null>(null)
  const [filtro, setFiltro] = useState<'cac' | 'dist' | 'escudo'>('cac')
  const setMaoAberta = (m: 'principal' | 'secundaria' | null) => {
    setMaoAbertaState(m)
    // a aba ESCUDO só existe pra mão secundária
    if (m !== 'secundaria' && filtro === 'escudo') setFiltro('cac')
  }

  // — Escudos e armaduras do catálogo —
  const escudos = useMemo(() => catalog.content.filter((e) => e.subtype === 'Escudo'), [catalog])
  const escudoDocs = useDocs(useMemo(() => escudos.map((e) => e.id), [escudos]))
  const armaduras = useMemo(() => catalog.content.filter((e) => e.subtype === 'Armadura'), [catalog])
  const armaduraAtual = wikiTarget(str(fmPath(fm, 'Inventario', 'Armadura', 'Nome')))
  const tipoRecomendado = recomendacaoArmadura(profArmadura, hero)
  const tipoDe = (basename: string): 'Sem' | 'Leve' | 'Pesada' | null => {
    const b = basename.toLowerCase()
    if (b.includes('sem')) return 'Sem'
    if (b.includes('leve')) return 'Leve'
    if (b.includes('pesada')) return 'Pesada'
    return null
  }

  // #464 item 13: a armadura RECOMENDADA já entra selecionada — UMA vez
  // (marcador Wizard.equipInit persiste; re-entrar no passo não sobrescreve
  // uma troca manual do jogador).
  const equipInit = !!fmPath(fm, 'Wizard', 'equipInit')
  useEffect(() => {
    if (!rules || equipInit || !armaduras.length) return
    model.set('Wizard.equipInit', true)
    const alvo = armaduras.find((e) => tipoDe(e.basename ?? e.id) === tipoRecomendado)
    if (alvo && (alvo.basename ?? '') !== armaduraAtual) {
      model.set('Inventario.Armadura.Nome', `[[${alvo.basename ?? alvo.id}]]`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules, equipInit, armaduras.length])

  const entradaArma = (a: ArmaCatalogada): Record<string, unknown> => ({
    // Espelho do addArma do InventarioTab (shape do FM + atributo derivado).
    Nome: `[[${a.basename}]]`,
    Atributo: deriveArmaAtributo(a.grupo, armaDocs?.get(a.id)?.frontmatter['propriedades'], atributos),
    Bonus_Item: 0,
    Bonus_Especial: 0,
    Categoria: '',
    Propriedade: '',
    Fonte: 'Manual',
  })

  const equipar = (mao: 'principal' | 'secundaria', a: ArmaCatalogada) => {
    if (mao === 'principal') {
      const resto = a.maos >= 2 ? [] : lista.slice(1, 2)
      model.set('Inventario.Armas.Lista', [entradaArma(a), ...resto])
      if (a.maos >= 2) model.set('Inventario.Escudo.Nome', '') // 2 mãos ocupa tudo
    } else {
      model.set('Inventario.Armas.Lista', [lista[0]!, entradaArma(a)])
      model.set('Inventario.Escudo.Nome', '') // escudo e 2ª arma disputam a mão
    }
    setMaoAberta(null)
  }
  const equiparEscudo = (basename: string) => {
    model.set('Inventario.Escudo.Nome', `[[${basename}]]`)
    model.set('Inventario.Armas.Lista', lista.slice(0, 1)) // sai a 2ª arma
    setMaoAberta(null)
  }
  const esvaziar = (mao: 'principal' | 'secundaria') => {
    if (mao === 'principal') model.set('Inventario.Armas.Lista', lista.slice(1))
    else model.set('Inventario.Armas.Lista', lista.slice(0, 1))
    setMaoAberta(null)
  }

  // — Cards do picker (ordenados: extremamente > muito > recomendada > resto).
  //   Ataque Desarmado fica FORA (é o default da mão vazia). —
  const cardsArmas: WizCardItem[] = useMemo(() => {
    const doFiltro = armas.filter(
      (a) =>
        a.basename.toLowerCase() !== ATAQUE_DESARMADO.toLowerCase() &&
        (filtro === 'cac' ? a.grupo.startsWith('cac-') : a.grupo.startsWith('d-')),
    )
    const comNivel = doFiltro.map((a) => ({
      a,
      r: recomendacaoArma(a, hero, profArmas, armasEspecializadas),
    }))
    comNivel.sort(
      (x, y) => y.r.score - x.r.score || x.a.basename.localeCompare(y.a.basename, 'pt'),
    )
    return comNivel.map(({ a, r }) => ({
      id: a.basename,
      titulo: reskinName(a.basename),
      sub: [a.dano, a.tipo, a.maos >= 2 ? '2 mãos' : '1 mão', a.forca ? `Força ${a.forca}` : null, a.precisa ? 'Precisa' : null]
        .filter(Boolean)
        .join(' · '),
      detalheId: a.id,
      // Retrato da arma como nos cards de inventário (thumb com fallback pro
      // cheio — idioma do VaultImage).
      img: weaponImageUrl(armaDocs?.get(a.id), assets, true),
      imgFull: weaponImageUrl(armaDocs?.get(a.id), assets, false),
      badge: r.nivel ? BADGE_POR_NIVEL[r.nivel] : undefined,
      badgeCor:
        r.nivel === 'extremamente'
          ? 'var(--accent)'
          : r.nivel === 'muito'
            ? 'color-mix(in srgb,var(--accent) 55%,var(--muted))'
            : 'var(--muted)',
    }))
  }, [armas, filtro, hero, profArmas, armasEspecializadas, armaDocs, assets])

  // Aviso "Lutar com Duas Armas": as NOTAS são a fonte da regra (abre nos
  // detalhes) — desarmado/escudo NÃO contam (só 2 armas de verdade).
  const regraDuasArmas = catalog.resolve('Lutando com Duas Armas')
  const tecnicaAmbidestria = catalog.resolve('Ambidestria')

  const SlotMao = ({ mao }: { mao: 'principal' | 'secundaria' }) => {
    const arma = mao === 'principal' ? principal : secundaria
    const ocupadaPor2Maos = mao === 'secundaria' && duasMaos
    const comEscudo = mao === 'secundaria' && !!escudoNome && !ocupadaPor2Maos
    const desarmada = !arma && !ocupadaPor2Maos && !comEscudo
    const aberta = maoAberta === mao
    // Retrato do que está NA mão (arma equipada, escudo, ou o desarmado default).
    const escudoEntry = comEscudo
      ? escudos.find((e) => (e.basename ?? e.id).toLowerCase() === escudoNome.toLowerCase())
      : null
    const docSlot = ocupadaPor2Maos
      ? null
      : comEscudo
        ? (escudoEntry ? escudoDocs?.get(escudoEntry.id) : undefined)
        : arma
          ? armaDocs?.get(arma.id)
          : desarmado
            ? armaDocs?.get(desarmado.id)
            : undefined
    const imgSlot = docSlot ? weaponImageUrl(docSlot, assets, true) : null
    const imgSlotFull = docSlot ? weaponImageUrl(docSlot, assets, false) : null
    const rotulo = ocupadaPor2Maos
      ? `${reskinName(principal!.basename)} (2 mãos)`
      : comEscudo
        ? reskinName(escudoNome)
        : arma
          ? reskinName(arma.basename)
          : ATAQUE_DESARMADO
    return (
      <div style={{ flex: 1, minWidth: 220 }}>
        <button
          onClick={() => setMaoAberta(aberta ? null : mao)}
          aria-label={`Mão ${mao}`}
          aria-expanded={aberta}
          disabled={ocupadaPor2Maos}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            textAlign: 'left',
            padding: '11px 14px',
            background: aberta ? 'color-mix(in srgb,var(--accent) 10%,var(--card))' : 'var(--card)',
            border: `1px solid ${aberta ? 'color-mix(in srgb,var(--accent) 55%,var(--line2))' : 'var(--line2)'}`,
            color: 'var(--text)',
            fontFamily: 'inherit',
            cursor: ocupadaPor2Maos ? 'default' : 'pointer',
            opacity: ocupadaPor2Maos ? 0.6 : 1,
            clipPath: clip(9),
          }}
        >
          {imgSlot ? <WizThumb img={imgSlot} imgFull={imgSlotFull} size={42} /> : null}
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ ...wizTitulo, fontSize: 9, display: 'block', marginBottom: 3 }}>
              {mao === 'principal' ? '🤜 MÃO PRINCIPAL' : '🤛 MÃO SECUNDÁRIA'}
            </span>
            <span style={{ fontWeight: 700, fontSize: 14.5 }}>{rotulo}</span>
            {desarmada ? (
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                Uma mão livre é necessária para usar magias e manobras.
              </span>
            ) : null}
          </span>
        </button>
        {(arma || comEscudo) && !ocupadaPor2Maos ? (
          <button
            onClick={() => (comEscudo ? model.set('Inventario.Escudo.Nome', '') : esvaziar(mao))}
            style={{
              marginTop: 4,
              fontFamily: 'var(--mono)',
              fontSize: 9.5,
              color: 'var(--muted)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            ✕ voltar ao desarmado
          </button>
        ) : null}
      </div>
    )
  }

  const abas: Array<['cac' | 'dist' | 'escudo', string]> = [
    ['cac', '⚔️ CORPO-A-CORPO'],
    ['dist', '🏹 A DISTÂNCIA'],
    ...(maoAberta === 'secundaria'
      ? ([['escudo', `${tokens.emojis.equipProf.Escudo} ESCUDOS`]] as Array<['escudo', string]>)
      : []),
  ]

  return (
    <div>
      <WizSecao
        titulo="Suas proficiências"
        nota="O que a sua classe te ensinou a usar — as armas e armaduras recomendadas abaixo partem daqui."
      >
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* #464 item 12: rank por extenso ("ATAQUES (ADEPTO)"), não a letra. */}
          <ProfChip
            ic={tokens.emojis.combate.Ataque}
            nome={`Ataques (${PROF_LABEL[profAtaques] ?? profAtaques})`}
          />
          {/* Registro EQUIP_TYPES (o mesmo do card Equipamentos de COMPETÊNCIAS):
              só as proficiências PRESENTES aparecem. */}
          {EQUIP_TYPES.filter((t) => str(fmPath(derivado, 'Inventario', ...t.path)) === 'P').map(
            (t) => (
              <ProfChip key={t.nm} ic={t.ic} nome={t.nm} />
            ),
          )}
          {profArmas.especificas.map((e) => (
            <ProfChip key={e} ic={tokens.emojis.equipProf.ArmasSimples} nome={e} />
          ))}
        </div>
      </WizSecao>

      <WizSecao
        titulo="Selecione suas armas principais"
        nota={
          <>
            <span style={{ display: 'block', marginBottom: 8 }}>
              {reskinText('Nenhum aventureiro parte pro perigo de mãos abanando: seu herói começa com armas básicas pra se defender na estrada.')} Toque numa mão pra escolher o que ela carrega —
              uma arma de 2 mãos ocupa as duas, e a mão secundária também aceita um escudo.
            </span>
            <span style={{ display: 'block' }}>
              Outras armas podem ser adicionadas depois da criação, na página de Inventário.
            </span>
          </>
        }
      >
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <SlotMao mao="principal" />
          <SlotMao mao="secundaria" />
        </div>

        {duasArmas ? (
          <div
            role="note"
            style={{
              padding: '10px 12px',
              border: '1px solid color-mix(in srgb,#eab308 55%,var(--line2))',
              background: 'color-mix(in srgb,#eab308 8%,var(--card))',
              fontSize: 12.5,
              lineHeight: 1.5,
              clipPath: clip(7),
            }}
          >
            ⚠️ Duas armas de 1 mão:{' '}
            <button
              onClick={
                regraDuasArmas.kind === 'doc'
                  ? () => detail?.open({ kind: 'doc', id: regraDuasArmas.id })
                  : undefined
              }
              style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12.5, padding: 0, textDecoration: 'underline' }}
            >
              Lutar com Duas Armas
            </button>{' '}
            tem penalidade — a técnica{' '}
            <button
              onClick={
                tecnicaAmbidestria.kind === 'doc'
                  ? () => detail?.open({ kind: 'doc', id: tecnicaAmbidestria.id })
                  : undefined
              }
              style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12.5, padding: 0, textDecoration: 'underline' }}
            >
              Ambidestria
            </button>{' '}
            a remove (veja as regras nos detalhes).
          </div>
        ) : null}

        {maoAberta ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {abas.map(([id, label]) => (
                <WizPillBtn key={id} on={filtro === id} onClick={() => setFiltro(id)}>
                  {label}
                </WizPillBtn>
              ))}
            </div>
            {filtro === 'escudo' ? (
              <WizCardLista
                ariaLabel="Escudos"
                itens={escudos.map((e) => ({
                  id: e.basename ?? e.id,
                  titulo: reskinName(e.basename ?? e.id),
                  detalheId: e.id,
                  img: escudoImageUrl(escudoDocs?.get(e.id), assets),
                  imgFull: weaponImageUrl(escudoDocs?.get(e.id), assets, false),
                  badge: profEscudo ? 'PROFICIENTE' : undefined,
                }))}
                selecionado={null}
                onPick={equiparEscudo}
              />
            ) : (
              <WizCardLista
                ariaLabel={`Armas pra mão ${maoAberta}`}
                itens={cardsArmas}
                selecionado={null}
                onPick={(basename) => {
                  const a = armaPorNome.get(basename.toLowerCase())
                  if (a) equipar(maoAberta, a)
                }}
              />
            )}
          </div>
        ) : null}
      </WizSecao>

      <WizSecao
        titulo="Selecione sua armadura"
        pendente={armaduraAtual === ''}
        nota="O que fica entre você e o golpe? Personagens de mais FORÇA se defendem melhor com armadura pesada; os de mais AGILIDADE preferem armadura leve — ou nenhuma, confiando na esquiva."
      >
        <WizCardLista
          ariaLabel="Armaduras"
          itens={armaduras.map((e) => {
            const nome = e.basename ?? e.id
            const tipo = tipoDe(nome)
            const profOk =
              tipo === 'Sem' ? profArmadura.sem : tipo === 'Leve' ? profArmadura.leve : tipo === 'Pesada' ? profArmadura.pesada : false
            return {
              id: nome,
              titulo: reskinName(nome),
              detalheId: e.id,
              badge: tipo && tipo === tipoRecomendado ? 'RECOMENDADA' : profOk ? undefined : 'SEM PROFICIÊNCIA',
              badgeCor: tipo === tipoRecomendado ? 'var(--accent)' : 'var(--muted)',
            }
          })}
          selecionado={armaduraAtual || null}
          onPick={(nome) => model.set('Inventario.Armadura.Nome', `[[${nome}]]`)}
        />
      </WizSecao>
    </div>
  )
}

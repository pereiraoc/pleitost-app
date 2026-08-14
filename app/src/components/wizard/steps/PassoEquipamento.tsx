// PASSO 6 — EQUIPAMENTO INICIAL (#452 §6, issue #457).
//
// Grátis pro herói novo (decisão do usuário): SÓ as armas das mãos + armadura.
// Duas MÃOS como slots: arma de 2 mãos ocupa ambas; mão secundária livre pode
// receber ESCUDO; mão livre = manobras (hint); 2 armas de 1 mão exibem o aviso
// do "Lutar com Duas Armas" apontando as notas de regra (nada de regra
// re-escrita aqui — os docs são a fonte).
//
// Recomendações: `rules/equip-recomendacao.ts` (spec 6.1.1–6.1.4/6.2) sobre o
// FM DERIVADO (proficiências cascateadas da classe). Só grupos simples/marciais
// (nada de armas especiais/naturais). Writes espelham o InventarioTab
// (Inventario.Armas.Lista shape + Fonte 'Manual'; Escudo.Nome; Armadura.Nome).
import { useMemo, useState } from 'react'
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
import { useAssetIndex } from '../../../data/assets'
import { weaponImageUrl } from '../../../data/creature-image'
import { escudoImageUrl } from '../../../data/equipment-image'
import { clip } from '../../ficha/bits'
import { WizCardLista, WizPillBtn, WizSecao, wizTitulo, type WizCardItem } from '../bits'
import type { WizardCtx } from '../steps'

interface ArmaCatalogada extends ArmaInfo {
  id: string
  dano: string
  tipo: string
}

/** Gate: mão principal preenchida + armadura escolhida (Sem Armadura vale). */
export function equipamentoCompleto(ctx: WizardCtx): boolean {
  const lista = (fmPath(ctx.fm, 'Inventario', 'Armas', 'Lista') ?? []) as unknown[]
  const armadura = str(fmPath(ctx.fm, 'Inventario', 'Armadura', 'Nome')).trim()
  return lista.length >= 1 && armadura !== ''
}

/** Chip de proficiência no idioma do card Equipamentos de COMPETÊNCIAS
 *  (EQUIP_TYPES: emoji do registro + nome) — só as que o herói TEM aparecem
 *  (pedido do usuário: sem poluição com o que não é proficiente). */
function ProfChip({ ic, nome }: { ic: string; nome: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: 'var(--mono)',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '.06em',
        padding: '5px 10px',
        color: 'var(--accent)',
        background: 'color-mix(in srgb,var(--accent) 10%,var(--card))',
        border: '1px solid color-mix(in srgb,var(--accent) 45%,var(--line2))',
        clipPath: clip(5),
      }}
    >
      <span style={{ fontSize: 12 }}>{ic}</span>
      {nome.toUpperCase()}
    </span>
  )
}

export function PassoEquipamento({ ctx }: { ctx: WizardCtx }) {
  const { fm, model, rules } = ctx
  const catalog = useCatalog()
  const detail = useDetail()
  const assets = useAssetIndex()
  const derivado = (rules?.derivedFm ?? fm) as Record<string, unknown>

  // — Herói: atributos + proficiências (derivadas da classe) —
  const at = (fm['Atributos'] ?? {}) as Record<string, unknown>
  const hero = { FOR: num(at['FOR']), AGI: num(at['AGI']) }
  const atributos = { FOR: num(at['FOR']), AGI: num(at['AGI']), INT: num(at['INT']), PRE: num(at['PRE']) }
  const profArmas = proficienciasDoFm(derivado)
  const profArmadura = proficienciasArmaduraDoFm(derivado)
  const profEscudo = str(fmPath(derivado, 'Inventario', 'Escudo', 'Proficiencia')) === 'P'
  const profAtaques = str(fmPath(derivado, 'Ataques', 'Proficiencia')) || 'N'

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

  // — Estado dos slots a partir do FM (única fonte) —
  const lista = (fmPath(fm, 'Inventario', 'Armas', 'Lista') ?? []) as Record<string, unknown>[]
  const nomeDe = (i: number) => wikiTarget(str(lista[i]?.['Nome']))
  const principal = lista.length > 0 ? armaPorNome.get(nomeDe(0).toLowerCase()) ?? null : null
  const secundaria = lista.length > 1 ? armaPorNome.get(nomeDe(1).toLowerCase()) ?? null : null
  const escudoNome = wikiTarget(str(fmPath(fm, 'Inventario', 'Escudo', 'Nome')))
  const duasMaos = !!principal && principal.maos >= 2
  const duasArmas = !!principal && !!secundaria && !duasMaos

  const [maoAberta, setMaoAberta] = useState<'principal' | 'secundaria' | null>(null)
  const [filtro, setFiltro] = useState<'cac' | 'dist'>('cac')

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

  // — Cards do picker (ordenados: muito > recomendada > resto; score desc) —
  const cardsArmas: WizCardItem[] = useMemo(() => {
    const doFiltro = armas.filter((a) =>
      filtro === 'cac' ? a.grupo.startsWith('cac-') : a.grupo.startsWith('d-'),
    )
    const comNivel = doFiltro.map((a) => ({ a, r: recomendacaoArma(a, hero, profArmas) }))
    comNivel.sort(
      (x, y) => y.r.score - x.r.score || x.a.basename.localeCompare(y.a.basename, 'pt'),
    )
    return comNivel.map(({ a, r }) => ({
      id: a.basename,
      titulo: a.basename,
      sub: [a.dano, a.tipo, a.maos >= 2 ? '2 mãos' : '1 mão', a.forca ? `Força ${a.forca}` : null, a.precisa ? 'Precisa' : null]
        .filter(Boolean)
        .join(' · '),
      detalheId: a.id,
      // Retrato da arma como nos cards de inventário (weaponImageUrl: thumb
      // com fallback pro cheio — idioma do VaultImage).
      img: weaponImageUrl(armaDocs?.get(a.id), assets, true),
      imgFull: weaponImageUrl(armaDocs?.get(a.id), assets, false),
      badge: r.nivel === 'muito' ? 'MUITO RECOMENDADA' : r.nivel === 'recomendada' ? 'RECOMENDADA' : undefined,
      badgeCor: r.nivel === 'muito' ? 'var(--accent)' : 'var(--muted)',
    }))
  }, [armas, filtro, hero, profArmas, armaDocs, assets])

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

  // Aviso "Lutar com Duas Armas": as NOTAS são a fonte da regra (abre nos
  // detalhes) — Lutando com Duas Armas (regra) e Ambidestria (técnica).
  const regraDuasArmas = catalog.resolve('Lutando com Duas Armas')
  const tecnicaAmbidestria = catalog.resolve('Ambidestria')

  const SlotMao = ({ mao }: { mao: 'principal' | 'secundaria' }) => {
    const arma = mao === 'principal' ? principal : secundaria
    const ocupadaPor2Maos = mao === 'secundaria' && duasMaos
    const comEscudo = mao === 'secundaria' && !!escudoNome && !ocupadaPor2Maos
    const livre = !arma && !ocupadaPor2Maos && !comEscudo
    const aberta = maoAberta === mao
    return (
      <div style={{ flex: 1, minWidth: 220 }}>
        <button
          onClick={() => setMaoAberta(aberta ? null : mao)}
          aria-label={`Mão ${mao}`}
          aria-expanded={aberta}
          disabled={ocupadaPor2Maos}
          style={{
            width: '100%',
            textAlign: 'left',
            padding: '13px 14px',
            background: aberta ? 'color-mix(in srgb,var(--accent) 10%,var(--card))' : 'var(--card)',
            border: `1px solid ${aberta ? 'color-mix(in srgb,var(--accent) 55%,var(--line2))' : 'var(--line2)'}`,
            color: 'var(--text)',
            fontFamily: 'inherit',
            cursor: ocupadaPor2Maos ? 'default' : 'pointer',
            opacity: ocupadaPor2Maos ? 0.6 : 1,
            clipPath: clip(9),
          }}
        >
          <span style={{ ...wizTitulo, fontSize: 9, display: 'block', marginBottom: 4 }}>
            {mao === 'principal' ? '🤜 MÃO PRINCIPAL' : '🤛 MÃO SECUNDÁRIA'}
          </span>
          <span style={{ fontWeight: 700, fontSize: 14.5 }}>
            {ocupadaPor2Maos
              ? `${principal!.basename} (2 mãos)`
              : comEscudo
                ? `🛡️ ${escudoNome}`
                : arma
                  ? arma.basename
                  : '— vazia —'}
          </span>
          {livre ? (
            <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>
              Mão livre permite usar manobras.
            </span>
          ) : null}
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
            ✕ esvaziar mão
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div>
      <WizSecao
        titulo="Suas proficiências"
        nota="O que a sua classe te ensinou a usar — as armas e armaduras recomendadas abaixo partem daqui."
      >
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <ProfChip ic={tokens.emojis.combate.Ataque} nome={`Ataques ${profAtaques}`} />
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
        nota="Toque numa mão e escolha o que ela carrega — as MUITO RECOMENDADAS casam com os seus atributos. Arma de 2 mãos ocupa as duas; a mão secundária também aceita um escudo, e deixá-la livre libera manobras."
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
            <div style={{ display: 'flex', gap: 6 }}>
              {(
                [
                  ['cac', '⚔️ CORPO-A-CORPO'],
                  ['dist', '🏹 A DISTÂNCIA'],
                ] as const
              ).map(([id, label]) => (
                <WizPillBtn key={id} on={filtro === id} onClick={() => setFiltro(id)}>
                  {label}
                </WizPillBtn>
              ))}
            </div>
            <WizCardLista
              ariaLabel={`Armas pra mão ${maoAberta}`}
              itens={cardsArmas}
              selecionado={null}
              onPick={(basename) => {
                const a = armaPorNome.get(basename.toLowerCase())
                if (a) equipar(maoAberta, a)
              }}
            />
            {maoAberta === 'secundaria' && escudos.length ? (
              <>
                <span style={{ ...wizTitulo, fontSize: 10 }}>🛡️ OU UM ESCUDO</span>
                <WizCardLista
                  ariaLabel="Escudos"
                  itens={escudos.map((e) => ({
                    id: e.basename ?? e.id,
                    titulo: e.basename ?? e.id,
                    detalheId: e.id,
                    img: escudoImageUrl(escudoDocs?.get(e.id), assets),
                    imgFull: weaponImageUrl(escudoDocs?.get(e.id), assets, false),
                    badge: profEscudo ? 'PROFICIENTE' : undefined,
                  }))}
                  selecionado={null}
                  onPick={equiparEscudo}
                />
              </>
            ) : null}
          </div>
        ) : null}
      </WizSecao>

      <WizSecao
        titulo="Selecione sua armadura"
        nota="A RECOMENDADA segue sua proficiência e seus atributos (FOR pesada, AGI leve). Sem Armadura também é uma escolha válida."
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
              titulo: nome,
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

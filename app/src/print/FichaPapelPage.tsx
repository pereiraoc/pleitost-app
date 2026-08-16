// FICHA DE PAPEL (export #452) — pré-visualização EM TELA das duas folhas A4
// paisagem (layout v11 aprovado pelo usuário) + impressão/salvar PDF pelo
// diálogo do navegador (window.print — o print-to-PDF nativo é o canal de
// download; @page A4 landscape margem 0). Rota FORA do AppShell (sem
// sidebars); a barra de ações some no @media print.
import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useCatalog } from '../data/CatalogContext'
import { useDoc, useDocs } from '../data/useDoc'
import { useHeroModel } from '../data/useHeroModel'
import { useHeroRules } from '../rules/useHeroRules'
import type { VaultDoc } from '../data/types'
import { str } from '../components/ficha/hero-model'
import {
  baseDoItem,
  montarDadosPapel,
  nomesReferenciados,
  PROF_NOME,
  type DadosPapel,
  type ItemResumo,
} from './dados-papel'

export const PAPEL_CSS = `
.pp-root { background: #555; min-height: 100vh; padding: 10px 0 30px; font-family: Georgia, 'Times New Roman', serif; }
.pp-bar { position: sticky; top: 0; z-index: 5; display: flex; gap: 10px; justify-content: center; padding: 10px; background: #333; }
.pp-bar button { font-family: 'Courier New', monospace; font-size: 12px; font-weight: 700; letter-spacing: .08em; padding: 8px 18px; cursor: pointer; border: 1px solid #111; background: #eee; color: #111; }
.pp-bar .pp-primario { background: #e0b73c; }
.pp-page { width: 297mm; height: 210mm; padding: 5mm 8mm; background: #fff; color: #111; margin: 6mm auto; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 2px 14px rgba(0,0,0,.5); }
@media print {
  .pp-bar { display: none; }
  .pp-root { background: #fff; padding: 0; min-height: 0; }
  .pp-page { margin: 0; box-shadow: none; page-break-after: always; }
}
@page { size: A4 landscape; margin: 0; }
.pp-page * { box-sizing: border-box; margin: 0; padding: 0; }
.pp-hdr { display: flex; align-items: baseline; gap: 3.5mm; border-bottom: 1.2pt solid #111; padding-bottom: .8mm; margin-bottom: 1.6mm; }
.pp-hdr .pp-nome { font-size: 14pt; font-weight: 700; }
.pp-hdr .pp-classe { font-size: 9pt; font-style: italic; color: #333; flex: 1; }
.pp-nvl { border: 1.2pt solid #111; padding: .8mm 2.2mm; text-align: center; font-family: 'Courier New', monospace; }
.pp-nvl b { font-size: 12pt; display: block; line-height: 1; }
.pp-nvl span { font-size: 5pt; letter-spacing: .18em; }
.pp-sec { margin-bottom: 1mm; }
.pp-sec-t { font-family: 'Courier New', monospace; font-size: 6.2pt; font-weight: 700; letter-spacing: .2em; border-bottom: .6pt solid #999; margin-bottom: 1mm; padding-bottom: .3mm; }
.pp-row { display: flex; gap: 2mm; }
.pp-box { border: .8pt solid #111; padding: 1mm 1.5mm; }
.pp-stat { text-align: center; flex: 1; }
.pp-stat b { font-size: 12pt; display: block; line-height: 1.1; }
.pp-stat i { font-size: 5.2pt; font-style: normal; font-family: 'Courier New', monospace; letter-spacing: .1em; display: block; }
.pp-stat s { font-size: 5.2pt; text-decoration: none; color: #555; }
.pp-vida-row { display: flex; align-items: flex-start; gap: 2mm; margin-bottom: .6mm; }
.pp-vida-l { flex: 0 0 34mm; font-family: 'Courier New', monospace; font-size: 6pt; font-weight: 700; letter-spacing: .06em; color: #333; padding-top: .6mm; }
.pp-vida-sq { flex: 1; min-width: 0; line-height: 1; }
.pp-sq { display: inline-block; width: 2.8mm; height: 2.8mm; border: .7pt solid #111; margin: 0 .45mm .45mm 0; vertical-align: middle; }
.pp-sq.g { margin-right: 1.5mm; }
.pp-ci { display: inline-block; width: 3mm; height: 3mm; border: .8pt solid #111; border-radius: 50%; margin: 0 .6mm .3mm 0; vertical-align: middle; }
.pp-di { display: inline-block; width: 4.4mm; height: 4.4mm; margin: 0 .5mm .3mm 0; vertical-align: middle; position: relative; }
.pp-di > span { position: absolute; inset: .55mm; border: .8pt solid #111; transform: rotate(45deg); display: block; }
.pp-chk { display: inline-flex; align-items: center; gap: .8mm; font-size: 6.8pt; width: 24%; margin-bottom: .7mm; }
.pp-chk::before { content: ''; width: 2.7mm; height: 2.7mm; border: .8pt solid #111; flex: none; }
.pp-linha-v { border-bottom: .6pt solid #888; height: 4mm; }
.pp-page table { border-collapse: collapse; width: 100%; }
.pp-page th { font-family: 'Courier New', monospace; font-size: 5.2pt; letter-spacing: .14em; text-align: left; border-bottom: .8pt solid #111; padding: .3mm .9mm; }
.pp-page td { font-size: 6.5pt; border-bottom: .5pt solid #bbb; padding: .35mm .9mm; vertical-align: top; }
.pp-cons th.q, .pp-cons td.q { width: 8mm; text-align: center; border-left: .5pt solid #bbb; font-size: 8pt; }
.pp-ln { font-size: 6.1pt; line-height: 1.3; margin-bottom: .3mm; break-inside: avoid; }
.pp-ln b { font-size: 6.3pt; }
.pp-rs { color: #333; }
.pp-tag { font-family: 'Courier New', monospace; font-size: 5.2pt; border: .6pt solid #111; padding: 0 .7mm; }
.pp-rank-h { font-family: 'Courier New', monospace; font-size: 5.4pt; font-weight: 700; letter-spacing: .18em; color: #555; margin: .7mm 0 .3mm; }
.pp-cols2 { columns: 2; column-gap: 3.5mm; column-rule: .5pt solid #ccc; }
.pp-cols4 { columns: 4; column-gap: 3.5mm; column-rule: .5pt solid #ccc; }
.pp-cols4 .pp-ln { font-size: 5.7pt; line-height: 1.2; }
.pp-mini { font-size: 5.8pt; color: #555; font-family: Georgia, serif; letter-spacing: 0; font-weight: 400; }
.pp-kv { font-size: 7pt; margin-bottom: .45mm; }
.pp-kv b { font-family: 'Courier New', monospace; font-size: 5.5pt; letter-spacing: .1em; color: #444; }
.pp-kv2 { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: .6mm 3mm; }
.pp-kv4 { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: .6mm 2mm; }
.pp-id-campo { border: .7pt solid #999; padding: .6mm 1.2mm .4mm; min-height: 6.5mm; display: flex; flex-direction: column; }
.pp-id-t { font-family: 'Courier New', monospace; font-size: 4.8pt; letter-spacing: .12em; color: #555; }
.pp-id-v { font-size: 6.8pt; flex: 1; display: flex; align-items: center; }
.pp-id-bloco { border: .7pt solid #999; padding: .5mm 1.2mm .3mm; }
.pp-id-bloco .pp-id-item { height: 3.4mm; overflow: hidden; white-space: nowrap; border-bottom: .5pt solid #ccc; display: flex; align-items: center; }
.pp-id-bloco .pp-id-item:last-child { border-bottom: none; }
.pp-flex2 { display: flex; gap: 3mm; }
.pp-flex2 > div { min-width: 0; }
.pp-fill { display: flex; flex-direction: column; }
.pp-fill .pp-linhas { flex: 1; display: flex; flex-direction: column; justify-content: space-between; }
.pp-esc { display: inline-block; margin-top: .4mm; font-size: 6.6pt; border: .8pt solid #111; padding: .8mm 1.5mm; }
.pp-esc b { font-family: 'Courier New', monospace; font-size: 5.5pt; letter-spacing: .1em; }
.pp-ouro { display: flex; align-items: baseline; gap: 2mm; margin-bottom: 1.2mm; }
.pp-ouro b { font-family: 'Courier New', monospace; font-size: 6pt; letter-spacing: .12em; }
.pp-ouro-linha { flex: 1; border-bottom: .8pt solid #555; height: 5mm; }
`

function Quadrados({ n }: { n: number }) {
  return (
    <>
      {Array.from({ length: Math.max(0, n) }, (_, i) => (
        <span key={i} className={`pp-sq${i % 5 === 4 ? ' g' : ''}`} />
      ))}
    </>
  )
}
function Bolinhas({ n }: { n: number }) {
  return (
    <>
      {Array.from({ length: Math.max(0, n) }, (_, i) => (
        <span key={i} className="pp-ci" />
      ))}
    </>
  )
}
function Losangos({ n }: { n: number }) {
  return (
    <>
      {Array.from({ length: Math.max(0, n) }, (_, i) => (
        <span key={i} className="pp-di">
          <span />
        </span>
      ))}
    </>
  )
}
function Linha({ it }: { it: ItemResumo }) {
  return (
    <div className="pp-ln">
      {it.tag ? <span className="pp-tag">{it.tag}</span> : null}{' '}
      <b>{it.nome}</b>
      {it.resumo ? <span className="pp-rs"> — {it.resumo}</span> : null}
    </div>
  )
}
/** Célula fixa das listas da identidade — o texto encolhe pra caber. */
function CelulaFixa({ texto }: { texto: string }) {
  const t = texto.trim()
  const fs = t.length <= 26 ? '6.4pt' : t.length <= 38 ? '5.4pt' : t.length <= 52 ? '4.6pt' : '4pt'
  return (
    <div className="pp-id-item">
      <span style={{ fontSize: fs }}>{t}&nbsp;</span>
    </div>
  )
}

function Pagina1({ dd, nome }: { dd: DadosPapel; nome: string }) {
  return (
    <div className="pp-page">
      <div className="pp-hdr">
        <span className="pp-nome">{nome}</span>
        <span className="pp-classe">
          {dd.classe} · Sintonia {dd.sintonia}
        </span>
        <span className="pp-nvl">
          <b>{dd.nivel}</b>
          <span>NÍVEL</span>
        </span>
      </div>
      <div className="pp-flex2" style={{ gap: '4mm' }}>
        <div style={{ flex: 1.1 }}>
          <div className="pp-sec">
            <div className="pp-sec-t">
              {'// VIDA '}
              <span className="pp-mini">(a Moral toma dano primeiro)</span>
            </div>
            <div className="pp-vida-row">
              <span className="pp-vida-l">MORAL (EH) {dd.moral}</span>
              <span className="pp-vida-sq">
                <Quadrados n={dd.moral} />
              </span>
            </div>
            <div className="pp-vida-row">
              <span className="pp-vida-l">VITALIDADE (EV) {dd.vitalidade}</span>
              <span className="pp-vida-sq">
                <Quadrados n={dd.vitalidade} />
              </span>
            </div>
            {dd.escudo ? (
              <span className="pp-esc">
                <b>ESCUDO</b> {dd.escudo.nome} {dd.escudo.categoria} · Dureza {dd.escudo.dureza} ·
                Dano {dd.escudo.dano} · ERGUIDO <span className="pp-sq" />
              </span>
            ) : null}
          </div>
          <div className="pp-sec">
            <div className="pp-sec-t">{'// DEFESAS · RESISTÊNCIAS · SENTIDOS · MOVIMENTO'}</div>
            <div className="pp-row">
              {[...dd.defesas, ...dd.sentidos].map((s) => (
                <span key={s.nome} className="pp-box pp-stat">
                  <i>{s.nome}</i>
                  <b>{s.valor}</b>
                  <s>{s.legenda}</s>
                </span>
              ))}
              <span className="pp-box pp-stat">
                <i>MOVIMENTO</i>
                <b>{dd.movimento}q</b>
                <s>terrestre</s>
              </span>
            </div>
          </div>
          <div className="pp-sec">
            <div className="pp-sec-t">{'// PERÍCIAS'}</div>
            <table>
              <tbody>
                <tr>
                  <th>PERÍCIA</th>
                  <th style={{ width: '8mm' }}>ATR</th>
                  <th style={{ width: '9mm' }}>MOD</th>
                  <th style={{ width: '7mm' }}>PRF</th>
                  <th style={{ width: '9mm' }}>B.ITEM</th>
                  <th style={{ width: '9mm' }}>B.ESP</th>
                </tr>
                {dd.pericias.map((p) => (
                  <tr key={p.nome}>
                    <td>
                      <b>{p.nome}</b>
                    </td>
                    <td>{p.atributo}</td>
                    <td>
                      <b>+{p.mod}</b>
                    </td>
                    <td>{p.prof}</td>
                    <td className="pp-mini">{p.item ? `+${p.item}` : ''}</td>
                    <td className="pp-mini">{p.especial ? `+${p.especial}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {dd.especialidades.length ? (
            <div className="pp-sec">
              <div className="pp-sec-t">{'// ESPECIALIDADES & MAESTRIAS'}</div>
              {dd.especialidades.map((e) => (
                <div key={`${e.tag}-${e.nome}`} className="pp-ln">
                  <span className="pp-tag">{e.tag}</span> <b>{e.nome}</b>{' '}
                  <span className="pp-mini">({e.pericia})</span>
                  {e.resumo ? <span className="pp-rs"> — {e.resumo}</span> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div style={{ flex: 1 }}>
          <div className="pp-sec">
            <div className="pp-sec-t">
              {'// ATAQUES & MANOBRAS · PROFICIÊNCIA '}
              {PROF_NOME[dd.atkProf].toUpperCase()}
            </div>
            <table>
              <tbody>
                <tr>
                  <th style={{ width: '26mm' }}>ARMA</th>
                  <th style={{ width: '9mm' }}>ATAQUE</th>
                  <th style={{ width: '18mm' }}>DANO</th>
                  <th style={{ width: '26mm' }}>CATEGORIA / IMBUIÇÃO</th>
                  <th>PROPRIEDADES</th>
                </tr>
                {dd.ataques.map((a) => (
                  <tr key={a.nome}>
                    <td>
                      <b>{a.nome}</b>
                    </td>
                    <td>
                      <b>{a.mod}</b>
                    </td>
                    <td>{a.dano}</td>
                    <td className="pp-mini">{a.categoria}</td>
                    <td className="pp-mini">{a.propriedades}</td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <b>Manobras</b>
                  </td>
                  <td>
                    <b>+{dd.manobrasMod}</b>
                  </td>
                  <td colSpan={3} className="pp-mini">
                    Agarrar · Derrubar · Empurrar · Escapar
                  </td>
                </tr>
                {[0, 1].map((i) => (
                  <tr key={`v${i}`}>
                    <td style={{ height: '3.6mm' }}>&nbsp;</td>
                    <td />
                    <td />
                    <td />
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {dd.acoes.length ? (
            <div className="pp-sec">
              <div className="pp-sec-t">{'// AÇÕES DE HABILIDADE'}</div>
              {dd.acoes.map((a) => (
                <Linha key={a.nome} it={a} />
              ))}
            </div>
          ) : null}
          {dd.escolas.length || dd.energiaMagica ? (
            <div className="pp-sec">
              <div className="pp-sec-t">
                {'// MAGIAS · POTÊNCIA '}
                {dd.potencia}{' '}
                <span className="pp-mini">custo EM: Adepta 2 · Experiente 3 · Mestre 5</span>
              </div>
              <div className="pp-kv" style={{ margin: '.8mm 0 1.2mm' }}>
                <b>ENERGIA MÁGICA</b> <Losangos n={dd.energiaMagica} />
              </div>
              {dd.escolas.map((e) => (
                <div key={e.nome}>
                  <div className="pp-kv">
                    <b>
                      {e.nome.toUpperCase()} · {PROF_NOME[e.prof].toUpperCase()}
                    </b>
                  </div>
                  {e.grupos.map((g) => (
                    <div key={g.rank}>
                      <div className="pp-rank-h">{g.rank}</div>
                      {g.magias.map((m) => (
                        <Linha key={m.nome} it={m} />
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="pp-flex2" style={{ gap: '4mm' }}>
        <div style={{ flex: 1.4 }}>
          <div className="pp-sec-t">{'// CONDIÇÕES'}</div>
          {dd.condicoes.map((c) => (
            <span key={c} className="pp-chk">
              {c}
            </span>
          ))}
        </div>
        <div style={{ flex: 1 }}>
          <div className="pp-sec-t">{'// EFEITOS ATIVOS'}</div>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="pp-linha-v" />
          ))}
        </div>
      </div>
    </div>
  )
}

function Pagina2({ dd, nome }: { dd: DadosPapel; nome: string }) {
  const id = dd.identidade
  const listas: [string, string[]][] = [
    ['IDEAIS', id.ideais],
    ['DESPREZOS', id.desprezos],
    ['QUALIDADES', id.qualidades],
    ['DEFEITOS', id.defeitos],
  ]
  const alvoLinhas = Math.max(...listas.map(([, v]) => v.length)) + 1
  const inv = dd.inventario
  return (
    <div className="pp-page">
      <div className="pp-hdr">
        <span className="pp-nome">{nome}</span>
        <span className="pp-classe">{dd.classe}</span>
        <span className="pp-nvl">
          <b>{dd.nivel}</b>
          <span>NÍVEL</span>
        </span>
      </div>
      <div className="pp-flex2" style={{ gap: '4mm' }}>
        <div style={{ flex: 1 }}>
          <div className="pp-sec">
            <div className="pp-sec-t">{'// ATRIBUTOS'}</div>
            <div className="pp-row">
              {dd.atributos.map((a) => (
                <span key={a.sigla} className="pp-box pp-stat">
                  <i>{a.valor}</i>
                  <b>{a.sigla}</b>
                </span>
              ))}
            </div>
          </div>
          <div className="pp-sec">
            <div className="pp-sec-t">{'// IDENTIDADE'}</div>
            <div className="pp-kv2">
              {(
                [
                  ['PASSADO', id.passado],
                  ['MOTIVAÇÃO', id.motivacao],
                  ['NATURALIDADE', id.naturalidade],
                  ['SINTONIA', `${dd.sintonia}${dd.tamanho ? ` · ${dd.tamanho}` : ''}`],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="pp-id-campo">
                  <div className="pp-id-t">{k}</div>
                  <div className="pp-id-v">{v || ' '}</div>
                </div>
              ))}
            </div>
            <div className="pp-kv4" style={{ marginTop: '.8mm' }}>
              {(
                [
                  ['GÊNERO', id.genero],
                  ['IDADE', id.idade],
                  ['ALTURA', id.altura],
                  ['PESO', id.peso],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="pp-id-campo">
                  <div className="pp-id-t">{k}</div>
                  <div className="pp-id-v">{v || ' '}</div>
                </div>
              ))}
            </div>
            <div className="pp-kv2" style={{ marginTop: '.8mm' }}>
              {listas.map(([titulo, itens]) => (
                <div key={titulo} style={{ minWidth: 0 }}>
                  <div className="pp-id-bloco">
                    <div className="pp-id-t">{titulo}</div>
                    {itens.map((i) => (
                      <CelulaFixa key={i} texto={i} />
                    ))}
                    {Array.from({ length: alvoLinhas - itens.length }, (_, i) => (
                      <div key={`v${i}`} className="pp-id-item">
                        <span>&nbsp;</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {dd.oficios.length ? (
            <div className="pp-sec">
              <div className="pp-sec-t">{'// OFÍCIOS'}</div>
              {dd.oficios.map((o) => (
                <div key={o.rotulo + o.complemento} className="pp-kv">
                  <b>{o.rotulo}</b> {o.complemento} — {PROF_NOME[o.prof]} (<b>+{o.mod}</b>)
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div style={{ flex: 1 }}>
          {dd.tecnicas.length ? (
            <div className="pp-sec">
              <div className="pp-sec-t">{'// TÉCNICAS'}</div>
              {dd.tecnicas.map((t) => (
                <Linha key={t.nome} it={t} />
              ))}
            </div>
          ) : null}
        </div>
        <div style={{ flex: 1 }}>
          <div className="pp-sec">
            <div className="pp-sec-t">
              {'// INVENTÁRIO '}
              <span className="pp-mini">(itens viram cartas; acrescente a lápis)</span>
            </div>
            <div className="pp-ouro">
              <b>OURO</b>
              <span className="pp-ouro-linha" />
            </div>
            <table className="pp-cons">
              <tbody>
                <tr>
                  <th>CONSUMÍVEL</th>
                  <th className="q">A</th>
                  <th className="q">E</th>
                  <th className="q">M</th>
                </tr>
                {inv.consumiveisCatalogo.map((c) => (
                  <tr key={c}>
                    <td>
                      <b>{c}</b>
                    </td>
                    <td className="q" />
                    <td className="q" />
                    <td className="q" />
                  </tr>
                ))}
                <tr>
                  <td style={{ height: '3.6mm' }}>&nbsp;</td>
                  <td className="q" />
                  <td className="q" />
                  <td className="q" />
                </tr>
              </tbody>
            </table>
            <div className="pp-rank-h" style={{ marginTop: '2.2mm' }}>
              ARMADURA
            </div>
            <div className="pp-ln">
              <b>{inv.armadura.nome || '—'}</b>
              <span className="pp-rs">
                {inv.armadura.categoria ? ` — ${inv.armadura.categoria}` : ''}
                {inv.armadura.propriedade ? ` · ${inv.armadura.propriedade}` : ''}
              </span>
            </div>
            {dd.escudo ? (
              <div className="pp-ln">
                <b>{dd.escudo.nome}</b> <span className="pp-rs">(escudo)</span>
              </div>
            ) : null}
            <div className="pp-mini" style={{ margin: '.3mm 0 0 1mm' }}>
              Proficiência: Sem {inv.armadura.prof.sem ? '✔' : '—'} · Leve{' '}
              {inv.armadura.prof.leve ? '✔' : '—'} · Pesada {inv.armadura.prof.pesada ? '✔' : '—'}
            </div>
            <div className="pp-rank-h" style={{ marginTop: '1.4mm' }}>
              ARMAS
            </div>
            {inv.armas.map((a) => (
              <div key={a.nome} className="pp-ln">
                <b>{a.nome}</b>
                <span className="pp-rs">{a.categoria ? ` — ${a.categoria}` : ''}</span>
              </div>
            ))}
            <div className="pp-rank-h" style={{ marginTop: '1.4mm' }}>
              TESOUROS
            </div>
            {inv.tesouros.map((t) => (
              <div key={t.nome} className="pp-ln">
                <b>{t.nome}</b> {t.usos ? <Bolinhas n={t.usos} /> : null}
              </div>
            ))}
            <table style={{ marginTop: '1mm' }}>
              <tbody>
                {[0, 1].map((i) => (
                  <tr key={i}>
                    <td style={{ height: '3.6mm' }}>&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {dd.habilidades.length ? (
        <div className="pp-sec">
          <div className="pp-sec-t">{'// HABILIDADES'}</div>
          <div className="pp-cols4">
            {dd.habilidades.map((h) => (
              <Linha key={h.nome} it={h} />
            ))}
          </div>
        </div>
      ) : null}
      <div className="pp-flex2" style={{ gap: '4mm', flex: 1, minHeight: '10mm' }}>
        <div style={{ flex: 1 }}>
          <div className="pp-sec-t">{'// MARCAS'}</div>
          {dd.marcas.map((m, i) => (
            <div key={i} className="pp-ln">
              <b>{m.qtd} marcas</b>
              <span className="pp-rs"> — {m.texto}</span>
            </div>
          ))}
          {[0, 1, 2].map((i) => (
            <div key={`v${i}`} className="pp-linha-v" />
          ))}
        </div>
        <div style={{ flex: 0.8 }}>
          <div className="pp-sec-t">{'// RECONHECIMENTOS'}</div>
          {dd.reconhecimentos.map((r, i) => (
            <div key={i} className="pp-ln">
              <b>{r.entidade}</b>
              <span className="pp-rs"> — {r.texto}</span>
            </div>
          ))}
          {[0, 1, 2].map((i) => (
            <div key={`v${i}`} className="pp-linha-v" />
          ))}
        </div>
        <div className="pp-fill" style={{ flex: 1 }}>
          <div className="pp-sec-t">{'// ANOTAÇÕES'}</div>
          <div className="pp-linhas">
            {[0, 1, 2].map((i) => (
              <div key={i} className="pp-linha-v" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function FichaPapelPage() {
  const params = useParams()
  const id = params['*'] ?? ''
  const navigate = useNavigate()
  const catalog = useCatalog()
  const { doc, error } = useDoc(id)
  const model = useHeroModel(doc ?? STUB_DOC, 'papel')
  const rules = useHeroRules(model.fm)
  const derivado = (rules?.derivedFm ?? model.fm) as Record<string, unknown>

  // Docs referenciados (resumos/dano/rank/usos) — resolve por basename.
  const refIds = useMemo(() => {
    const ids = new Set<string>()
    for (const nome of nomesReferenciados(derivado)) {
      const r = catalog.resolve(nome)
      if (r.kind === 'doc') ids.add(r.id)
    }
    return [...ids]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, rules])
  const refDocs = useDocs(refIds)
  const porNome = useMemo(() => {
    const m = new Map<string, VaultDoc>()
    for (const d of refDocs?.values() ?? []) if (d) m.set(d.basename, d)
    return m
  }, [refDocs])

  const condicoes = useMemo(
    () =>
      catalog.content
        .filter((e) => e.subtype === 'Condição' && e.basename !== 'Vantagem de Combate')
        .map((e) => e.basename ?? '')
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'pt')),
    [catalog],
  )
  const consumiveisCatalogo = useMemo(
    () =>
      catalog.content
        .filter((e) => e.path.startsWith('Sistema/Equipamento/Tesouros/Consumíveis/'))
        .map((e) => e.basename ?? '')
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'pt')),
    [catalog],
  )

  const dd = useMemo(
    () =>
      montarDadosPapel(derivado, (nome) => porNome.get(baseDoItem(nome)), condicoes, consumiveisCatalogo),
    [derivado, porNome, condicoes, consumiveisCatalogo],
  )

  if (error) return <p role="alert">Ficha não encontrada: {id}</p>
  if (!doc || !rules) return <p className="loading">Preparando a ficha…</p>
  const nome = str(model.fm['nome']).trim() || doc.basename

  return (
    <div className="pp-root">
      <style>{PAPEL_CSS}</style>
      <div className="pp-bar">
        <button onClick={() => navigate(-1)}>← VOLTAR</button>
        <button className="pp-primario" onClick={() => window.print()}>
          🖨 IMPRIMIR / SALVAR PDF
        </button>
      </div>
      <Pagina1 dd={dd} nome={nome} />
      <Pagina2 dd={dd} nome={nome} />
    </div>
  )
}

// Stub pros hooks enquanto o doc carrega (idioma do use-pending-tabs).
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


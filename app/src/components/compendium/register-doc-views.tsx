// BARREL de registro dos visualizadores de doc (#243) — importa cada módulo
// de view pelo SIDE-EFFECT (registerDocView no topo do módulo). Cada fase
// (F1 Item, F3 Organização/História, …) adiciona UMA linha aqui + cria seu
// arquivo — sem tocar o DocView nem as outras views (colisão mínima).
import { registerDocView } from './doc-view-registry'
import { LocationSheet, isLocation } from './LocationSheet'
import { OrgView, isOrg } from './OrgView'
import { HistoriaView, isHistoria } from './HistoriaView'
import { CriacaoView, isCriacao } from './CriacaoView'
import { RegraView, isRegra } from './RegraView'
// F1 (#245) — Item: carta grande no doc + grade de cartas na folha; o módulo
// registra por side-effect tanto o doc-view 'item' quanto o leaf-view 'Item'.
import './ItemView'
// F5 (#249) — Combate: roster + dificuldade no doc + grade na folha; o módulo
// registra por side-effect o doc-view 'combate' e o leaf-view 'Combate'.
import './CombateView'
// F4 (#248) — Aventura: carta de bounty (título/rank/subcat/recompensa/
// objetivos) no doc + grade de cartas na folha Campanhas/Aventuras; registra
// por side-effect o doc-view 'aventura' e o leaf-view 'Aventura'.
import './AventuraView'

// Localização (#66) — ficha com abas + Hexploração.
registerDocView({
  id: 'localizacao',
  match: isLocation,
  view: (doc, { sidebar, embedded }) => <LocationSheet doc={doc} sidebar={sidebar} embedded={embedded} />,
})

// F3 (#247) — Organização: leitura bonita das infos (cards).
registerDocView({
  id: 'organizacao',
  match: isOrg,
  view: (doc, { sidebar, embedded }) => <OrgView doc={doc} sidebar={sidebar} embedded={embedded} />,
})

// F3 (#247) — História / Contexto (Atual + Histórico): corpo em coluna de leitura.
registerDocView({
  id: 'historia',
  match: isHistoria,
  view: (doc, { sidebar, embedded }) => <HistoriaView doc={doc} sidebar={sidebar} embedded={embedded} />,
})

// F2 (#246) — Criação de Personagem por SUBTIPO (Magia/Técnica/Habilidade/
// Classe/Sintonia): identidade visual + chips dos campos-chave + resumo.
registerDocView({
  id: 'criacao',
  match: isCriacao,
  view: (doc, { sidebar, embedded }) => <CriacaoView doc={doc} sidebar={sidebar} embedded={embedded} />,
})

// F2 (#246) — Regra (Sistema/Regras): leitura amigável + elementos de regra.
registerDocView({
  id: 'regra',
  match: isRegra,
  view: (doc, { sidebar, embedded }) => <RegraView doc={doc} sidebar={sidebar} embedded={embedded} />,
})

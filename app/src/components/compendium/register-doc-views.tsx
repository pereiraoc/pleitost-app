// BARREL de registro dos visualizadores de doc (#243) — importa cada módulo
// de view pelo SIDE-EFFECT (registerDocView no topo do módulo). Cada fase
// (F1 Item, F3 Organização/História, …) adiciona UMA linha aqui + cria seu
// arquivo — sem tocar o DocView nem as outras views (colisão mínima).
import { registerDocView } from './doc-view-registry'
import { LocationSheet, isLocation } from './LocationSheet'
import { OrgView, isOrg } from './OrgView'
import { HistoriaView, isHistoria } from './HistoriaView'

// Localização (#66) — ficha com abas + Hexploração.
registerDocView({
  id: 'localizacao',
  match: isLocation,
  view: (doc, { sidebar }) => <LocationSheet doc={doc} sidebar={sidebar} />,
})

// F3 (#247) — Organização: leitura bonita das infos (cards).
registerDocView({
  id: 'organizacao',
  match: isOrg,
  view: (doc, { sidebar }) => <OrgView doc={doc} sidebar={sidebar} />,
})

// F3 (#247) — História / Contexto (Atual + Histórico): corpo em coluna de leitura.
registerDocView({
  id: 'historia',
  match: isHistoria,
  view: (doc, { sidebar }) => <HistoriaView doc={doc} sidebar={sidebar} />,
})

// F1 (#245): import './ItemView'

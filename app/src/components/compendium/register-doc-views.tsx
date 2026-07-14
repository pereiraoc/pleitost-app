// BARREL de registro dos visualizadores de doc (#243) — importa cada módulo
// de view pelo SIDE-EFFECT (registerDocView no topo do módulo). Cada fase
// (F1 Item, F3 Organização/História, …) adiciona UMA linha aqui + cria seu
// arquivo — sem tocar o DocView nem as outras views (colisão mínima).
import { registerDocView } from './doc-view-registry'
import { LocationSheet, isLocation } from './LocationSheet'

// Localização (#66) — ficha com abas + Hexploração.
registerDocView({
  id: 'localizacao',
  match: isLocation,
  view: (doc, { sidebar }) => <LocationSheet doc={doc} sidebar={sidebar} />,
})

// F1 (#245): import './ItemView'
// F3 (#247): import './OrgView' ; import './HistoriaView'

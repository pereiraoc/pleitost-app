import { useCatalog } from '../../data/CatalogContext'
import { DocTable } from '../compendium/DocTable'
import { LIST_COLUMNS } from '../compendium/list-columns'

// As criaturas vivem fora do compêndio (decisão do usuário, 2026-07-04):
// HERÓIS = Sistema/Criaturas/Heróis; NPCS = demais subpastas de
// Sistema/Criaturas (Bestiário, Companheiros Animais, ...), direto da vault.
const CRIATURAS_FOLDER = 'Sistema/Criaturas'
const HEROIS_FOLDER = 'Sistema/Criaturas/Heróis'

const columns = LIST_COLUMNS['Criatura']

export function HeroisPage() {
  const catalog = useCatalog()
  const node = catalog.folderByPath.get(HEROIS_FOLDER)
  if (!node) return <p>Nenhum herói encontrado na vault.</p>
  return (
    <section className="page">
      <h1>{node.name}</h1>
      <DocTable entries={node.docs} columns={columns} />
    </section>
  )
}

export function NpcsPage() {
  const catalog = useCatalog()
  const criaturas = catalog.folderByPath.get(CRIATURAS_FOLDER)
  const groups = criaturas?.folders.filter((f) => f.path !== HEROIS_FOLDER) ?? []
  if (!groups.length) return <p>Nenhuma criatura encontrada na vault.</p>
  return (
    <section className="page">
      {groups.map((group) => (
        <section key={group.path}>
          <h1>{group.name}</h1>
          <DocTable entries={group.docs} columns={columns} />
        </section>
      ))}
    </section>
  )
}

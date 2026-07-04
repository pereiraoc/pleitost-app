import { Link } from 'react-router-dom'
import { useCatalog } from '../../data/CatalogContext'
import { emojis } from '../../generated/tokens'
import { compendiumTypePath } from '../../paths'

export function TypeGrid() {
  const { manifest } = useCatalog()
  // maiores coleções primeiro
  const types = Object.entries(manifest.byType).sort((a, b) => b[1] - a[1])

  return (
    <section className="type-grid">
      {types.map(([type, count]) => {
        // emoji só quando o tipo existe no registro central (match exato)
        const emoji = (emojis.categoria as Record<string, string>)[type]
        return (
          <Link key={type} to={compendiumTypePath(type)} className="type-card">
            {emoji ? (
              <span className="type-card-emoji" aria-hidden>
                {emoji}
              </span>
            ) : null}
            <span className="type-card-name">{type}</span>
            <span className="type-card-count">{count}</span>
          </Link>
        )
      })}
    </section>
  )
}

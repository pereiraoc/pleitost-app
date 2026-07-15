// Bloco ```class-roles``` (#276) — papéis de combate de uma classe, espelhando o
// visual do pleitost-views (render-class-roles.ts + role-token.ts): uma caixa
// arredondada, cada BUILD numa linha (nome à esquerda; tokens de papel à direita,
// 2 no topo + resto embaixo), cada papel com ★×peso na cor do papel. Antes o app
// não conhecia a fence → o JSON cru vazava num <pre> (feio). Vars Obsidian
// mapeadas pros tokens do app; cores dos papéis são a fonte de verdade (role-meta).
import type { FenceProps } from '../fence-registry'
import { ROLE_META, type RoleName } from './role-meta'
import { parseClassRolesSource, type Build } from './parse'

const box: React.CSSProperties = {
  width: 'min(460px, 100%)',
  margin: '4px 0 14px',
  padding: '10px 12px',
  border: '1px solid var(--line2)',
  borderRadius: 12,
  background: 'var(--panel)',
  fontSize: '.95em',
  lineHeight: 1.45,
  boxSizing: 'border-box',
}

/** Token de um papel: nome + ★ repetido pelo peso, na cor do papel; título nativo
 *  com a descrição (fonte de verdade role-meta). */
function RoleToken({ role, value }: { role: RoleName; value: number }) {
  const meta = ROLE_META[role]
  return (
    <span
      title={`${role} — ${meta.desc}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        whiteSpace: 'nowrap',
        cursor: 'help',
        borderRadius: 6,
        padding: '1px 2px',
      }}
    >
      <span>{role}</span>
      <span style={{ color: meta.color, letterSpacing: '1px' }}>{'★'.repeat(value)}</span>
    </span>
  )
}

function Row({ build, index }: { build: Build; index: number }) {
  const [name, roles] = build
  const tokens = (Object.entries(roles) as [RoleName, number][]).map(([role, value]) => (
    <RoleToken key={role} role={role} value={value} />
  ))
  const top = tokens.slice(0, 2)
  const bottom = tokens.slice(2)
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
        padding: index === 0 ? '2px 0 6px' : '8px 0 6px',
        borderTop: index === 0 ? 'none' : '1px solid var(--line)',
      }}
    >
      <span style={{ fontWeight: 700 }}>{name}</span>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
        <span style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>{top}</span>
        {bottom.length ? (
          <span style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>{bottom}</span>
        ) : null}
      </span>
    </div>
  )
}

export function ClassRolesFence({ code }: FenceProps) {
  let builds: Build[]
  try {
    builds = parseClassRolesSource(code)
  } catch (err) {
    return <pre className="fence-class-roles">{err instanceof Error ? err.message : String(err)}</pre>
  }
  if (!builds.length) return null
  return (
    <div className="class-roles" style={box}>
      {builds.map((build, i) => (
        <Row key={build[0]} build={build} index={i} />
      ))}
    </div>
  )
}

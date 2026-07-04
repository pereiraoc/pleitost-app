import { InlineFieldValue } from './InlineFieldValue'

/** Inline fields do doc (chave = label, direto do dado); vazios ficam de fora. */
export function InlineFieldsTable({ fields }: { fields: Record<string, string> }) {
  const entries = Object.entries(fields).filter(([, value]) => value.trim() !== '')
  if (!entries.length) return null

  return (
    <table className="inline-fields">
      <tbody>
        {entries.map(([key, value]) => (
          <tr key={key}>
            <th scope="row">{key}</th>
            <td>
              <InlineFieldValue value={value} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

import { Fragment } from 'react'
import EmptyState from './EmptyState.jsx'
import Spinner from './Spinner.jsx'

export default function DataTable({
  columns,
  rows,
  loading = false,
  emptyTitle = 'No results found',
  emptyDescription,
  rowKey = 'id',
  rowClassName,
  onRowClick,
  expandedContent,
}) {
  if (loading) return <Spinner label="Loading records" />
  if (!rows.length) return <EmptyState title={emptyTitle} description={emptyDescription} />

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px] border-collapse text-left">
        <thead>
          <tr className="border-b border-white/[0.06] bg-white/[0.015]">
            {columns.map((column) => (
              <th className={`px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500 ${column.className || ''}`} key={column.key}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {rows.map((row, index) => {
            const key = row[rowKey] ?? index
            const clickable = Boolean(onRowClick)
            const expandedRow = expandedContent?.(row)
            return (
              <Fragment key={key}>
                <tr
                  className={`${rowClassName?.(row) || ''} ${clickable ? 'cursor-pointer hover:bg-white/[0.025]' : ''}`}
                  onClick={clickable ? () => onRowClick(row) : undefined}
                  onKeyDown={clickable ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onRowClick(row)
                    }
                  } : undefined}
                  role={clickable ? 'button' : undefined}
                  tabIndex={clickable ? 0 : undefined}
                >
                  {columns.map((column) => (
                    <td className={`px-4 py-3.5 text-xs text-slate-300 ${column.cellClassName || ''}`} key={column.key}>
                      {column.render ? column.render(row, index) : row[column.key] ?? '—'}
                    </td>
                  ))}
                </tr>
                {expandedRow && (
                  <tr key={`${key}-expanded`}>
                    <td className="bg-black/10 px-4 py-4" colSpan={columns.length}>
                      {expandedRow}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

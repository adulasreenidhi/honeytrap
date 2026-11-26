import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function Pagination({ page, pageSize, total, onChange, disabled = false }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  return (
    <div className="flex flex-col gap-3 border-t border-border bg-surface-2/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <p className="text-xs text-muted tabular-nums">
        Showing <span className="font-semibold text-text">{start}–{end}</span> of <span className="font-semibold text-text">{total}</span>
      </p>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <label className="flex items-center gap-2 text-xs text-muted">
          Rows
          <select
            aria-label="Rows per page"
            className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-text focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/30"
            disabled={disabled}
            onChange={(event) => onChange(1, Number(event.target.value))}
            value={pageSize}
          >
            {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
        <span className="text-xs text-muted tabular-nums">{page} / {pageCount}</span>
        <div className="flex gap-1.5">
          <button
            aria-label="Previous page"
            className="rounded-lg border border-border bg-surface-2/80 p-1.5 text-muted hover:border-brand/40 hover:bg-elevated hover:text-text disabled:opacity-30 disabled:hover:border-border disabled:hover:bg-surface-2/80 transition-colors"
            disabled={disabled || page <= 1}
            onClick={() => onChange(page - 1, pageSize)}
            type="button"
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <button
            aria-label="Next page"
            className="rounded-lg border border-border bg-surface-2/80 p-1.5 text-muted hover:border-brand/40 hover:bg-elevated hover:text-text disabled:opacity-30 disabled:hover:border-border disabled:hover:bg-surface-2/80 transition-colors"
            disabled={disabled || page >= pageCount}
            onClick={() => onChange(page + 1, pageSize)}
            type="button"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}

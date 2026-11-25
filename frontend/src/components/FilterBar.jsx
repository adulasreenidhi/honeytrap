import { RotateCcw } from 'lucide-react'

export default function FilterBar({ filters, values, onChange, onReset }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      {filters.map((filter) => (
        <div className="min-w-[150px] flex-1 sm:flex-none" key={filter.name}>
          <label className="field-label" htmlFor={`filter-${filter.name}`}>{filter.label}</label>
          {filter.options ? (
            <select
              className="text-field mt-1.5 min-w-full py-2 text-xs"
              id={`filter-${filter.name}`}
              onChange={(event) => onChange(filter.name, event.target.value)}
              value={values[filter.name] || ''}
            >
              <option value="">All</option>
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          ) : (
            <input
              className="text-field mt-1.5 py-2 text-xs"
              id={`filter-${filter.name}`}
              onChange={(event) => onChange(filter.name, event.target.value)}
              placeholder={filter.placeholder || ''}
              type={filter.type || 'text'}
              value={values[filter.name] || ''}
            />
          )}
        </div>
      ))}
      <button className="button-secondary min-h-9 px-3 py-1.5 text-xs" onClick={onReset} type="button">
        <RotateCcw size={13} aria-hidden="true" />
        Reset
      </button>
    </div>
  )
}

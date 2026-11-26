import { Inbox } from 'lucide-react'

export default function EmptyState({ title, description, icon: Icon = Inbox }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface-2/60 text-faint">
        <Icon size={24} aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-text">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-xs leading-5 text-muted">{description}</p>}
    </div>
  )
}

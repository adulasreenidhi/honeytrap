import { Inbox } from 'lucide-react'

export default function EmptyState({ title, description, icon: Icon = Inbox }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <Icon size={28} aria-hidden="true" className="text-slate-600" />
      <h3 className="mt-3 text-sm font-medium text-slate-300">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">{description}</p>}
    </div>
  )
}

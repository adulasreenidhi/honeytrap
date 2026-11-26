import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

const icons = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Info,
}

export default function Toast() {
  const [toast, setToast] = useState(null)

  useEffect(() => {
    let timer
    const onToast = (event) => {
      window.clearTimeout(timer)
      setToast(event.detail)
      timer = window.setTimeout(() => setToast(null), 4200)
    }
    window.addEventListener('honeygate:toast', onToast)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('honeygate:toast', onToast)
    }
  }, [])

  if (!toast) return null
  const Icon = icons[toast.type] || Info
  const tone = toast.type === 'error'
    ? 'border-danger/40 text-danger shadow-[0_0_20px_rgba(239,68,68,0.25)]'
    : toast.type === 'success'
      ? 'border-success/40 text-success shadow-[0_0_20px_rgba(34,197,94,0.25)]'
      : 'border-brand/40 text-brand shadow-glow-sm'

  return (
    <div
      className={`fixed bottom-5 right-5 z-50 flex max-w-sm items-start gap-3 rounded-2xl border bg-surface/95 px-4 py-3.5 shadow-2xl backdrop-blur-md transition-all duration-300 ${tone}`}
      role="status"
      aria-live="polite"
    >
      <Icon aria-hidden="true" size={18} className="mt-0.5 shrink-0" />
      <p className="text-sm font-medium text-text">{toast.message}</p>
      <button
        type="button"
        aria-label="Dismiss notification"
        className="ml-1 rounded-lg p-0.5 text-muted hover:text-text transition-colors"
        onClick={() => setToast(null)}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  )
}

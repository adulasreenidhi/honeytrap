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
    ? 'border-critical/30 text-critical'
    : toast.type === 'success'
      ? 'border-allow/30 text-allow'
      : 'border-accent/30 text-accent'

  return (
    <div
      className={`fixed bottom-5 right-5 z-50 flex max-w-sm items-start gap-3 rounded-xl border bg-navy-900 px-4 py-3 shadow-2xl ${tone}`}
      role="status"
      aria-live="polite"
    >
      <Icon aria-hidden="true" size={18} className="mt-0.5 shrink-0" />
      <p className="text-sm text-slate-200">{toast.message}</p>
      <button
        type="button"
        aria-label="Dismiss notification"
        className="ml-1 rounded p-0.5 text-slate-500 hover:text-white"
        onClick={() => setToast(null)}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  )
}

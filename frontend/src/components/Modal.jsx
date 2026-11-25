import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

export default function Modal({ open, onClose, title, description, children, size = 'max-w-xl' }) {
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return undefined
    const previousFocus = document.activeElement
    const dialog = dialogRef.current
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    const focusFirst = () => dialog?.querySelector(focusableSelector)?.focus()
    const timer = window.setTimeout(focusFirst, 0)

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
      }
      if (event.key !== 'Tab' || !dialog) return
      const focusable = [...dialog.querySelectorAll(focusableSelector)]
      if (!focusable.length) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    document.body.classList.add('overflow-hidden')
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('keydown', onKeyDown)
      document.body.classList.remove('overflow-hidden')
      previousFocus?.focus?.()
    }
  }, [open])

  if (!open) return null
  const titleId = 'modal-title'
  const descriptionId = description ? 'modal-description' : undefined

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`my-auto w-full ${size} rounded-2xl border border-white/10 bg-navy-900 shadow-2xl`}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-base font-semibold text-white" id={titleId}>{title}</h2>
            {description && <p className="mt-1 text-xs leading-5 text-slate-400" id={descriptionId}>{description}</p>}
          </div>
          <button aria-label="Close dialog" className="rounded-md p-1.5 text-slate-500 hover:bg-white/[0.05] hover:text-white" onClick={onClose} type="button">
            <X size={17} aria-hidden="true" />
          </button>
        </header>
        <div className="max-h-[calc(100vh-9rem)] overflow-y-auto p-5 sm:p-6">{children}</div>
      </section>
    </div>
  )
}

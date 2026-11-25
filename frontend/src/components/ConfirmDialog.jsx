import Modal from './Modal.jsx'

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Confirm action',
  description,
  confirmLabel = 'Confirm',
  busy = false,
  tone = 'danger',
}) {
  const confirmClass = tone === 'danger'
    ? 'button-primary bg-critical hover:bg-red-500'
    : 'button-primary'
  return (
    <Modal open={open} onClose={onClose} title={title} description={description} size="max-w-md">
      <div className="flex justify-end gap-2">
        <button className="button-secondary" disabled={busy} onClick={onClose} type="button">Cancel</button>
        <button className={confirmClass} disabled={busy} onClick={onConfirm} type="button">
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

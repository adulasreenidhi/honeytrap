import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { createDecoy, deleteDecoy, listDecoys, updateDecoy } from '../../api/client.js'
import ConfirmDialog from '../../components/ConfirmDialog.jsx'
import DataTable from '../../components/DataTable.jsx'
import FormField from '../../components/FormField.jsx'
import Layout from '../../components/Layout.jsx'
import Modal from '../../components/Modal.jsx'
import SeverityBadge from '../../components/SeverityBadge.jsx'
import { notify } from '../../utils/notify.js'

const typeOptions = [
  { value: 'document', label: 'Document' },
  { value: 'finance', label: 'Finance' },
  { value: 'project', label: 'Project' },
  { value: 'admin', label: 'Admin' },
  { value: 'credential', label: 'Credential' },
]
const sensitivityOptions = ['low', 'medium', 'high', 'critical'].map((value) => ({ value, label: value }))
const decoyTypes = ['honeytoken', 'password_backup', 'fake_salary_sheet', 'db_credentials', 'decoy_record'].map((value) => ({ value, label: value.replaceAll('_', ' ') }))
const emptyDecoy = { name: '', type: 'document', department: '', sensitivity: 'medium', content: '', decoy_type: 'honeytoken' }

export default function Decoys() {
  const [decoys, setDecoys] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyDecoy)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let active = true
    listDecoys()
      .then((data) => { if (active) setDecoys(data) })
      .catch((error) => { if (active) notify(error.detail || error.error || 'Unable to load decoys.', 'error') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  function openCreate() {
    setEditing(null)
    setForm(emptyDecoy)
    setFormError('')
    setModalOpen(true)
  }

  function openEdit(decoy) {
    setEditing(decoy)
    setForm({
      name: decoy.name,
      type: decoy.type,
      department: decoy.department,
      sensitivity: decoy.sensitivity,
      content: decoy.content || '',
      decoy_type: decoy.decoy_type || 'honeytoken',
    })
    setFormError('')
    setModalOpen(true)
  }

  function setField(name, value) {
    setForm((current) => ({ ...current, [name]: value }))
    setFormError('')
  }

  async function saveDecoy(event) {
    event.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      if (editing) await updateDecoy(editing.id, form)
      else await createDecoy(form)
      setModalOpen(false)
      notify(editing ? 'Decoy updated.' : 'Decoy created.', 'success')
      setDecoys(await listDecoys())
    } catch (error) {
      setFormError(error.detail || error.error || 'Unable to save decoy.')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteDecoy(deleteTarget.id)
      setDecoys((current) => current.filter((decoy) => decoy.id !== deleteTarget.id))
      setDeleteTarget(null)
      notify('Decoy deleted.', 'success')
    } catch (error) {
      notify(error.detail || error.error || 'Unable to delete decoy.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const columns = [
    {
      key: 'name',
      header: 'Resource',
      render: (decoy) => (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-200">{decoy.name}</span>
          <span className="rounded-full bg-critical/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-red-300">Decoy</span>
        </div>
      ),
    },
    { key: 'department', header: 'Department' },
    { key: 'type', header: 'Type', render: (decoy) => <span className="capitalize">{decoy.type}</span> },
    { key: 'sensitivity', header: 'Sensitivity', render: (decoy) => <SeverityBadge value={decoy.sensitivity} /> },
    { key: 'decoy_type', header: 'Decoy type', render: (decoy) => <span className="rounded-full bg-critical/10 px-2.5 py-1 text-[10px] font-semibold text-red-300">{decoy.decoy_type}</span> },
    {
      key: 'actions',
      header: 'Actions',
      render: (decoy) => (
        <div className="flex gap-1">
          <button aria-label={`Edit ${decoy.name}`} className="rounded-md p-2 text-slate-400 hover:bg-white/[0.05] hover:text-blue-300" onClick={() => openEdit(decoy)} type="button"><Pencil size={14} /></button>
          <button aria-label={`Delete ${decoy.name}`} className="rounded-md p-2 text-slate-400 hover:bg-critical/10 hover:text-critical" onClick={() => setDeleteTarget(decoy)} type="button"><Trash2 size={14} /></button>
        </div>
      ),
    },
  ]

  return (
    <Layout>
      <div className="space-y-6">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">MANAGE DECEPTION</p>
            <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Decoys</h1>
            <p className="mt-2 text-sm text-slate-400">Manage the synthetic resources used by the local demonstration.</p>
          </div>
          <button className="button-primary" onClick={openCreate} type="button"><Plus size={16} />Create decoy</button>
        </section>

        <div className="space-y-3 rounded-xl border border-warning/25 bg-warning/[0.05] p-4 text-sm">
          <p className="font-medium text-amber-200">Decoys must contain harmless dummy data only</p>
          <p className="text-xs leading-5 text-amber-100/70">Employees see decoys as normal files. Do not enter real credentials, personal information, or operational data.</p>
        </div>

        <section className="surface overflow-hidden">
          <div className="border-b border-white/[0.06] px-5 py-4"><h2 className="text-sm font-semibold text-white">Synthetic decoy inventory</h2></div>
          <DataTable columns={columns} emptyTitle="No decoys found" loading={loading} rows={decoys} />
        </section>
      </div>

      <Modal
        description="Decoys must contain harmless dummy data only. Employees see decoys as normal files."
        onClose={() => setModalOpen(false)}
        open={modalOpen}
        title={editing ? 'Edit decoy' : 'Create decoy'}
      >
        <form className="space-y-4" onSubmit={saveDecoy}>
          <FormField id="decoy-name" label="Name" onChange={(value) => setField('name', value)} required value={form.name} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField as="select" id="decoy-resource-type" label="Resource type" onChange={(value) => setField('type', value)} options={typeOptions} value={form.type} />
            <FormField id="decoy-department" label="Department" onChange={(value) => setField('department', value)} required value={form.department} />
            <FormField as="select" id="decoy-sensitivity" label="Sensitivity" onChange={(value) => setField('sensitivity', value)} options={sensitivityOptions} value={form.sensitivity} />
            <FormField
              as="select"
              id="decoy-type"
              label="Decoy type"
              onChange={(value) => setField('decoy_type', value)}
              options={decoyTypes.some((option) => option.value === form.decoy_type)
                ? decoyTypes
                : [...decoyTypes, { value: form.decoy_type, label: form.decoy_type.replaceAll('_', ' ') }]}
              value={form.decoy_type}
            />
          </div>
          <FormField as="textarea" hint="Use harmless synthetic placeholder content only." id="decoy-content" label="Content" onChange={(value) => setField('content', value)} value={form.content} />
          {formError && <p className="rounded-lg border border-critical/25 bg-critical/[0.06] px-3 py-2.5 text-xs text-red-300" role="alert">{formError}</p>}
          <div className="flex justify-end gap-2 pt-2"><button className="button-secondary" disabled={saving} onClick={() => setModalOpen(false)} type="button">Cancel</button><button className="button-primary" disabled={saving} type="submit">{saving ? 'Saving…' : editing ? 'Save changes' : 'Create decoy'}</button></div>
        </form>
      </Modal>

      <ConfirmDialog
        busy={deleting}
        confirmLabel="Delete decoy"
        description={`Delete ${deleteTarget?.name || 'this decoy'}?`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        open={Boolean(deleteTarget)}
        title="Delete decoy"
      />
    </Layout>
  )
}

import { useEffect, useState } from 'react'
import { Database, Pencil, Plus, ShieldAlert, Trash2, Zap } from 'lucide-react'
import { createDecoy, deleteDecoy, listDecoys, updateDecoy } from '../../api/client.js'
import ConfirmDialog from '../../components/ConfirmDialog.jsx'
import DataTable from '../../components/DataTable.jsx'
import FormField from '../../components/FormField.jsx'
import Layout from '../../components/Layout.jsx'
import Modal from '../../components/Modal.jsx'
import SeverityBadge from '../../components/SeverityBadge.jsx'
import StatCard from '../../components/StatCard.jsx'
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
      notify(editing ? 'Honeytoken updated.' : 'Honeytoken created.', 'success')
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
      notify('Honeytoken deleted.', 'success')
    } catch (error) {
      notify(error.detail || error.error || 'Unable to delete decoy.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  // Summary Metrics computed from returned decoys
  const totalCount = decoys.length
  const activeCount = decoys.filter((d) => d.is_decoy !== false).length
  const triggeredCount = decoys.filter((d) => d.triggered || d.last_triggered).length

  const columns = [
    {
      key: 'name',
      header: 'Honeytoken Resource',
      render: (decoy) => (
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-brand/30 bg-brand/10 text-brand">
            <Database size={13} aria-hidden="true" />
          </span>
          <div>
            <span className="font-bold text-text text-xs sm:text-sm block">{decoy.name}</span>
            <span className="text-[10px] text-faint font-mono">{decoy.department}</span>
          </div>
          <span className="rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-danger ml-1">
            Decoy
          </span>
        </div>
      ),
    },
    { key: 'type', header: 'Asset Type', render: (decoy) => <span className="capitalize text-muted text-xs">{decoy.type}</span> },
    { key: 'sensitivity', header: 'Sensitivity', render: (decoy) => <SeverityBadge value={decoy.sensitivity} /> },
    {
      key: 'decoy_type',
      header: 'Deception Type',
      render: (decoy) => (
        <span className="rounded-full border border-brand/30 bg-brand/10 px-2.5 py-0.5 text-[10px] font-semibold text-brand-light">
          {decoy.decoy_type}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: () => (
        <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-success">
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          Active
        </span>
      ),
    },
    {
      key: 'last_triggered',
      header: 'Last Triggered',
      render: (decoy) => (
        <span className="text-xs text-faint">
          {decoy.last_triggered ? String(decoy.last_triggered) : 'Never'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (decoy) => (
        <div className="flex gap-1 justify-end">
          <button
            aria-label={`Edit ${decoy.name}`}
            className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-brand-light transition-colors"
            onClick={() => openEdit(decoy)}
            type="button"
          >
            <Pencil size={14} />
          </button>
          <button
            aria-label={`Delete ${decoy.name}`}
            className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger transition-colors"
            onClick={() => setDeleteTarget(decoy)}
            type="button"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ]

  return (
    <Layout>
      <div className="space-y-6">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">CYBER DECEPTION & HONEYTOKENS</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-text sm:text-3xl">Honeytokens</h1>
            <p className="mt-1 text-sm text-muted">Deploy and monitor high-fidelity trap assets across simulated file systems.</p>
          </div>
          <button className="btn-primary button-primary shadow-glow-sm" onClick={openCreate} type="button">
            <Plus size={16} />Deploy honeytoken
          </button>
        </section>

        {/* Honeytoken Summary Cards */}
        <section className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Total honeytokens" value={totalCount} icon={Database} />
          <StatCard label="Active traps" value={activeCount} icon={Zap} />
          <StatCard label="Triggered alerts" value={triggeredCount} icon={ShieldAlert} />
        </section>

        {/* Warning Banner: Employees see decoys as normal files */}
        <div className="space-y-1.5 rounded-2xl border border-warning/30 bg-warning/[0.08] p-4 text-sm backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="text-warning shrink-0" aria-hidden="true" />
            <p className="font-bold text-warning">Decoys must contain harmless dummy data only</p>
          </div>
          <p className="text-xs leading-5 text-warning/80 pl-6">
            Employees see decoys as normal corporate files. Do not enter real credentials, personal information, or operational data.
          </p>
        </div>

        {/* Honeytoken Table */}
        <section className="card overflow-hidden">
          <div className="border-b border-border bg-surface-2/40 px-5 py-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-text">Active Deception Inventory</h2>
            <span className="text-xs text-muted tabular-nums">{totalCount} honeytokens deployed</span>
          </div>
          <DataTable columns={columns} emptyTitle="No honeytokens found" loading={loading} rows={decoys} />
        </section>
      </div>

      <Modal
        description="Decoys must contain harmless dummy data only. Employees see decoys as normal files."
        onClose={() => setModalOpen(false)}
        open={modalOpen}
        title={editing ? 'Edit honeytoken' : 'Deploy new honeytoken'}
      >
        <form className="space-y-4" onSubmit={saveDecoy}>
          <FormField id="decoy-name" label="Resource name" onChange={(value) => setField('name', value)} required value={form.name} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField as="select" id="decoy-resource-type" label="Resource type" onChange={(value) => setField('type', value)} options={typeOptions} value={form.type} />
            <FormField id="decoy-department" label="Department" onChange={(value) => setField('department', value)} required value={form.department} />
            <FormField as="select" id="decoy-sensitivity" label="Sensitivity" onChange={(value) => setField('sensitivity', value)} options={sensitivityOptions} value={form.sensitivity} />
            <FormField
              as="select"
              id="decoy-type"
              label="Decoy trap type"
              onChange={(value) => setField('decoy_type', value)}
              options={decoyTypes.some((option) => option.value === form.decoy_type)
                ? decoyTypes
                : [...decoyTypes, { value: form.decoy_type, label: form.decoy_type.replaceAll('_', ' ') }]}
              value={form.decoy_type}
            />
          </div>
          <FormField as="textarea" hint="Use harmless synthetic placeholder content only." id="decoy-content" label="Synthetic content payload" onChange={(value) => setField('content', value)} value={form.content} />
          {formError && <p className="rounded-xl border border-danger/35 bg-danger/10 px-3.5 py-2.5 text-xs text-danger font-medium" role="alert">{formError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary button-secondary" disabled={saving} onClick={() => setModalOpen(false)} type="button">Cancel</button>
            <button className="btn-primary button-primary" disabled={saving} type="submit">{saving ? 'Saving…' : editing ? 'Save changes' : 'Deploy trap'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        busy={deleting}
        confirmLabel="Delete honeytoken"
        description={`Delete honeytoken trap ${deleteTarget?.name || ''}?`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        open={Boolean(deleteTarget)}
        title="Delete honeytoken"
      />
    </Layout>
  )
}

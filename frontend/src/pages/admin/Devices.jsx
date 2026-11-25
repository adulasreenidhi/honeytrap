import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { createDevice, deleteDevice, listDevices, updateDevice } from '../../api/client.js'
import ConfirmDialog from '../../components/ConfirmDialog.jsx'
import DataTable from '../../components/DataTable.jsx'
import FormField from '../../components/FormField.jsx'
import Layout from '../../components/Layout.jsx'
import Modal from '../../components/Modal.jsx'
import { notify } from '../../utils/notify.js'

const statuses = ['registered', 'unknown', 'unverified', 'revoked']
const statusStyles = {
  registered: 'bg-allow/10 text-allow ring-allow/20',
  unknown: 'bg-warning/10 text-amber-300 ring-warning/20',
  unverified: 'bg-orange-500/10 text-orange-300 ring-orange-500/20',
  revoked: 'bg-critical/10 text-red-300 ring-critical/20',
}

export default function Devices() {
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ device_id: '', label: '', status: 'unverified' })
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [pendingStatus, setPendingStatus] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    listDevices()
      .then((data) => { if (active) setDevices(data) })
      .catch((error) => { if (active) notify(error.detail || error.error || 'Unable to load devices.', 'error') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  async function changeStatus(device, status) {
    if (status === 'revoked' && device.status !== 'revoked') {
      setPendingStatus({ device, status })
      return
    }
    await saveStatus(device, status)
  }

  async function saveStatus(device, status) {
    setBusy(true)
    try {
      const updated = await updateDevice(device.id, { status })
      setDevices((current) => current.map((item) => item.id === device.id ? updated : item))
      notify(`Device status changed to ${status}.`, 'success')
      setPendingStatus(null)
    } catch (error) {
      notify(error.detail || error.error || 'Unable to update device status.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function submitDevice(event) {
    event.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      if (editing) {
        const updated = await updateDevice(editing.id, { label: form.label.trim() })
        setDevices((current) => current.map((device) => device.id === editing.id ? updated : device))
      } else {
        const created = await createDevice({ ...form, device_id: form.device_id.trim(), label: form.label.trim() })
        setDevices((current) => [...current, created])
      }
      setModalOpen(false)
      setForm({ device_id: '', label: '', status: 'unverified' })
      setEditing(null)
      notify(editing ? 'Device updated.' : 'Device created.', 'success')
    } catch (error) {
      setFormError(error.detail || error.error || 'Unable to create device.')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setBusy(true)
    try {
      await deleteDevice(pendingDelete.id)
      setDevices((current) => current.filter((device) => device.id !== pendingDelete.id))
      setPendingDelete(null)
      notify('Device deleted.', 'success')
    } catch (error) {
      notify(error.detail || error.error || 'Unable to delete device.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const columns = [
    { key: 'device_id', header: 'Device ID', render: (device) => <span className="font-mono text-slate-200">{device.device_id}</span> },
    { key: 'label', header: 'Label' },
    {
      key: 'status',
      header: 'Status',
      render: (device) => (
        <select
          aria-label={`Status for ${device.device_id}`}
          className={`rounded-full border-0 px-2.5 py-1 text-[10px] font-semibold uppercase ring-1 ring-inset ${statusStyles[device.status] || statusStyles.unverified}`}
          onChange={(event) => changeStatus(device, event.target.value)}
          value={device.status}
        >
          {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      ),
    },
    {
      key: 'delete',
      header: 'Actions',
      render: (device) => (
        <div className="flex gap-1">
          <button
            aria-label={`Edit ${device.device_id}`}
            className="rounded-md p-2 text-slate-400 hover:bg-white/[0.05] hover:text-blue-300"
            onClick={() => {
              setEditing(device)
              setForm({ device_id: device.device_id, label: device.label, status: device.status })
              setFormError('')
              setModalOpen(true)
            }}
            type="button"
          ><Pencil size={14} /></button>
          <button aria-label={`Delete ${device.device_id}`} className="rounded-md p-2 text-slate-500 hover:bg-critical/10 hover:text-critical" onClick={() => setPendingDelete(device)} type="button"><Trash2 size={14} /></button>
        </div>
      ),
    },
  ]

  return (
    <Layout>
      <div className="space-y-6">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">MANAGE ACCESS</p>
            <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Devices</h1>
            <p className="mt-2 text-sm text-slate-400">Maintain synthetic device registrations and trust status.</p>
          </div>
          <button className="button-primary" onClick={() => { setEditing(null); setForm({ device_id: '', label: '', status: 'unverified' }); setFormError(''); setModalOpen(true) }} type="button"><Plus size={16} />Add device</button>
        </section>
        <section className="surface overflow-hidden">
          <div className="border-b border-white/[0.06] px-5 py-4"><h2 className="text-sm font-semibold text-white">Device inventory</h2></div>
          <DataTable columns={columns} emptyTitle="No devices found" loading={loading} rows={devices} />
        </section>
      </div>

      <Modal description="Manage a device record in the synthetic environment." onClose={() => setModalOpen(false)} open={modalOpen} title={editing ? 'Edit device' : 'Add device'} size="max-w-md">
        <form className="space-y-4" onSubmit={submitDevice}>
          <FormField disabled={Boolean(editing)} id="device-id" label="Device ID" onChange={(value) => setForm((current) => ({ ...current, device_id: value }))} required value={form.device_id} />
          <FormField id="device-label" label="Label" onChange={(value) => setForm((current) => ({ ...current, label: value }))} required value={form.label} />
          <div>
            <span className="field-label">Status</span>
            <p className="mt-1.5 text-sm capitalize text-slate-400">
              {editing ? editing.status : 'unverified'}
              <span className="ml-2 text-[11px] text-slate-600">Change status in the inventory row.</span>
            </p>
          </div>
          {formError && <p className="text-xs text-red-300" role="alert">{formError}</p>}
          <div className="flex justify-end gap-2"><button className="button-secondary" onClick={() => setModalOpen(false)} type="button">Cancel</button><button className="button-primary" disabled={saving} type="submit">{saving ? 'Saving…' : editing ? 'Save changes' : 'Create device'}</button></div>
        </form>
      </Modal>

      <ConfirmDialog
        busy={busy}
        confirmLabel="Revoke device"
        description={`Revoke ${pendingStatus?.device.device_id}? Future sessions may be denied access.`}
        onClose={() => setPendingStatus(null)}
        onConfirm={() => saveStatus(pendingStatus.device, 'revoked')}
        open={Boolean(pendingStatus)}
        title="Confirm device revocation"
      />
      <ConfirmDialog
        busy={busy}
        confirmLabel="Delete device"
        description={`Delete device ${pendingDelete?.device_id || ''}?`}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        open={Boolean(pendingDelete)}
        title="Delete device"
      />
    </Layout>
  )
}

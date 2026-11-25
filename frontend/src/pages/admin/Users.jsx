import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import DataTable from '../../components/DataTable.jsx'
import ConfirmDialog from '../../components/ConfirmDialog.jsx'
import FormField from '../../components/FormField.jsx'
import Layout from '../../components/Layout.jsx'
import Modal from '../../components/Modal.jsx'
import { createUser, deleteUser, listUsers, updateUser } from '../../api/client.js'
import { notify } from '../../utils/notify.js'

const blankUser = { username: '', email: '', password: '', role: 'employee', department: '', status: 'active' }

function validateUser(values, editing) {
  const errors = {}
  if (values.username.trim().length < 3) errors.username = 'Username must be at least 3 characters.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) errors.email = 'Enter a valid email address.'
  if (!editing && values.password.length < 8) errors.password = 'Password must be at least 8 characters.'
  if (editing && values.password && values.password.length < 8) errors.password = 'Password must be at least 8 characters.'
  if (!values.department.trim()) errors.department = 'Department is required.'
  return errors
}

export default function Users() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [form, setForm] = useState(blankUser)
  const [formErrors, setFormErrors] = useState({})
  const [formMessage, setFormMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let active = true
    listUsers()
      .then((data) => { if (active) setUsers(data) })
      .catch((error) => { if (active) notify(error.detail || error.error || 'Unable to load users.', 'error') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  function openCreate() {
    setEditingUser(null)
    setForm(blankUser)
    setFormErrors({})
    setFormMessage('')
    setModalOpen(true)
  }

  function openEdit(user) {
    setEditingUser(user)
    setForm({ username: user.username, email: user.email, password: '', role: user.role, department: user.department, status: user.status })
    setFormErrors({})
    setFormMessage('')
    setModalOpen(true)
  }

  function changeField(name, value) {
    setForm((current) => ({ ...current, [name]: value }))
    setFormErrors((current) => ({ ...current, [name]: undefined }))
    setFormMessage('')
  }

  async function submitUser(event) {
    event.preventDefault()
    const errors = validateUser(form, Boolean(editingUser))
    setFormErrors(errors)
    if (Object.keys(errors).length) return
    setSaving(true)
    setFormMessage('')
    const payload = {
      username: form.username.trim(),
      email: form.email.trim(),
      role: form.role,
      department: form.department.trim(),
      status: form.status,
    }
    if (!editingUser || form.password) payload.password = form.password
    try {
      const savedUser = editingUser
        ? await updateUser(editingUser.id, payload)
        : await createUser(payload)
      if (editingUser && savedUser.username !== payload.username) {
        setUsers((current) => current.map((user) => user.id === savedUser.id ? savedUser : user))
        setFormMessage('The backend did not apply the requested username change. Other submitted fields were saved; revert the username to the current value.')
        return
      }
      setUsers((current) => editingUser
        ? current.map((user) => user.id === savedUser.id ? savedUser : user)
        : [...current, savedUser])
      setModalOpen(false)
      notify(editingUser ? 'User updated.' : 'User created.', 'success')
    } catch (error) {
      const message = error.detail || error.error || 'Unable to save user.'
      setFormMessage(message)
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteUser(deleteTarget.id)
      setUsers((current) => current.filter((user) => user.id !== deleteTarget.id))
      notify('User deleted.', 'success')
      setDeleteTarget(null)
    } catch (error) {
      notify(error.detail || error.error || 'Unable to delete user.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const columns = [
    { key: 'username', header: 'User', render: (user) => <span className="font-medium text-slate-200">{user.username}</span> },
    { key: 'email', header: 'Email' },
    { key: 'role', header: 'Role', render: (user) => <span className="capitalize">{user.role}</span> },
    { key: 'department', header: 'Department' },
    {
      key: 'status',
      header: 'Status',
      render: (user) => (
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${user.status === 'suspended' ? 'bg-critical/10 text-red-300' : 'bg-allow/10 text-allow'}`}>
          {user.status}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (user) => (
        <div className="flex gap-1">
          <button aria-label={`Edit ${user.username}`} className="rounded-md p-2 text-slate-400 hover:bg-white/[0.05] hover:text-blue-300" onClick={() => openEdit(user)} type="button"><Pencil size={14} /></button>
          <button aria-label={`Delete ${user.username}`} className="rounded-md p-2 text-slate-400 hover:bg-critical/10 hover:text-critical" onClick={() => setDeleteTarget(user)} type="button"><Trash2 size={14} /></button>
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
            <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Users</h1>
            <p className="mt-2 text-sm text-slate-400">Manage synthetic HoneyGate accounts and roles.</p>
          </div>
          <button className="button-primary" onClick={openCreate} type="button"><Plus size={16} />Create user</button>
        </section>

        <section className="surface overflow-hidden">
          <div className="border-b border-white/[0.06] px-5 py-4"><h2 className="text-sm font-semibold text-white">User directory</h2></div>
          <DataTable columns={columns} emptyTitle="No users found" loading={loading} rows={users} />
        </section>
      </div>

      <Modal
        description={editingUser ? 'Update the synthetic account details.' : 'Create a synthetic account for the local demo.'}
        onClose={() => setModalOpen(false)}
        open={modalOpen}
        title={editingUser ? 'Edit user' : 'Create user'}
      >
        <form className="space-y-4" onSubmit={submitUser}>
          <FormField error={formErrors.username} id="user-username" label="Username" onChange={(value) => changeField('username', value)} required value={form.username} />
          <FormField error={formErrors.email} id="user-email" label="Email" onChange={(value) => changeField('email', value)} required type="email" value={form.email} />
          <FormField error={formErrors.password} hint={editingUser ? 'Leave blank to keep the current password.' : 'Minimum 8 characters.'} id="user-password" label="Password" onChange={(value) => changeField('password', value)} required={!editingUser} type="password" value={form.password} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField as="select" id="user-role" label="Role" onChange={(value) => changeField('role', value)} options={[{ value: 'employee', label: 'Employee' }, { value: 'analyst', label: 'Analyst' }, { value: 'admin', label: 'Admin' }]} value={form.role} />
            <FormField id="user-department" label="Department" onChange={(value) => changeField('department', value)} required value={form.department} />
          </div>
          <FormField as="select" id="user-status" label="Status" onChange={(value) => changeField('status', value)} options={[{ value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }]} value={form.status} />
          {formMessage && <p className="rounded-lg border border-critical/25 bg-critical/[0.06] px-3 py-2.5 text-xs text-red-300" role="alert">{formMessage}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button className="button-secondary" disabled={saving} onClick={() => setModalOpen(false)} type="button">Cancel</button>
            <button className="button-primary" disabled={saving} type="submit">{saving ? 'Saving…' : editingUser ? 'Save changes' : 'Create user'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        busy={deleting}
        confirmLabel="Delete user"
        description={`Delete ${deleteTarget?.username || 'this user'}? This cannot be undone.`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        open={Boolean(deleteTarget)}
        title="Delete user"
      />
    </Layout>
  )
}

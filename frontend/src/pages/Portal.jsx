import { useEffect, useMemo, useRef, useState } from 'react'
import { File, FileText, FolderKanban, Search, Sheet, ShieldAlert, ShieldCheck, Lock, Unlock, ArrowRight } from 'lucide-react'
import { accessResource, accessSearch, listResources } from '../api/client.js'
import EmptyState from '../components/EmptyState.jsx'
import Layout from '../components/Layout.jsx'
import ResourceViewer from './ResourceViewer.jsx'
import SeverityBadge from '../components/SeverityBadge.jsx'
import Spinner from '../components/Spinner.jsx'
import useAuth from '../context/useAuth.js'
import { notify } from '../utils/notify.js'
import { groupResources } from '../utils/format.js'

const typeIcons = {
  document: FileText,
  finance: Sheet,
  project: FolderKanban,
  admin: ShieldAlert,
  credential: ShieldAlert,
}

function decisionFromResponse(response) {
  return response.ok === false ? response.decision : response
}

export default function Portal() {
  const { session, refreshMe } = useAuth()
  const [resources, setResources] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedResource, setSelectedResource] = useState(null)
  const [resourceDecision, setResourceDecision] = useState(null)
  const [search, setSearch] = useState('')
  const [searchDecision, setSearchDecision] = useState(null)
  const [searching, setSearching] = useState(false)
  const [openingResource, setOpeningResource] = useState(false)
  const latestAccess = useRef(0)

  const sessionStatus = String(session?.status || 'active').toLowerCase()
  const denied = sessionStatus === 'denied'
  const restricted = sessionStatus === 'restricted'
  const trustScore = session?.trust_score ?? 100

  const trustLevel = trustScore >= 80
    ? { label: 'High Trust', color: 'text-success', bg: 'bg-success/10 border-success/30' }
    : trustScore >= 50
      ? { label: 'Moderate Trust', color: 'text-warning', bg: 'bg-warning/10 border-warning/30' }
      : { label: 'Low Trust', color: 'text-danger', bg: 'bg-danger/10 border-danger/30' }

  const groups = useMemo(() => groupResources(resources), [resources])

  useEffect(() => {
    let active = true
    async function loadResources() {
      setLoading(true)
      try {
        const data = await listResources()
        if (active) setResources(data)
      } catch (error) {
        notify(error.detail || error.error || 'Unable to load company resources.', 'error')
      } finally {
        if (active) setLoading(false)
      }
    }
    loadResources()
    return () => { active = false }
  }, [])

  async function openResource(resource) {
    if (denied) return
    const requestId = ++latestAccess.current
    setSelectedResource(resource)
    setResourceDecision(null)
    setOpeningResource(true)
    try {
      const response = await accessResource(resource.id)
      if (requestId !== latestAccess.current) return
      const decision = decisionFromResponse(response)
      setResourceDecision(decision)
      if (decision.decision === 'ALLOW') notify(`${resource.name} access approved.`, 'success')
      await refreshMe()
    } catch (error) {
      if (requestId === latestAccess.current) {
        notify(error.detail || error.error || 'Unable to evaluate resource access.', 'error')
      }
    } finally {
      if (requestId === latestAccess.current) setOpeningResource(false)
    }
  }

  async function submitSearch(event) {
    event.preventDefault()
    if (denied || !search.trim()) return
    setSearching(true)
    setSearchDecision(null)
    try {
      const response = await accessSearch(search.trim())
      const decision = decisionFromResponse(response)
      setSearchDecision(decision)
      if (decision.decision === 'ALLOW') notify('Search evaluated successfully.', 'success')
      await refreshMe()
    } catch (error) {
      notify(error.detail || error.error || 'Unable to evaluate this search.', 'error')
    } finally {
      setSearching(false)
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Session Contained Warning Banner */}
        {denied && (
          <section className="flex items-start gap-3 rounded-2xl border border-danger/40 bg-danger/[0.08] px-4 py-4 sm:px-5 shadow-[0_0_25px_rgba(239,68,68,0.2)] ring-1 ring-danger/30 backdrop-blur-sm" role="alert">
            <ShieldAlert className="mt-0.5 shrink-0 text-danger animate-pulse" size={22} aria-hidden="true" />
            <div>
              <h2 className="font-bold text-danger">Session contained</h2>
              <p className="mt-1 text-sm leading-6 text-danger/80">
                Indicator of compromise requiring investigation. Further access actions are disabled.
              </p>
            </div>
          </section>
        )}

        {/* Header with Title and Search */}
        <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="eyebrow">COMPANY ENVIRONMENT</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-text sm:text-3xl">Employee Dashboard</h1>
            <p className="mt-1 text-sm text-muted">
              Access approved company resources and monitor live session trust status.
            </p>
          </div>
          <form className="flex w-full max-w-md gap-2" onSubmit={submitSearch} role="search">
            <label className="sr-only" htmlFor="resource-search">Search company resources</label>
            <div className="relative min-w-0 flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
              <input
                className="input text-field pl-9"
                disabled={denied || searching}
                id="resource-search"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search resources…"
                value={search}
              />
            </div>
            <button className="btn-secondary button-secondary shrink-0" disabled={denied || searching || !search.trim()} type="submit">
              {searching ? 'Searching…' : 'Search'}
            </button>
          </form>
        </section>

        {/* Dashboard Cards: Trust Score Card & Access Status Card */}
        <section className="grid gap-4 sm:grid-cols-2">
          {/* Card 1: Trust Score Card */}
          <div className="card p-5 sm:p-6 flex items-center justify-between gap-4">
            <div>
              <p className="eyebrow">CONTINUOUS SESSION TRUST</p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-text tabular-nums">{trustScore}</span>
                <span className="text-xs font-semibold text-faint">/ 100</span>
                <span className={`ml-2 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${trustLevel.bg} ${trustLevel.color}`}>
                  {trustLevel.label}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-muted">
                Confidence score calculated from device profile, network, and request velocity.
              </p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-brand/30 bg-brand/10 text-brand shadow-glow-sm">
              <ShieldCheck size={26} aria-hidden="true" />
            </div>
          </div>

          {/* Card 2: Access Status Card */}
          <div className="card p-5 sm:p-6 flex items-center justify-between gap-4">
            <div>
              <p className="eyebrow">CURRENT ACCESS STATUS</p>
              <div className="mt-2 flex items-center gap-2">
                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                  denied
                    ? 'border-danger/40 bg-danger/10 text-danger'
                    : restricted
                      ? 'border-warning/40 bg-warning/10 text-warning'
                      : 'border-success/40 bg-success/10 text-success'
                }`}>
                  {denied ? 'Denied / Contained' : restricted ? 'Restricted' : 'Allowed / Active'}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-muted">
                {denied
                  ? 'Access halted. Security incident triggered.'
                  : restricted
                    ? 'Step-up verification required for protected files.'
                    : 'Unrestricted access to all approved department assets.'}
              </p>
            </div>
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${
              denied
                ? 'border-danger/30 bg-danger/10 text-danger'
                : restricted
                  ? 'border-warning/30 bg-warning/10 text-warning'
                  : 'border-success/30 bg-success/10 text-success'
            }`}>
              {denied ? <Lock size={24} /> : restricted ? <Lock size={24} /> : <Unlock size={24} />}
            </div>
          </div>
        </section>

        {/* Search Result or Selected Resource Decision */}
        {searchDecision && (
          <ResourceViewer
            disabled={denied}
            result={searchDecision}
            title={`“${search.trim()}”`}
          />
        )}

        {openingResource && (
          <div className="card"><Spinner label="Evaluating resource access" /></div>
        )}
        {selectedResource && resourceDecision && (
          <div className="card p-5 sm:p-6">
            <ResourceViewer
              disabled={denied}
              resource={selectedResource}
              result={resourceDecision}
            />
          </div>
        )}

        {/* Clean Resource Table */}
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-surface-2/40 px-5 py-4 sm:px-6">
            <div>
              <h2 className="font-bold text-text">Company Resources</h2>
              <p className="mt-0.5 text-xs text-muted">{resources.length} accessible documents and databases</p>
            </div>
            <span className="hidden rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted sm:inline-flex">
              Policy monitored
            </span>
          </div>

          {loading ? (
            <Spinner label="Loading available resources" />
          ) : resources.length === 0 ? (
            <EmptyState title="No resources available" description="There are no company resources available to your account right now." />
          ) : (
            <div className="divide-y divide-border/60">
              {groups.map(([department, departmentResources]) => (
                <section key={department}>
                  <div className="bg-surface-2/60 px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted sm:px-6 flex items-center justify-between">
                    <span>{department}</span>
                    <span className="text-[10px] font-mono text-faint">{departmentResources.length} files</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr className="border-b border-border/40 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
                          <th className="px-5 py-2.5 sm:px-6">Document Name</th>
                          <th className="px-4 py-2.5">Type</th>
                          <th className="px-4 py-2.5">Sensitivity</th>
                          <th className="px-4 py-2.5">Status</th>
                          <th className="px-5 py-2.5 text-right sm:px-6">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {departmentResources.map((resource) => {
                          const Icon = typeIcons[resource.type] || File
                          const isSelected = selectedResource?.id === resource.id
                          return (
                            <tr
                              key={resource.id}
                              className={`transition-colors hover:bg-surface-2/70 ${isSelected ? 'bg-brand/10' : ''}`}
                            >
                              <td className="px-5 py-3 sm:px-6">
                                <div className="flex items-center gap-3">
                                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2 text-brand">
                                    <Icon size={15} aria-hidden="true" />
                                  </span>
                                  <span className="truncate text-xs sm:text-sm font-semibold text-text max-w-xs sm:max-w-md">
                                    {resource.name}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-xs capitalize text-muted">
                                {resource.type}
                              </td>
                              <td className="px-4 py-3">
                                <SeverityBadge value={resource.sensitivity} />
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                                  denied
                                    ? 'border-danger/30 bg-danger/10 text-danger'
                                    : 'border-success/30 bg-success/10 text-success'
                                }`}>
                                  {denied ? 'Locked' : 'Available'}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-right sm:px-6">
                                <button
                                  className="btn-secondary button-secondary min-h-8 px-3 py-1 text-xs"
                                  disabled={denied}
                                  onClick={() => openResource(resource)}
                                  type="button"
                                >
                                  Open
                                  <ArrowRight size={12} aria-hidden="true" />
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      </div>
    </Layout>
  )
}

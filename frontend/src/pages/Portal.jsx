import { useEffect, useMemo, useRef, useState } from 'react'
import { File, FileText, FolderKanban, Search, Sheet, ShieldAlert } from 'lucide-react'
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
  const denied = String(session?.status || '').toLowerCase() === 'denied'
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
        {denied && (
          <section className="flex items-start gap-3 rounded-xl border border-critical/30 bg-critical/[0.08] px-4 py-4 sm:px-5" role="alert">
            <ShieldAlert className="mt-0.5 shrink-0 text-critical" size={20} aria-hidden="true" />
            <div>
              <h2 className="font-semibold text-red-200">Session contained</h2>
              <p className="mt-1 text-sm leading-6 text-red-200/75">
                Indicator of compromise requiring investigation. Further access actions are disabled.
              </p>
            </div>
          </section>
        )}

        <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="eyebrow">COMPANY ENVIRONMENT</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Your workspace</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
              Access approved resources and view the policy decision for each request.
            </p>
          </div>
          <form className="flex w-full max-w-md gap-2" onSubmit={submitSearch} role="search">
            <label className="sr-only" htmlFor="resource-search">Search company resources</label>
            <div className="relative min-w-0 flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
              <input
                className="text-field pl-9"
                disabled={denied || searching}
                id="resource-search"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search resources…"
                value={search}
              />
            </div>
            <button className="button-secondary shrink-0" disabled={denied || searching || !search.trim()} type="submit">
              {searching ? 'Searching…' : 'Search'}
            </button>
          </form>
        </section>

        {searchDecision && (
          <ResourceViewer
            disabled={denied}
            result={searchDecision}
            title={`“${search.trim()}”`}
          />
        )}

        {openingResource && (
          <div className="surface"><Spinner label="Evaluating resource access" /></div>
        )}
        {selectedResource && resourceDecision && (
          <div className="surface p-5 sm:p-6">
            <ResourceViewer
              disabled={denied}
              resource={selectedResource}
              result={resourceDecision}
            />
          </div>
        )}

        <section className="surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4 sm:px-6">
            <div>
              <h2 className="font-semibold text-white">Company resources</h2>
              <p className="mt-1 text-xs text-slate-500">{resources.length} available to your account</p>
            </div>
            <span className="hidden rounded-full border border-white/[0.07] px-2.5 py-1 text-[10px] uppercase tracking-wide text-slate-500 sm:inline-flex">
              Policy monitored
            </span>
          </div>

          {loading ? (
            <Spinner label="Loading available resources" />
          ) : resources.length === 0 ? (
            <EmptyState title="No resources available" description="There are no company resources available to your account right now." />
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {groups.map(([department, departmentResources]) => (
                <section key={department}>
                  <h3 className="bg-white/[0.015] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 sm:px-6">
                    {department}
                  </h3>
                  <ul className="divide-y divide-white/[0.04]">
                    {departmentResources.map((resource) => {
                      const Icon = typeIcons[resource.type] || File
                      const isSelected = selectedResource?.id === resource.id
                      return (
                        <li key={resource.id}>
                          <button
                            className={`flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-white/[0.025] disabled:cursor-not-allowed disabled:opacity-45 sm:px-6 ${isSelected ? 'bg-accent/[0.04]' : ''}`}
                            disabled={denied}
                            onClick={() => openResource(resource)}
                            type="button"
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.02] text-slate-400">
                              <Icon size={16} aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-slate-200">{resource.name}</span>
                              <span className="mt-1 block text-[11px] capitalize text-slate-500">{resource.type}</span>
                            </span>
                            <SeverityBadge value={resource.sensitivity} />
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </section>
      </div>
    </Layout>
  )
}

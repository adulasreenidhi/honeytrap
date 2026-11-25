export function groupResources(resources) {
  const grouped = resources.reduce((groups, resource) => {
    const department = resource.department || 'Other'
    if (!groups.has(department)) groups.set(department, [])
    groups.get(department).push(resource)
    return groups
  }, new Map())

  return [...grouped.entries()].sort(([departmentA], [departmentB]) => departmentA.localeCompare(departmentB))
}

export function formatStatus(status) {
  return String(status || 'active').toLowerCase()
}

export function formatTime(value, includeDate = false) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat(undefined, {
    ...(includeDate ? { month: 'short', day: 'numeric' } : {}),
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

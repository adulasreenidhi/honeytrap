const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')
const TOKEN_KEY = 'honeygate_token'

export class ApiError extends Error {
  constructor(status, error, detail, body) {
    super(detail || error || `Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.error = error
    this.detail = detail
    this.body = body
  }
}

function clearAuthentication() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem('honeygate_user')
  localStorage.removeItem('honeygate_session')
  window.dispatchEvent(new Event('honeygate:unauthorized'))
  if (window.location.pathname !== '/login') {
    window.location.assign('/login')
  }
}

async function parseResponse(response) {
  if (response.status === 204) return null
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) return response.json()
  return response.text()
}

function makeApiError(response, body) {
  return new ApiError(
    response.status,
    body && typeof body === 'object' ? body.error : undefined,
    body && typeof body === 'object' ? body.detail : undefined,
    body,
  )
}

export async function request(path, options = {}) {
  const { allowDecision403 = false, ...fetchOptions } = options
  const headers = new Headers(fetchOptions.headers || {})
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) headers.set('Authorization', `Bearer ${token}`)

  if (fetchOptions.body && !(fetchOptions.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...fetchOptions,
    headers,
  })
  const body = await parseResponse(response)
  const isAccessPost = (fetchOptions.method || 'GET').toUpperCase() === 'POST'
    && path.startsWith('/api/access/')

  if (response.status === 401) {
    clearAuthentication()
    throw makeApiError(response, body)
  }
  if (!response.ok) {
    if (response.status === 403 && (allowDecision403 || isAccessPost)) {
      return { ok: false, status: 403, decision: body }
    }
    throw makeApiError(response, body)
  }
  return body
}

export function login(credentials) {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  })
}

export function me() {
  return request('/api/auth/me')
}

export function logout() {
  return request('/api/auth/logout', { method: 'POST' })
}

export function listResources() {
  return request('/api/resources')
}

export function accessResource(resourceId) {
  return request(`/api/access/resource/${encodeURIComponent(resourceId)}`, {
    method: 'POST',
    allowDecision403: true,
  })
}

export function accessSearch(query) {
  return request(`/api/access/search?q=${encodeURIComponent(query)}`, {
    method: 'POST',
    allowDecision403: true,
  })
}

export function verifyOtp(otp) {
  return request('/api/access/verify', {
    method: 'POST',
    body: JSON.stringify({ otp }),
    allowDecision403: true,
  })
}

export function getSessionTrust(sessionId) {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/trust`)
}

function queryString(params = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value))
    }
  })
  const value = query.toString()
  return value ? `?${value}` : ''
}

export function dashboardSummary() {
  return request('/api/dashboard/summary')
}

export function trustTrends() {
  return request('/api/dashboard/trust-trends')
}

export function eventsOverTime() {
  return request('/api/dashboard/events-over-time')
}

export function listAlerts(params = {}) {
  return request(`/api/alerts${queryString(params)}`)
}

export function patchAlert(alertId, changes) {
  return request(`/api/alerts/${encodeURIComponent(alertId)}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  })
}

export function listIncidents(params = {}) {
  return request(`/api/incidents${queryString(params)}`)
}

export function getIncident(incidentId) {
  return request(`/api/incidents/${encodeURIComponent(incidentId)}`)
}

export function patchIncident(incidentId, changes) {
  return request(`/api/incidents/${encodeURIComponent(incidentId)}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  })
}

export function respondToIncident(incidentId, action, notes) {
  return request(`/api/incidents/${encodeURIComponent(incidentId)}/respond`, {
    method: 'POST',
    body: JSON.stringify({ action, notes }),
  })
}

export function listActivity(params = {}) {
  return request(`/api/activity${queryString(params)}`)
}

export function activeSessions() {
  return request('/api/sessions/active')
}

export function simulateDeviceChange(sessionId, deviceId) {
  return request('/api/simulate/device-change', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, device_id: deviceId }),
  })
}

export function simulateLocationChange(sessionId, location) {
  return request('/api/simulate/location-change', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, location }),
  })
}

export function listUsers() {
  return request('/api/users')
}

export function createUser(user) {
  return request('/api/users', { method: 'POST', body: JSON.stringify(user) })
}

export function updateUser(userId, changes) {
  return request(`/api/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  })
}

export function deleteUser(userId) {
  return request(`/api/users/${encodeURIComponent(userId)}`, { method: 'DELETE' })
}

export function listDevices() {
  return request('/api/devices')
}

export function createDevice(device) {
  return request('/api/devices', { method: 'POST', body: JSON.stringify(device) })
}

export function updateDevice(deviceId, changes) {
  return request(`/api/devices/${encodeURIComponent(deviceId)}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  })
}

export function deleteDevice(deviceId) {
  return request(`/api/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' })
}

export function listDecoys() {
  return request('/api/decoys')
}

export function createDecoy(decoy) {
  return request('/api/decoys', {
    method: 'POST',
    body: JSON.stringify({ ...decoy, is_decoy: true }),
  })
}

export function updateDecoy(decoyId, changes) {
  return request(`/api/decoys/${encodeURIComponent(decoyId)}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  })
}

export function deleteDecoy(decoyId) {
  return request(`/api/decoys/${encodeURIComponent(decoyId)}`, { method: 'DELETE' })
}

export function listPolicies() {
  return request('/api/policies')
}

export function updatePolicy(policyId, changes) {
  return request(`/api/policies/${encodeURIComponent(policyId)}`, {
    method: 'PUT',
    body: JSON.stringify(changes),
  })
}

export function incidentReport(incidentId) {
  return request(`/api/reports/incident/${encodeURIComponent(incidentId)}`)
}

export function auditReport(params = {}) {
  return request(`/api/reports/audit${queryString(params)}`)
}

export function downloadAuditCsv(params = {}) {
  return downloadBlob(`/api/reports/audit${queryString({ ...params, format: 'csv' })}`, 'honeygate-audit.csv')
}

export function runScenario() {
  return request('/api/demo/run-scenario', { method: 'POST' })
}

export function resetDemo() {
  return request('/api/demo/reset', { method: 'POST' })
}

export async function downloadBlob(path, filename) {
  const headers = new Headers()
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${API_BASE_URL}${path}`, { headers })
  if (response.status === 401) {
    const body = await parseResponse(response)
    clearAuthentication()
    throw makeApiError(response, body)
  }
  if (!response.ok) {
    const body = await parseResponse(response)
    throw makeApiError(response, body)
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

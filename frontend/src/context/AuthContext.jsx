import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login as loginRequest, logout as logoutRequest, me } from '../api/client.js'
import { notify } from '../utils/notify.js'
import AuthContext from './authContextValue.js'

const TOKEN_KEY = 'honeygate_token'

function readStoredValue(key) {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) : null
  } catch {
    localStorage.removeItem(key)
    return null
  }
}

export function AuthProvider({ children }) {
  const navigate = useNavigate()
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState(() => readStoredValue('honeygate_user'))
  const [session, setSession] = useState(() => readStoredValue('honeygate_session'))
  const [isLoading, setIsLoading] = useState(() => Boolean(localStorage.getItem(TOKEN_KEY)))

  const clearAuth = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem('honeygate_user')
    localStorage.removeItem('honeygate_session')
    setToken(null)
    setUser(null)
    setSession(null)
    setIsLoading(false)
  }, [])

  const refreshMe = useCallback(async () => {
    if (!localStorage.getItem(TOKEN_KEY)) return null
    const data = await me()
    setUser(data.user)
    setSession(data.session)
    localStorage.setItem('honeygate_user', JSON.stringify(data.user))
    localStorage.setItem('honeygate_session', JSON.stringify(data.session))
    setIsLoading(false)
    return data
  }, [])

  const login = useCallback(async (credentials) => {
    const data = await loginRequest(credentials)
    localStorage.setItem(TOKEN_KEY, data.access_token)
    localStorage.setItem('honeygate_session', JSON.stringify(data.session))
    setToken(data.access_token)
    setSession(data.session)
    try {
      const current = await me()
      setUser(current.user)
      setSession(current.session)
      localStorage.setItem('honeygate_user', JSON.stringify(current.user))
      localStorage.setItem('honeygate_session', JSON.stringify(current.session))
      return current.user
    } catch (error) {
      clearAuth()
      throw error
    }
  }, [clearAuth])

  const logout = useCallback(async () => {
    try {
      if (localStorage.getItem(TOKEN_KEY)) await logoutRequest()
    } finally {
      clearAuth()
      navigate('/login', { replace: true })
    }
  }, [clearAuth, navigate])

  useEffect(() => {
    const onUnauthorized = () => clearAuth()
    window.addEventListener('honeygate:unauthorized', onUnauthorized)
    return () => window.removeEventListener('honeygate:unauthorized', onUnauthorized)
  }, [clearAuth])

  useEffect(() => {
    if (!token) {
      return undefined
    }

    let active = true
    const refresh = async (initial = false) => {
      try {
        await refreshMe()
      } catch (error) {
        if (active && error.status !== 401) {
          notify('Unable to refresh your session status. Retrying shortly.', 'error')
        }
      } finally {
        if (active && initial) setIsLoading(false)
      }
    }

    refresh(true)
    const timer = window.setInterval(() => refresh(), 10_000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [token, refreshMe])

  const value = useMemo(() => ({
    token,
    user,
    session,
    isLoading,
    login,
    logout,
    refreshMe,
    isAdmin: user?.role === 'admin',
    isAnalyst: user?.role === 'analyst',
    isEmployee: user?.role === 'employee',
  }), [token, user, session, isLoading, login, logout, refreshMe])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCurrentUser, loginRequest } from '../api/authApi.js'
import { setAccessToken, setUnauthorizedHandler } from '../api/client.js'
import { AuthContext } from './auth-context.js'

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)

  const logout = useCallback(() => {
    setAccessToken(null)
    setSession(null)
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(logout)
    return () => setUnauthorizedHandler(null)
  }, [logout])

  const login = useCallback(async (credentials) => {
    const result = await loginRequest(credentials)
    if (!result?.token || !result?.user) throw new Error('The server returned an invalid sign-in response.')
    setAccessToken(result.token)
    const user = await getCurrentUser()
    setSession({ user })
    return user
  }, [])

  const value = useMemo(() => ({
    user: session?.user ?? null,
    isAuthenticated: Boolean(session?.user),
    login,
    logout,
  }), [session, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}


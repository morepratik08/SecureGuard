import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext.jsx'
import { useAuth } from './auth/useAuth.js'
import ProtectedRoute from './auth/ProtectedRoute.jsx'
import AppShell from './components/layout/AppShell.jsx'
import LoginPage from './pages/LoginPage.jsx'
import ModulePage from './pages/ModulePage.jsx'
import AccessDeniedPage from './pages/AccessDeniedPage.jsx'
import { ROUTES } from './config/navigation.js'

const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'))

function AppRoutes() {
  const { user } = useAuth()

  return (
    <Suspense fallback={<div className="route-loading" role="status">Loading workspace…</div>}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            {ROUTES.filter((route) => route.path !== '/').map((route) => (
              <Route
                key={route.path}
                path={route.path.slice(1)}
                element={(
                  <ProtectedRoute roles={route.roles}>
                    <ModulePage route={route} />
                  </ProtectedRoute>
                )}
              />
            ))}
            <Route path="/access-denied" element={<AccessDeniedPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

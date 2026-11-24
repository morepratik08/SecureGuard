import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext.jsx'
import { useAuth } from './auth/useAuth.js'
import ProtectedRoute from './auth/ProtectedRoute.jsx'
import AppShell from './components/layout/AppShell.jsx'
import LoginPage from './pages/LoginPage.jsx'
import ModulePage from './pages/ModulePage.jsx'
import AccessDeniedPage from './pages/AccessDeniedPage.jsx'
import EmployeeListPage from './pages/EmployeeListPage.jsx'
import EmployeeDetailsPage from './pages/EmployeeDetailsPage.jsx'
import EmployeeFormPage from './pages/EmployeeFormPage.jsx'
import MyEmployeeProfilePage from './pages/MyEmployeeProfilePage.jsx'
import ClientListPage from './pages/ClientListPage.jsx'
import ClientFormPage from './pages/ClientFormPage.jsx'
import ClientDetailsPage from './pages/ClientDetailsPage.jsx'
import SiteListPage from './pages/SiteListPage.jsx'
import SiteFormPage from './pages/SiteFormPage.jsx'
import SiteDetailsPage from './pages/SiteDetailsPage.jsx'
import ShiftListPage from './pages/ShiftListPage.jsx'
import ShiftFormPage from './pages/ShiftFormPage.jsx'
import ShiftDetailsPage from './pages/ShiftDetailsPage.jsx'
import AssignmentListPage from './pages/AssignmentListPage.jsx'
import AssignmentFormPage from './pages/AssignmentFormPage.jsx'
import AssignmentDetailsPage from './pages/AssignmentDetailsPage.jsx'
import SchedulePage from './pages/SchedulePage.jsx'
import AttendancePage from './pages/AttendancePage.jsx'
import AttendanceDetailsPage from './pages/AttendanceDetailsPage.jsx'
import LeaveListPage from './pages/LeaveListPage.jsx'
import LeaveFormPage from './pages/LeaveFormPage.jsx'
import LeaveDetailsPage from './pages/LeaveDetailsPage.jsx'
import IncidentListPage from './pages/IncidentListPage.jsx'
import IncidentFormPage from './pages/IncidentFormPage.jsx'
import IncidentDetailsPage from './pages/IncidentDetailsPage.jsx'
import DocumentListPage from './pages/DocumentListPage.jsx'
import DocumentDetailsPage from './pages/DocumentDetailsPage.jsx'
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
            <Route path="employees" element={<ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR']}><EmployeeListPage /></ProtectedRoute>} />
            <Route path="employees/new" element={<ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN']}><EmployeeFormPage /></ProtectedRoute>} />
            <Route path="employees/:employeeId/edit" element={<ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN']}><EmployeeFormPage editMode /></ProtectedRoute>} />
            <Route path="employees/:employeeId" element={<ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'GUARD']}><EmployeeDetailsPage /></ProtectedRoute>} />
            <Route path="my-profile" element={<ProtectedRoute roles={['SUPERVISOR', 'GUARD']}><MyEmployeeProfilePage /></ProtectedRoute>} />
            <Route path="clients" element={<ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN', 'CLIENT']}><ClientListPage /></ProtectedRoute>} />
            <Route path="clients/new" element={<ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN']}><ClientFormPage /></ProtectedRoute>} />
            <Route path="clients/:clientId/edit" element={<ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN', 'CLIENT']}><ClientFormPage editMode /></ProtectedRoute>} />
            <Route path="clients/:clientId" element={<ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN', 'CLIENT']}><ClientDetailsPage /></ProtectedRoute>} />
            <Route path="sites" element={<ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'CLIENT']}><SiteListPage /></ProtectedRoute>} />
            <Route path="sites/new" element={<ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN']}><SiteFormPage /></ProtectedRoute>} />
            <Route path="sites/:siteId/edit" element={<ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN']}><SiteFormPage editMode /></ProtectedRoute>} />
            <Route path="sites/:siteId" element={<ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'CLIENT']}><SiteDetailsPage /></ProtectedRoute>} />
            <Route path="shifts" element={<ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR']}><ShiftListPage /></ProtectedRoute>} />
            <Route path="shifts/new" element={<ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN']}><ShiftFormPage /></ProtectedRoute>} />
            <Route path="shifts/:shiftId/edit" element={<ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN']}><ShiftFormPage editMode /></ProtectedRoute>} />
            <Route path="shifts/:shiftId" element={<ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR']}><ShiftDetailsPage /></ProtectedRoute>} />
            <Route path="assignments/calendar" element={<ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR']}><SchedulePage /></ProtectedRoute>} />
            <Route path="assignments" element={<ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR']}><AssignmentListPage /></ProtectedRoute>} />
            <Route path="assignments/new" element={<ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN']}><AssignmentFormPage /></ProtectedRoute>} />
            <Route path="assignments/:assignmentId/edit" element={<ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN']}><AssignmentFormPage editMode /></ProtectedRoute>} />
            <Route path="assignments/:assignmentId" element={<ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR']}><AssignmentDetailsPage /></ProtectedRoute>} />
            <Route path="attendance" element={<ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'GUARD']}><AttendancePage /></ProtectedRoute>} />
            <Route path="attendance/:attendanceId" element={<ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'GUARD']}><AttendanceDetailsPage /></ProtectedRoute>} />
            <Route path="leaves" element={<ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'GUARD']}><LeaveListPage /></ProtectedRoute>} />
            <Route path="leaves/new" element={<ProtectedRoute roles={['GUARD']}><LeaveFormPage /></ProtectedRoute>} />
            <Route path="leaves/:leaveId" element={<ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'GUARD']}><LeaveDetailsPage /></ProtectedRoute>} />
            <Route path="incidents" element={<ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'GUARD', 'CLIENT']}><IncidentListPage /></ProtectedRoute>} />
            <Route path="incidents/new" element={<ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'GUARD', 'CLIENT']}><IncidentFormPage /></ProtectedRoute>} />
            <Route path="incidents/:incidentId" element={<ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'GUARD', 'CLIENT']}><IncidentDetailsPage /></ProtectedRoute>} />
            <Route path="documents" element={<ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'GUARD']}><DocumentListPage /></ProtectedRoute>} />
            <Route path="documents/:documentId" element={<ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'GUARD']}><DocumentDetailsPage /></ProtectedRoute>} />
            {ROUTES.filter((route) => !['/', '/employees', '/my-profile', '/clients', '/sites', '/assignments', '/shifts', '/attendance', '/leaves', '/incidents', '/documents'].includes(route.path)).map((route) => (
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

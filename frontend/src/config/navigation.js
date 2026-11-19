import {
  Activity, BriefcaseBusiness, CalendarDays, ClipboardCheck, FileBarChart,
  ContactRound, FileText, LayoutDashboard, MapPin, Settings, Shield, Siren, Users,
  UserRoundCog, WalletCards,
} from 'lucide-react'

export const ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'GUARD', 'CLIENT']

const allAdmins = ['SUPER_ADMIN', 'ADMIN']
const operations = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR']
const management = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR']

export const NAV_ITEMS = [
  { label: 'Overview', path: '/', icon: LayoutDashboard, roles: ROLES },
  { label: 'Employees', path: '/employees', icon: Users, roles: management },
  { label: 'My Profile', path: '/my-profile', icon: ContactRound, roles: ['SUPERVISOR', 'GUARD'] },
  { label: 'Supervisors', path: '/supervisors', icon: UserRoundCog, roles: allAdmins },
  { label: 'Client Management', path: '/clients', icon: BriefcaseBusiness, roles: allAdmins.concat('CLIENT') },
  { label: 'Site Management', path: '/sites', icon: MapPin, roles: operations.concat('CLIENT') },
  { label: 'Assignments', path: '/assignments', icon: ClipboardCheck, roles: operations.concat('GUARD', 'CLIENT') },
  { label: 'Shifts', path: '/shifts', icon: CalendarDays, roles: operations.concat('GUARD') },
  { label: 'Attendance', path: '/attendance', icon: Activity, roles: operations.concat('GUARD') },
  { label: 'Leave Management', path: '/leave-management', icon: CalendarDays, roles: operations.concat('GUARD') },
  { label: 'Incidents', path: '/incidents', icon: Siren, roles: operations.concat('GUARD') },
  { label: 'Payroll', path: '/payroll', icon: WalletCards, roles: allAdmins.concat('GUARD') },
  { label: 'Invoices', path: '/invoices', icon: FileText, roles: allAdmins.concat('CLIENT') },
  { label: 'Reports', path: '/reports', icon: FileBarChart, roles: operations.concat('CLIENT') },
  { label: 'Settings', path: '/settings', icon: Settings, roles: ROLES },
]

export const ROUTES = NAV_ITEMS.map(({ label, path, roles, icon }) => ({ label, path, roles, icon }))

export function navigationForRole(role) {
  return NAV_ITEMS.filter((item) => item.roles.includes(role))
}

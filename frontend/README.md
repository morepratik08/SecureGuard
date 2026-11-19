# SecureGuard frontend

React, Vite, Tailwind CSS, React Router, Axios and Recharts frontend for SecureGuard workforce operations.

## Run locally

```powershell
cd frontend
Copy-Item .env.example .env.local
npm install
npm run dev
```

Set `VITE_API_BASE_URL` in `.env.local` if the backend is not at `http://localhost:5000/api`. The current backend provides login, `/api/auth/me`, password change, account provisioning, and `/api/health`; the dashboard and workforce modules do not yet have data endpoints. The dashboard therefore shows empty states instead of sample operational figures.

## Checks

```powershell
npm run lint
npm run build
```

## Authentication storage

The backend currently returns the JWT in the login response body. The frontend keeps it in JavaScript memory and sends it as a Bearer token. It is not persisted to local storage or represented as an HttpOnly cookie; a page reload ends the frontend session and requires another login.

For production browser sessions, update the backend to issue and clear a `Secure`, `HttpOnly`, appropriately `SameSite` cookie, accept cookie-based authentication, and add CSRF protections. Configure CORS for the exact frontend origin with credentials, then set Axios `withCredentials`. Cookie issuance and logout behavior must be implemented and tested by the backend before switching the client.

## Backend work still needed for the dashboard

Add authenticated, role-scoped summary endpoints for guard totals, active sites, today's attendance, pending leave, attendance chart series, employee distribution, recent activity, and incidents. Enforce role access and tenant/client scope in the backend. Then add the endpoint adapter to `src/api/dashboardApi.js`; the UI is already separated from its transport layer and accepts real chart data without embedding fake records.

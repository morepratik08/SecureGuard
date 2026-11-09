# SecureGuard – Security Guard & Workforce Management System

SecureGuard is a full-stack workforce management platform designed to simplify security guard operations, employee management, site allocation, attendance tracking, payroll processing and client billing.

## Technology Stack

### Frontend
- React.js
- Vite
- Tailwind CSS
- React Router
- Axios
- Recharts
- Lucide React

### Backend
- Node.js
- Express.js
- Prisma ORM
- MySQL
- JWT Authentication
- bcrypt

### Integrations
- Razorpay – Client invoice payments
- Cloudinary – Document and image storage

## Project Structure

```text
SecureGuard/
├── frontend/
├── backend/
│   ├── prisma/
│   ├── src/
│   ├── test/
│   └── docs/
├── .gitignore
└── README.md
```

## User Roles

- Super Admin
- Admin
- Supervisor
- Guard
- Client

## Current Development Status

- [x] Project structure and environment setup
- [x] Express backend foundation
- [x] MySQL and Prisma integration
- [x] JWT authentication and RBAC foundation
- [x] Account provisioning
- [x] Password management
- [x] Initial automated authentication tests
- [ ] User and employee management
- [ ] Client and site management
- [ ] Shift and assignment management
- [ ] Attendance and leave management
- [ ] Payroll and invoicing
- [ ] Dashboard and reporting
- [ ] Production deployment

## Local Development

### Backend

```bash
cd backend
npm install
```

Configure your local `.env` using `.env.example`, then run:

```bash
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Security

- Environment secrets are excluded from Git.
- Passwords are hashed using bcrypt.
- JWT authentication and role-based access control are implemented.
- Protected API routes validate current account permissions.

## Project Status

Under active development.

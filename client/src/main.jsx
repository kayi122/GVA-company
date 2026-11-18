import { StrictMode, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import { AuthProvider, useAuth } from './lib.jsx';
import { Spinner, ToastProvider } from './components/ui.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';

// Pages load only when opened → faster first load on mobile data
const UsersPage = lazy(() => import('./pages/Users.jsx'));
const Teams = lazy(() => import('./pages/Teams.jsx'));
const Permissions = lazy(() => import('./pages/Permissions.jsx'));
const Audit = lazy(() => import('./pages/Audit.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const Customers = lazy(() => import('./pages/Customers.jsx'));
const CustomerNew = lazy(() => import('./pages/CustomerNew.jsx'));
const CustomerDetail = lazy(() => import('./pages/CustomerDetail.jsx'));
const Calendar = lazy(() => import('./pages/Calendar.jsx'));
const Reports = lazy(() => import('./pages/Reports.jsx'));
const Targets = lazy(() => import('./pages/Targets.jsx'));
const Payments = lazy(() => import('./pages/Payments.jsx'));
const Packages = lazy(() => import('./pages/Packages.jsx'));
const Inventory = lazy(() => import('./pages/Inventory.jsx'));
const Installations = lazy(() => import('./pages/Installations.jsx'));
const InstallationDetail = lazy(() => import('./pages/InstallationDetail.jsx'));
const System = lazy(() => import('./pages/System.jsx'));

function Protected({ perm, children }) {
  const { user, loading, can } = useAuth();
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center text-olive-600">
        <Spinner className="h-8 w-8" />
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  if (perm && !can(...[perm].flat())) return <Navigate to="/" replace />;
  return children;
}

function LoginRoute() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to="/" replace />;
  return <Login />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary full>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <Routes>
              <Route path="/login" element={<LoginRoute />} />
              <Route element={<Protected><Layout /></Protected>}>
                <Route index element={<Dashboard />} />
                <Route path="customers" element={<Customers />} />
                <Route path="customers/new" element={<Protected perm="customers.create"><CustomerNew /></Protected>} />
                <Route path="customers/:id" element={<CustomerDetail />} />
                <Route path="calendar" element={<Calendar />} />
                <Route path="reports" element={<Protected perm={['reports.team', 'reports.all']}><Reports /></Protected>} />
                <Route path="targets" element={<Protected perm={['targets.manage_team', 'targets.manage_all']}><Targets /></Protected>} />
                <Route path="payments" element={<Payments />} />
                <Route path="packages" element={<Protected perm="packages.manage"><Packages /></Protected>} />
                <Route path="inventory" element={<Protected perm={['inventory.manage', 'installs.assign']}><Inventory /></Protected>} />
                <Route path="installations" element={<Protected perm={['installs.assign', 'installs.complete', 'customers.view_all']}><Installations /></Protected>} />
                <Route path="installations/:id" element={<InstallationDetail />} />
                <Route path="users" element={<Protected perm="users.view"><UsersPage /></Protected>} />
                <Route path="teams" element={<Protected perm="users.view"><Teams /></Protected>} />
                <Route path="permissions" element={<Protected perm="permissions.manage"><Permissions /></Protected>} />
                <Route path="audit" element={<Protected perm="audit.view"><Audit /></Protected>} />
                <Route path="system" element={<Protected perm="backups.manage"><System /></Protected>} />
                <Route path="profile" element={<Profile />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);

// Installable app (Add to Home Screen) — production only, so development always shows fresh code
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

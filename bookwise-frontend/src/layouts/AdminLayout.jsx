import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import AdminSidebar from '../components/AdminSidebar';
import AdminHeader from '../components/AdminHeader';
import './AdminLayout.css';
import '../pages/admin/admin.css';

export default function AdminLayout() {
  const { pathname } = useLocation();
  // The mobile drawer belongs to the page it was opened on, so navigating closes it.
  const [drawerPath, setDrawerPath] = useState(null);
  const drawerOpen = drawerPath === pathname;
  const [toast, setToast] = useState(null);

  const notify = useCallback((message, tone = 'success') => {
    setToast({ message, tone, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), toast.tone === 'error' ? 6000 : 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const outletContext = useMemo(() => ({ notify }), [notify]);

  return (
    <div className={`admin-layout${drawerOpen ? ' admin-layout--drawer-open' : ''}`}>
      <AdminSidebar onNavigate={() => setDrawerPath(null)} />
      <button
        type="button"
        className="admin-layout__scrim"
        aria-label="Close menu"
        tabIndex={drawerOpen ? 0 : -1}
        onClick={() => setDrawerPath(null)}
      />
      <div className="admin-layout__main">
        <AdminHeader onToggleMenu={() => setDrawerPath(drawerOpen ? null : pathname)} menuOpen={drawerOpen} />
        <main className="admin-layout__content" id="admin-main">
          <Outlet context={outletContext} />
        </main>
      </div>

      {toast ? (
        <div className={`toast admin-toast admin-toast--${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'} key={toast.id}>
          {toast.tone === 'error' ? <AlertCircle size={16} aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}

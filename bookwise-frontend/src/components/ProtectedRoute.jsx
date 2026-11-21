import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Client-side route guard. The backend independently enforces every
 * superadmin operation.
 */
export default function ProtectedRoute({ children, requiredRole }) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    const returnTo = encodeURIComponent(`${location.pathname}${location.search}`);
    const loginPath = requiredRole === 'superadmin' ? '/admin/login' : '/login';
    return <Navigate to={`${loginPath}?returnTo=${returnTo}`} replace />;
  }

  if (requiredRole && !user?.roles?.includes(requiredRole)) {
    const returnTo = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/admin/login?returnTo=${returnTo}`} replace />;
  }

  return children;
}

import { useEffect } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { isAdmin, isDoctor } from '@/lib/useRole';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

export default function ProtectedRoute({ fallback = <DefaultFallback />, unauthenticatedElement, requiredRole, skipOnboarding }) {
  const { user, isAuthenticated, isLoadingAuth, authChecked, authError, checkUserAuth } = useAuth();

  useEffect(() => {
    if (!authChecked && !isLoadingAuth) {
      checkUserAuth();
    }
  }, [authChecked, isLoadingAuth, checkUserAuth]);

  if (isLoadingAuth || !authChecked) {
    return fallback;
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    return unauthenticatedElement;
  }

  if (!isAuthenticated) {
    return unauthenticatedElement;
  }

  // Redirect to onboarding if not completed (unless on the onboarding page itself)
  if (!skipOnboarding && user && !user.onboarded) {
    return <Navigate to="/onboarding" replace />;
  }

  // Role-based access control
  if (requiredRole === 'admin' && !isAdmin(user?.role)) {
    return <Navigate to="/" replace />;
  }
  if (requiredRole === 'doctor' && !isDoctor(user?.role, user?.app_role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
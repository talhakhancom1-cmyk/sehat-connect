import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  const isTestMode = import.meta.env.VITE_TEST_MODE === 'true';

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    try {
      setAuthError(null);
      setIsLoadingPublicSettings(true);

      if (isTestMode) {
        console.log('Running in test mode - bypassing backend auth');
        const testUserId = localStorage.getItem('test_user_id') || 'aa68400e-a83a-44a7-92a1-6e9123752eba';
        const testUserRole = localStorage.getItem('test_user_role') || 'patient';

        const canonicalRole = testUserRole === 'admin' ? 'super_admin' : testUserRole;
        const testUser = {
          id: testUserId,
          display_name: testUserRole === 'doctor' ? 'Dr. Test Doctor' :
                       testUserRole === 'admin' ? 'Admin User' : 'Test Patient',
          role: canonicalRole,
          app_role: testUserRole === 'doctor' ? 'doctor' : 'patient',
          onboarded: true
        };
        setUser(testUser);
        setIsAuthenticated(true);
        setIsLoadingAuth(false);
        setIsLoadingPublicSettings(false);
        setAuthChecked(true);
        return;
      }

      setAppPublicSettings(null);
      setIsLoadingPublicSettings(false);
      await checkUserAuth();
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'An unexpected error occurred'
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthChecked(true);

      if (error.status === 401 || error.status === 403) {
        setAuthError({
          type: 'auth_required',
          message: 'Authentication required'
        });
      }
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);

    if (isTestMode) {
      localStorage.removeItem('test_user_id');
      if (shouldRedirect) {
        window.location.href = '/login';
      }
      return;
    }

    if (shouldRedirect) {
      base44.auth.logout(window.location.href);
    } else {
      base44.auth.logout();
    }
  };

  const navigateToLogin = () => {
    if (isTestMode) {
      window.location.href = '/login';
      return;
    }
    base44.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState,
      isTestMode
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

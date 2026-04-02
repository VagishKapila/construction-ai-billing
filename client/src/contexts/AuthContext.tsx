/**
 * Auth Context — Global authentication state and methods
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from '@/types';
import { api } from '@/api/client';
import * as authApi from '@/api/auth';

// Admin emails (hardcoded for now, can be fetched from config endpoint)
const ADMIN_EMAILS = ['vaakapila@gmail.com', 'vagishkapila@gmail.com'];

/**
 * Auth state shape
 */
export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAdmin: boolean;
}

/**
 * Auth context interface
 */
export interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  googleLogin: (credential: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

/**
 * Create Auth context
 */
const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

/**
 * Auth Provider Component
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [state, setState] = React.useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    isAdmin: false,
  });

  /**
   * Initialize auth on mount — check token and fetch current user
   */
  React.useEffect(() => {
    const initAuth = async () => {
      try {
        // Check for Google OAuth token in URL hash (#google_token=...)
        const hash = window.location.hash;
        if (hash.includes('google_token=')) {
          const googleToken = hash.split('google_token=')[1]?.split('&')[0];
          if (googleToken) {
            api.setToken(googleToken);
            // Clean the hash from URL
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
          }
        }

        const token = api.getToken();
        if (!token) {
          setState((prev) => ({ ...prev, isLoading: false }));
          return;
        }

        // Validate token by fetching current user
        const response = await authApi.getMe();
        if (response.data) {
          const isAdmin = ADMIN_EMAILS.includes(response.data.email);
          setState({
            user: response.data,
            isAuthenticated: true,
            isLoading: false,
            isAdmin,
          });
        } else {
          // Invalid token
          api.setToken(null);
          setState((prev) => ({ ...prev, isLoading: false }));
        }
      } catch {
        // Error fetching user (likely 401)
        api.setToken(null);
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    };

    initAuth();
  }, []);

  /**
   * Listen for 401 auth errors and logout
   */
  React.useEffect(() => {
    const handleAuthLogout = () => {
      logout();
    };

    window.addEventListener('auth:logout', handleAuthLogout);
    return () => {
      window.removeEventListener('auth:logout', handleAuthLogout);
    };
  }, []);

  /**
   * Login with email and password
   */
  const login = async (email: string, password: string): Promise<void> => {
    try {
      const response = await authApi.login(email, password);
      if (response.data) {
        const { token, user } = response.data;
        api.setToken(token);
        const isAdmin = ADMIN_EMAILS.includes(user.email);
        setState({
          user,
          isAuthenticated: true,
          isLoading: false,
          isAdmin,
        });
        navigate('/dashboard');
      } else {
        throw new Error(response.error || 'Login failed');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      throw new Error(message);
    }
  };

  /**
   * Register new user
   */
  const register = async (name: string, email: string, password: string): Promise<void> => {
    try {
      const response = await authApi.register(name, email, password);
      if (response.data) {
        const { token, user } = response.data;
        api.setToken(token);
        const isAdmin = ADMIN_EMAILS.includes(user.email);
        setState({
          user,
          isAuthenticated: true,
          isLoading: false,
          isAdmin,
        });
        navigate('/dashboard');
      } else {
        throw new Error(response.error || 'Registration failed');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      throw new Error(message);
    }
  };

  /**
   * Google OAuth login
   */
  const googleLogin = async (credential: string): Promise<void> => {
    try {
      const response = await authApi.googleAuth(credential);
      if (response.data) {
        const { token, user } = response.data;
        api.setToken(token);
        const isAdmin = ADMIN_EMAILS.includes(user.email);
        setState({
          user,
          isAuthenticated: true,
          isLoading: false,
          isAdmin,
        });
        navigate('/dashboard');
      } else {
        throw new Error(response.error || 'Google login failed');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google login failed';
      throw new Error(message);
    }
  };

  /**
   * Logout
   */
  const logout = (): void => {
    api.setToken(null);
    setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isAdmin: false,
    });
    navigate('/login');
  };

  /**
   * Refresh current user data
   */
  const refreshUser = async (): Promise<void> => {
    try {
      const response = await authApi.getMe();
      if (response.data) {
        const userData = response.data;
        const isAdmin = ADMIN_EMAILS.includes(userData.email);
        setState((prev) => ({
          ...prev,
          user: userData,
          isAdmin,
        }));
      }
    } catch {
      // Refresh failed, logout
      logout();
    }
  };

  const value: AuthContextType = {
    ...state,
    login,
    register,
    googleLogin,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to use Auth context
 * @throws If used outside AuthProvider
 */
export function useAuth(): AuthContextType {
  const context = React.useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

/**
 * Guard component — redirects to login if not authenticated
 */
export function AuthGuard({ children }: { children: React.ReactNode }): React.ReactNode {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return null;
  }

  return children;
}

/**
 * Guard component — redirects to dashboard if not admin
 */
export function AdminGuard({ children }: { children: React.ReactNode }): React.ReactNode {
  const { isAdmin, isLoading } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!isLoading && !isAdmin) {
      navigate('/dashboard');
    }
  }, [isAdmin, isLoading, navigate]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAdmin) {
    return null;
  }

  return children;
}

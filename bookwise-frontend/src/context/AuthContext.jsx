import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { getProfile, login as loginRequest, register, updateProfile as updateProfileRequest } from '../services/api';
import { isValidEmail, STORAGE_KEYS } from '../utils/auth';

const AuthContext = createContext(null);
const TOKEN_KEY = 'bookwise.token';

function getStoredSession() {
  if (typeof window === 'undefined') return null;
  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      const session = JSON.parse(storage.getItem(STORAGE_KEYS.session) || 'null');
      if (session?.accessToken && session?.user?.email) return session;
    } catch {
      storage.removeItem(STORAGE_KEYS.session);
    }
  }
  return null;
}

function mapUser(user) {
  return {
    id: user.id,
    name: user.full_name,
    email: user.email,
    joinedAt: user.created_at,
    roles: user.roles ?? [],
    demo: false,
  };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(getStoredSession);
  const [remembered, setRemembered] = useLocalStorage('bookwise.remember', true);
  const [sessionError, setSessionError] = useState('');
  const user = session?.user ?? null;

  const persistSession = useCallback((response, remember) => {
    const nextSession = {
      accessToken: response.access_token,
      user: mapUser(response.user),
    };
    const target = remember ? window.localStorage : window.sessionStorage;
    const other = remember ? window.sessionStorage : window.localStorage;
    target.setItem(STORAGE_KEYS.session, JSON.stringify(nextSession));
    target.setItem(TOKEN_KEY, nextSession.accessToken);
    other.removeItem(STORAGE_KEYS.session);
    other.removeItem(TOKEN_KEY);
    setRemembered(remember);
    setSession(nextSession);
    return nextSession.user;
  }, [setRemembered]);

  const clearSession = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEYS.session);
    window.localStorage.removeItem(TOKEN_KEY);
    window.sessionStorage.removeItem(STORAGE_KEYS.session);
    window.sessionStorage.removeItem(TOKEN_KEY);
    setSession(null);
  }, []);

  useEffect(() => {
    if (!session?.accessToken) return;
    const tokenStorage = window.localStorage.getItem(STORAGE_KEYS.session)
      ? window.localStorage
      : window.sessionStorage;
    tokenStorage.setItem(TOKEN_KEY, session.accessToken);
    getProfile()
      .then((profile) => {
        setSessionError('');
        setSession((current) => current && ({
          ...current,
          user: mapUser(profile),
        }));
      })
      .catch((error) => {
        if (error.status === 401) clearSession();
        else setSessionError(error.message);
      });
  }, [session?.accessToken, clearSession]); // Restore and validate the saved API session once on startup.

  const login = useCallback(async ({ email, password, remember = true }) => {
    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    if (!normalizedEmail) return { success: false, error: 'Email is required.' };
    if (!isValidEmail(normalizedEmail)) return { success: false, error: 'Enter a valid email address.' };
    if (!password) return { success: false, error: 'Password is required.' };
    try {
      const response = await loginRequest({ email: normalizedEmail, password });
      return { success: true, user: persistSession(response, remember) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, [persistSession]);

  const signup = useCallback(async ({
    name,
    email,
    password,
    confirmPassword,
    acceptTerms,
    remember = true,
  }) => {
    const trimmedName = String(name ?? '').trim();
    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    if (trimmedName.length < 2) return { success: false, error: 'Please enter your full name.' };
    if (!isValidEmail(normalizedEmail)) return { success: false, error: 'Enter a valid email address.' };
    if (!password || password.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters long.' };
    }
    if (password !== confirmPassword) return { success: false, error: 'Passwords do not match.' };
    if (!acceptTerms) return { success: false, error: 'Please accept the terms to continue.' };
    try {
      const response = await register({ name: trimmedName, email: normalizedEmail, password });
      return { success: true, user: persistSession(response, remember) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, [persistSession]);

  const updateProfile = useCallback(async ({ name, email }) => {
    if (!session) return { success: false, error: 'No active session.' };
    const trimmedName = String(name ?? '').trim();
    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    if (trimmedName.length < 2) return { success: false, error: 'Name must be at least 2 characters.' };
    if (!isValidEmail(normalizedEmail)) return { success: false, error: 'Enter a valid email address.' };
    try {
      const profile = await updateProfileRequest({ name: trimmedName, email: normalizedEmail });
      const updatedUser = mapUser(profile);
      setSession((current) => current && ({ ...current, user: updatedUser }));
      const storage = remembered ? window.localStorage : window.sessionStorage;
      const nextSession = { ...session, user: updatedUser };
      storage.setItem(STORAGE_KEYS.session, JSON.stringify(nextSession));
      return { success: true, user: updatedUser };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, [remembered, session]);

  const value = useMemo(() => ({
    user,
    error: sessionError,
    isAuthenticated: Boolean(session?.accessToken),
    login,
    signup,
    logout: clearSession,
    updateProfile,
  }), [user, session, sessionError, login, signup, clearSession, updateProfile]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      {sessionError ? <div className="toast" role="alert">{sessionError}</div> : null}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}

export default AuthContext;

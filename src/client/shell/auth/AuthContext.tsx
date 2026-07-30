import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_SERVER_URL } from '../../core/serverUrl';

export interface AuthUser {
  id: string;
  displayName: string;
}

interface AuthState {
  token: string;
  user: AuthUser;
}

interface AuthContextValue {
  auth: AuthState | null;
  login: (code: string, displayName: string) => Promise<void>;
  logout: () => void;
}

const STORAGE_KEY = 'games-center:auth';
const API_BASE_URL = import.meta.env.VITE_SERVER_URL ?? DEFAULT_SERVER_URL;

const AuthContext = createContext<AuthContextValue | null>(null);

function loadStoredAuth(): AuthState | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthState;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(loadStoredAuth);

  const login = async (code: string, displayName: string): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/api/auth/redeem-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, displayName }),
    });
    const data = (await response.json()) as { token?: string; user?: AuthUser; error?: string };

    if (!response.ok || !data.token || !data.user) {
      throw new Error(data.error ?? 'Sikertelen bejelentkezés.');
    }

    const next: AuthState = { token: data.token, user: data.user };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setAuth(next);
  };

  const logout = (): void => {
    localStorage.removeItem(STORAGE_KEY);
    setAuth(null);
  };

  const value = useMemo(() => ({ auth, login, logout }), [auth]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider.');
  return context;
}

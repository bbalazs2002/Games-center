import { createContext, useContext } from 'react';

export interface AuthUser {
  id: string;
  displayName: string;
}

export interface AuthState {
  token: string;
  user: AuthUser;
}

export interface AuthContextValue {
  auth: AuthState | null;
  login: (code: string, displayName: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Split out of AuthContext.tsx so that file only exports the component — a
 * plain hook export alongside it defeats Vite Fast Refresh for the whole
 * file (react-refresh/only-export-components).
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider.');
  return context;
}

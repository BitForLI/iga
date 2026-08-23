import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface User {
  id: number;
  name: string;
  email: string;
  phoneNumber: string;
  role?: string;
  token?: string;
  expiresAtUtc?: string;
}

interface AuthContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  isLoggedIn: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = sessionStorage.getItem('iga_auth_user');
    const token = sessionStorage.getItem('iga_auth_token');
    if (!stored || !token) return null;
    try {
      const profile = JSON.parse(stored) as User;
      if (profile.expiresAtUtc && Date.parse(profile.expiresAtUtc) <= Date.now()) {
        sessionStorage.removeItem('iga_auth_user');
        sessionStorage.removeItem('iga_auth_token');
        return null;
      }
      return { ...profile, token };
    } catch {
      sessionStorage.removeItem('iga_auth_user');
      sessionStorage.removeItem('iga_auth_token');
      return null;
    }
  });

  useEffect(() => {
    const expire = () => setUser(null);
    window.addEventListener('iga-auth-expired', expire);
    return () => window.removeEventListener('iga-auth-expired', expire);
  }, []);

  const handleSetUser = (newUser: User | null) => {
    setUser(newUser);
    if (newUser) {
      const { token, ...profile } = newUser;
      if (!token) throw new Error('Authenticated session is missing a token');
      sessionStorage.setItem('iga_auth_token', token);
      sessionStorage.setItem('iga_auth_user', JSON.stringify(profile));
    } else {
      sessionStorage.removeItem('iga_auth_token');
      sessionStorage.removeItem('iga_auth_user');
    }
  };

  return (
    <AuthContext.Provider value={{ user, setUser: handleSetUser, isLoggedIn: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

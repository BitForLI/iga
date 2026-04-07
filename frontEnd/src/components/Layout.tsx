import { type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { Register } from '../pages/Register';

export function Layout({ children }: { children: ReactNode }) {
  const { user, setUser } = useAuth();

  if (!user) {
    return <Register />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow p-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold">Farmers Market</h1>
        <div className="flex items-center gap-4">
          <span>Welcome, {user.name}</span>
          <button
            onClick={() => setUser(null)}
            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
          >
            Log out
          </button>
        </div>
      </nav>
      <main className="p-4">{children}</main>
    </div>
  );
}

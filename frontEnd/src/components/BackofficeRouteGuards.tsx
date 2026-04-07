import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/** 仅老板（商品、客户、仪表盘等） */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, isLoggedIn } = useAuth();
  const location = useLocation();

  if (!isLoggedIn) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }
  if (user?.role === 'Staff') {
    return <Navigate to="/staff/orders" replace />;
  }
  if (user?.role !== 'Admin') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

/** 老板或员工（订单备货） */
export function RequireStaffOrAdmin({ children }: { children: ReactNode }) {
  const { user, isLoggedIn } = useAuth();
  const location = useLocation();

  if (!isLoggedIn) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }
  if (user?.role !== 'Admin' && user?.role !== 'Staff') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

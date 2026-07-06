import { Spin } from 'antd';
import { Navigate, Outlet } from 'react-router-dom';
import { useCurrentUser } from '../features/auth/useAuth';

export function ProtectedRoute() {
  const { data: user, isLoading } = useCurrentUser();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, userRole } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(userRole)) {
    // If authenticated but unauthorized role, redirect them to their respective dashboard
    if (userRole === 'admin') {
       return <Navigate to="/admin" replace />;
    } else {
       return <Navigate to="/faculty" replace />;
    }
  }

  return children;
}

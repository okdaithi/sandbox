import React from 'react';
import { Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import PrivateRoute from './PrivateRoute';

interface Props {
  role: string;
  children: React.ReactElement;
}

const RoleRoute: React.FC<Props> = ({ role, children }) => {
  const user = useSelector((state: RootState) => state.auth.user);

  return (
    <PrivateRoute>
      {user?.role !== role ? (
        <Navigate to="/scenarios" replace />
      ) : (
        children
      )}
    </PrivateRoute>
  );
};

export default RoleRoute;

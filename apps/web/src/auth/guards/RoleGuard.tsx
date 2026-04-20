import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import type { UserRole } from "../types";

type RoleGuardProps = {
  roles: UserRole[];
  children: React.ReactNode;
};

export const RoleGuard: React.FC<RoleGuardProps> = ({ roles, children }) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        Loading...
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (!roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

import React, { createContext, useContext } from 'react';

const AdminDashboardContext = createContext<any>(null);

export const AdminDashboardProvider: React.FC<{
  value: Record<string, any>;
  children: React.ReactNode;
}> = ({ value, children }) => {
  return (
    <AdminDashboardContext.Provider value={value}>
      {children}
    </AdminDashboardContext.Provider>
  );
};

export function useAdminDashboard(): Record<string, any> {
  const ctx = useContext(AdminDashboardContext);
  if (!ctx) {
    throw new Error('useAdminDashboard must be used inside AdminDashboardProvider');
  }
  return ctx;
}

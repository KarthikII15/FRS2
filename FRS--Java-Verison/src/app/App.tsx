import React, { useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { LoginPage } from './components/LoginPage';
import { HRDashboard } from './components/HRDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { Toaster } from './components/ui/sonner';
import { setSiteTimezone } from './utils/timezone';
import { apiRequest } from './services/http/apiClient';
import { useScopeHeaders } from './hooks/useScopeHeaders';

const AppContent: React.FC = () => {
  const { user, isAuthenticated, isAuthLoading, accessToken } = useAuth();
  const scopeHeaders = useScopeHeaders();

  // Load site timezone once after login
  useEffect(() => {
    if (!accessToken) return;
    apiRequest<{ timezone: string }>('/site/settings', { accessToken, scopeHeaders })
      .then(d => { if (d.timezone) setSiteTimezone(d.timezone); })
      .catch(() => {});
  }, [accessToken]);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020817] text-slate-200">
        <p className="text-sm tracking-wide uppercase">Initializing session...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  if (user?.role === 'admin') {
    return <AdminDashboard />;
  }

  return <HRDashboard />;
};

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
        <Toaster />
      </AuthProvider>
    </ThemeProvider>
  );
}

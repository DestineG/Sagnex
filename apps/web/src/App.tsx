import { Navigate, Route, Routes } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from './api';
import { Shell } from './components/Shell';
import { ActivePage } from './pages/ActivePage';
import { DataPage } from './pages/DataPage';
import { EventEditorPage } from './pages/EventEditorPage';
import { EventsPage } from './pages/EventsPage';
import { LabelsPage } from './pages/LabelsPage';
import { LoginPage } from './pages/LoginPage';

export function App() {
  const [auth, setAuth] = useState<{ authRequired: boolean; authenticated: boolean } | null>(null);
  const [error, setError] = useState('');
  const refreshAuth = () => api.authStatus().then((status) => { setAuth(status); setError(''); }).catch((reason) => setError(reason instanceof Error ? reason.message : '无法连接 API'));
  useEffect(() => {
    void refreshAuth();
    const handleExpired = () => setAuth((current) => current ? { ...current, authenticated: false } : current);
    window.addEventListener('sagnex:auth-expired', handleExpired);
    return () => window.removeEventListener('sagnex:auth-expired', handleExpired);
  }, []);
  if (error) return <main className="auth-page"><section className="auth-panel"><h1>无法连接 Sagnex</h1><p className="auth-copy">{error}</p><button className="button primary" onClick={refreshAuth}>重新连接</button></section></main>;
  if (!auth) return <main className="auth-page"><section className="auth-panel"><p className="auth-copy">正在连接…</p></section></main>;
  if (auth.authRequired && !auth.authenticated) return <LoginPage onAuthenticated={refreshAuth} />;
  return <Routes>
    <Route path="login" element={<LoginPage onAuthenticated={refreshAuth} />} />
    <Route element={<Shell />}>
      <Route index element={<ActivePage />} />
      <Route path="events" element={<EventsPage />} />
      <Route path="events/:eventId" element={<EventEditorPage />} />
      <Route path="labels" element={<LabelsPage />} />
      <Route path="data" element={<DataPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>;
}

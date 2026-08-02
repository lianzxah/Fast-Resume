import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store';
import { LoginPage } from '@/pages/LoginPage';
import { HomePage } from '@/pages/HomePage';
import { EditorPage } from '@/pages/EditorPage';

const SoloModePrototype = import.meta.env.DEV
  ? React.lazy(() => import('@/pages/SoloModePrototype'))
  : null;

/** 需要登录的路由守卫 */
const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <HomePage />
            </RequireAuth>
          }
        />
        <Route
          path="/editor/:id"
          element={
            <RequireAuth>
              <EditorPage />
            </RequireAuth>
          }
        />
        {SoloModePrototype ? (
          <Route
            path="/prototype/solo"
            element={
              <React.Suspense fallback={null}>
                <SoloModePrototype />
              </React.Suspense>
            }
          />
        ) : null}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;

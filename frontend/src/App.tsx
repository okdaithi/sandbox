import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import ErrorBoundary from './components/ErrorBoundary';
import AppLayout from './components/layout/AppLayout';
import PrivateRoute from './components/routing/PrivateRoute';
import RoleRoute from './components/routing/RoleRoute';

const AuthPage = lazy(() => import('./components/pages/AuthPage'));
const ScenarioBrowsePage = lazy(() => import('./components/pages/ScenarioBrowsePage'));
const ScenarioDetailPage = lazy(() => import('./components/pages/ScenarioDetailPage'));
const SessionPage = lazy(() => import('./components/pages/SessionPage'));
const SessionResultsPage = lazy(() => import('./components/pages/SessionResultsPage'));
const FacilitatorHomePage = lazy(() => import('./components/pages/FacilitatorHomePage'));
const FacilitatorSessionDetailPage = lazy(() => import('./components/pages/FacilitatorSessionDetailPage'));
const NotFoundPage = lazy(() => import('./components/pages/NotFoundPage'));

const theme = createTheme();

const Fallback = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
    <CircularProgress />
  </Box>
);

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ErrorBoundary>
        <Router>
          <Suspense fallback={<Fallback />}>
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<AuthPage />} />

              {/* Authenticated routes — wrapped in AppLayout */}
              <Route
                path="/scenarios"
                element={
                  <PrivateRoute>
                    <AppLayout>
                      <ScenarioBrowsePage />
                    </AppLayout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/scenarios/:id"
                element={
                  <PrivateRoute>
                    <AppLayout>
                      <ScenarioDetailPage />
                    </AppLayout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/session/:sessionId"
                element={
                  <PrivateRoute>
                    <AppLayout>
                      <SessionPage />
                    </AppLayout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/session/:sessionId/results"
                element={
                  <PrivateRoute>
                    <AppLayout>
                      <SessionResultsPage />
                    </AppLayout>
                  </PrivateRoute>
                }
              />

              {/* Facilitator-only routes */}
              <Route
                path="/facilitator"
                element={
                  <RoleRoute role="facilitator">
                    <AppLayout>
                      <FacilitatorHomePage />
                    </AppLayout>
                  </RoleRoute>
                }
              />
              <Route
                path="/facilitator/sessions/:sessionId"
                element={
                  <RoleRoute role="facilitator">
                    <AppLayout>
                      <FacilitatorSessionDetailPage />
                    </AppLayout>
                  </RoleRoute>
                }
              />

              {/* Legacy redirects */}
              <Route path="/dashboard" element={<Navigate to="/scenarios" replace />} />

              {/* Root and catch-all */}
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </Router>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export default App;

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Navigate, createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AppShell } from './components/AppShell';
import { RootLayout } from './components/RootLayout';
import { RedirectIfSignedIn, RequireAdmin, RequireAuth } from './components/RouteGuards';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { RegisterPage } from './pages/RegisterPage';
import './index.css';

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        element: <RedirectIfSignedIn />,
        children: [
          { path: 'login', element: <LoginPage /> },
          { path: 'register', element: <RegisterPage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppShell />,
            children: [
              { index: true, element: <Navigate to="/resources" replace /> },
              {
                path: 'resources',
                element: <PlaceholderPage title="Resources" note="Resource discovery isn't built yet. It arrives in a later milestone." />,
              },
              {
                path: 'bookings',
                element: <PlaceholderPage title="My bookings" note="Booking isn't built yet. It arrives in a later milestone." />,
              },
              {
                element: <RequireAdmin />,
                children: [
                  {
                    path: 'admin/resources',
                    element: (
                      <PlaceholderPage
                        title="Manage resources"
                        note="Resource management isn't built yet. It arrives in a later milestone."
                      />
                    ),
                  },
                ],
              },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
]);

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing #root element in index.html');

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Navigate, createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AppShell } from './components/AppShell';
import { RootLayout } from './components/RootLayout';
import { RedirectIfSignedIn, RequireAdmin, RequireAuth } from './components/RouteGuards';
import { LoginPage } from './pages/LoginPage';
import { ManageResourcesPage } from './pages/ManageResourcesPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { ResourceDetailPage } from './pages/ResourceDetailPage';
import { ResourcesPage } from './pages/ResourcesPage';
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
              { path: 'resources', element: <ResourcesPage /> },
              { path: 'resources/:id', element: <ResourceDetailPage /> },
              {
                path: 'bookings',
                element: (
                  <PlaceholderPage
                    title="My bookings"
                    note="The list of your bookings isn't built yet. Bookings you make from a resource's page are saved, and will appear here once it is."
                  />
                ),
              },
              {
                element: <RequireAdmin />,
                children: [
                  { path: 'admin/resources', element: <ManageResourcesPage /> },
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

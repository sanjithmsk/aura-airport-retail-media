/* Routing. /:role/:page is the shell; /claim/:code is the standalone mobile
   page a traveller lands on after scanning a QR, with no shell around it. */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppStateProvider } from './lib/app-state';
import { LiveProvider } from './lib/events';
import { Shell } from './components/Shell';
import { ClaimPage } from './views/screen/ClaimPage';

const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 4000,
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

export function App(): JSX.Element {
  return (
    <QueryClientProvider client={client}>
      <LiveProvider>
        <AppStateProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/claim/:code" element={<ClaimPage />} />
              <Route path="/:role/:page" element={<Shell />} />
              <Route path="/:role" element={<Shell />} />
              <Route path="*" element={<Navigate to="/admin/overview" replace />} />
            </Routes>
          </BrowserRouter>
        </AppStateProvider>
      </LiveProvider>
    </QueryClientProvider>
  );
}

import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { createQueryClient } from './lib/queryClient';

const container = document.getElementById('root');
if (!container) throw new Error('Root element is missing from index.html');

const queryClient = createQueryClient();

createRoot(container).render(
  <StrictMode>
    {/* BrowserRouter is here for useSearchParams: the URL is the view state. */}
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
);

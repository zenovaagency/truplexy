import '@fontsource-variable/plus-jakarta-sans/wght.css';
import '@fontsource-variable/geist-mono/wght.css';
import './styles/app.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { configureApi } from '@/lib/api/client';
import { App } from '@/app/App';

async function boot() {
  // Static check: production builds without mocks drop this import and the whole mock layer.
  if (import.meta.env.VITE_USE_MOCKS === 'true') {
    const { mockTransport } = await import('@/lib/api/mock/transport');
    configureApi({ transport: mockTransport });
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();

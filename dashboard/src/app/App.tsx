import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { createQueryClient } from '@/lib/query-client';
import { useTheme } from '@/lib/theme';
import { ConfirmProvider, TooltipProvider } from '@/components/ui';
import { router } from './router';

export function App() {
  const [qc] = useState(createQueryClient);
  const { resolved } = useTheme();
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <TooltipProvider delayDuration={250} skipDelayDuration={100}>
          <ConfirmProvider>
            <RouterProvider router={router} />
          </ConfirmProvider>
        </TooltipProvider>
      </AuthProvider>
      <Toaster
        theme={resolved}
        position="bottom-right"
        closeButton
        richColors
        toastOptions={{ className: 'font-sans', style: { borderRadius: 14 } }}
        offset={16}
        mobileOffset={12}
      />
    </QueryClientProvider>
  );
}

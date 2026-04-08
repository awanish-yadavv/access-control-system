'use client';

import { SessionProvider } from 'next-auth/react';
import { Toaster } from 'react-hot-toast';
import { ReactNode } from 'react';

interface ProvidersProps {
  children: ReactNode;
}

const Providers = ({ children }: ProvidersProps) => (
  <SessionProvider>
    {children}
    <Toaster
      position="top-right"
      toastOptions={{
        style: {
          background: 'var(--card)',
          color: 'var(--foreground)',
          border: '1px solid var(--border)',
          fontFamily: 'system-ui, sans-serif',
          fontSize: '12px',
          boxShadow: '0 4px 24px color-mix(in oklch, var(--primary) 15%, transparent)',
        },
        success: {
          iconTheme: { primary: '#00a09d', secondary: 'white' },
        },
        error: {
          iconTheme: { primary: '#714b67', secondary: 'white' },
        },
      }}
    />
  </SessionProvider>
);

export default Providers;

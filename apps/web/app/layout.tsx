import type { Metadata } from 'next';
import { ReactNode } from 'react';
import './globals.css';
import { AppProviders } from './providers';

export const metadata: Metadata = {
  title: 'Solana PayAgent Dashboard',
  description: 'Agentic Finance payments with Switchboard quotes and Grid settlement.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}


import '@handle/design-tokens/tokens.css';
import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

export const metadata: Metadata = {
  title: 'Handle',
  description: 'Personal AI agent',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="bg-bg-canvas font-sans text-text-primary antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}

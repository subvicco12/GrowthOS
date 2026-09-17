import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'GrowthOS',
  description: 'Central website growth operating system',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

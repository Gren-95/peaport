import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Podman Panel',
  description: 'Advanced web dashboard for Podman and Docker-compatible engines',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Jeen Analytics Dashboard',
  description: 'Production analytics dashboard for the Jeen platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

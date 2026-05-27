import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Gmail Agent',
  description: 'Gmail Agent Dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

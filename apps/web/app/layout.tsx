import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Ziad E-commerce',
    template: '%s | Ziad E-commerce',
  },
  description: 'Ziad E-commerce — Egypt-first SaaS e-commerce platform for merchants.',
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

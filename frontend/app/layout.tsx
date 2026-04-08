import type { Metadata } from 'next';
import { Unbounded, Barlow_Condensed } from 'next/font/google';
import './globals.css';
import Providers from './providers';

const unbounded = Unbounded({
  variable: '--font-brand',
  subsets: ['latin'],
  weight: ['400', '700', '900'],
});

const barlowCondensed = Barlow_Condensed({
  variable: '--font-ui',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'NeyoFit — Access Control',
  description: 'Multi-tenant IoT access control platform',
};

const RootLayout = ({ children }: { children: React.ReactNode }) => (
  <html lang="en" className={`${unbounded.variable} ${barlowCondensed.variable} h-full`}>
    <head>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Azeret+Mono:wght@300;400;500;600&display=swap"
        rel="stylesheet"
      />
    </head>
    <body className="min-h-full antialiased">
      <Providers>{children}</Providers>
    </body>
  </html>
);

export default RootLayout;

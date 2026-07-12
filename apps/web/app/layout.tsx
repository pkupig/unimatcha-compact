import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '抹茶 Unimatcha — 大学生校园生活平台',
  description:
    '抹茶 Unimatcha 是面向大学生的校园生活平台：认真的匹配，真实的校园墙，让每一段校园缘分都被认真对待。',
  applicationName: 'Unimatcha',
  openGraph: {
    title: '抹茶 Unimatcha — 大学生校园生活平台',
    description: '认真的匹配，真实的校园墙。',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        {/* Fonts used by the design (Plus Jakarta Sans / Be Vietnam Pro /
            JetBrains Mono) + Material Symbols Rounded for the in-app icons. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,500;1,600&family=Be+Vietnam+Pro:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

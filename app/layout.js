import './globals.css';

export const metadata = {
  title: 'BJosh Sermon Finder',
  description: 'Find any BJosh sermon by topic, scripture, or phrase',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'BJosh Finder',
  },
};

export const viewport = {
  themeColor: '#EF9F27',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  applicationName: "spotify",
  title: "spotify",
  description: "A full-stack Spotify-style music player with MongoDB uploads.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "spotify"
  },
  icons: {
    icon: "/spotify-logo.jpeg",
    apple: "/spotify-logo.jpeg"
  }
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

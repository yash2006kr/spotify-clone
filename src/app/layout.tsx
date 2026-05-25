import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Spotify Clone",
  description: "A full-stack Spotify-style music player with MongoDB uploads."
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

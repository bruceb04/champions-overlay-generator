import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "VGC OBS Overlay Generator",
  description: "Create live OBS browser source overlays for Limitless VGC tournaments."
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


import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "EVAVO Art Studio",
  description: "Governed art production for game, digital and print assets.",
  applicationName: "EVAVO Art Studio",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#070707",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Nav } from "./nav";
import "./globals.css";

export const metadata: Metadata = { title: "flaneur" };

const FONTS =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=Lora:ital,wght@0,400;0,500;1,400&display=swap";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}

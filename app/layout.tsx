import type { Metadata } from "next";
import { Inter, Lora } from "next/font/google";
import type { ReactNode } from "react";
import { MOTION_BOOT_SCRIPT } from "@/lib/prefs-keys";
import { Nav } from "./nav";
import "./globals.css";
import "./frame.css";

export const metadata: Metadata = { title: "flaneur" };

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap", variable: "--font-inter" });
const lora = Lora({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-lora",
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The boot script may set data-motion before hydration.
    <html lang="en" className={`${inter.variable} ${lora.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MOTION_BOOT_SCRIPT }} />
      </head>
      <body>
        <div className="grain" aria-hidden="true" />
        <Nav />
        {children}
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";

import { Ambient } from "@/components/chrome/ambient";
import { GlowCursor } from "@/components/chrome/glow-cursor";
import { AuthProvider } from "@/components/providers/auth-provider";

import "./globals.css";

const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk", display: "swap" });
const body = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "SignalLab", template: "%s · SignalLab" },
  description:
    "A 3D map of everything you've ever meant to learn — searchable, runnable, and honest about what you actually care about.",
};

export const viewport: Viewport = {
  themeColor: "#05040b",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Font variables live on <html> so the :root-level --font-* tokens resolve.
    <html lang="en" className={`dark ${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="antialiased">
        <Ambient />
        <AuthProvider>
          <div className="relative z-10">{children}</div>
        </AuthProvider>
        <GlowCursor />
      </body>
    </html>
  );
}

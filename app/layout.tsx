import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { ChainProvider } from "@/lib/chain-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Obligor — Confidential Two-Party Clearing",
  description:
    "Two desks. One net initial margin. Neither party sees the other's book. Confidential clearing with Arcium MPC on Solana and attested TEEs on Monad wired as labeled, verified-only targets.",
};

export const viewport: Viewport = {
  themeColor: "#121212",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="dark h-full antialiased"
    >
      <head>
        <link
          href="https://api.fontshare.com/v2/css?f[]=clash-grotesk@400,500,600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("obligor-theme")==="light"){document.documentElement.classList.remove("dark")}}catch(e){}`,
          }}
        />
        <div aria-hidden className="noise-overlay" />
        <div aria-hidden className="page-rails" />
        <ChainProvider>{children}</ChainProvider>
        <Analytics />
      </body>
    </html>
  );
}

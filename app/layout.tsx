import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "vietnamese"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Finance Tracker", template: "%s · Finance Tracker" },
  description: "A personal finance tracker with a spreadsheet-first workflow.",
  applicationName: "Finance Tracker",
  appleWebApp: { capable: true, title: "Finance Tracker", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  // Must match --bg in app/globals.css for each theme, or the mobile browser
  // chrome will disagree with the page it is framing.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1312" },
  ],
  width: "device-width",
  initialScale: 1,
  // The grid scrolls inside its own container, so the page itself must not zoom.
  // Behave like a native app on iPhone: no pinch zoom.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

/** Applies the theme before first paint: follows the device (auto dark) unless Light or Dark was picked. */
const THEME_SCRIPT =
  "try{if(!localStorage.getItem('ft-theme-v2')){localStorage.removeItem('ft-theme');localStorage.setItem('ft-theme-v2','1')}var t=localStorage.getItem('ft-theme');var d=t==='dark'||((!t||t==='system')&&matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark')}catch(e){}";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
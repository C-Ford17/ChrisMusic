import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { AccentColorProvider } from "@/components/AccentColorProvider";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const viewport: Viewport = {
  themeColor: "#0A0A0A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "ChrisMusic | Premium Player",
  description: "A high-performance music streaming experience with synced lyrics and offline support.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ChrisMusic",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    apple: "/icon-192x192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${inter.className} bg-white dark:bg-[#0A0A0A] text-black dark:text-white min-h-screen pb-[calc(8rem+env(safe-area-inset-bottom,0px))] sm:pl-64 sm:pb-24 touch-manipulation transition-colors duration-300`}
      >
        <AccentColorProvider>
          <Providers>
            {children}
          </Providers>
        </AccentColorProvider>
      </body>
    </html>
  );
}

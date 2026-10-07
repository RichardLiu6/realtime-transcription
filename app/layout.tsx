import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ServiceWorker from "@/components/ServiceWorker";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // iOS zooms in on a focused field under 16px and the app's WebView can't
  // pinch back out: no zoom (inputs are 16px on touch screens anyway)
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export const metadata: Metadata = {
  title: "ABL-translate",
  description: "ABL real-time bilingual transcription and translation",
  applicationName: "ABL Translate",
  // iPhone "Add to Home Screen": full-screen app with its own name and icon
  appleWebApp: { capable: true, title: "ABL", statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}

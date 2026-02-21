import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "../src/components/theme/ThemeProvider";
import { ServiceWorkerRegistration } from "../src/components/pwa/ServiceWorkerRegistration";
import { OfflineIndicator } from "../src/components/pwa/OfflineIndicator";
import { PWAWelcomeModal } from "../src/components/pwa/PWAWelcomeModal";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Control de Finanzas - MoneyTrack",
  description: "Gestiona tus ingresos, gastos y cuentas de forma simple",
  manifest: "/manifest.json",
  themeColor: "#8b5cf6",
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 5,
    userScalable: true,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MoneyTrack",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <ServiceWorkerRegistration />
          <OfflineIndicator />
          <PWAWelcomeModal />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

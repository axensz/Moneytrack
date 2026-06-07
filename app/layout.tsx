import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "../src/components/theme/ThemeProvider";
import { ServiceWorkerRegistration } from "../src/components/pwa/ServiceWorkerRegistration";
import { PWAWelcomeModal } from "../src/components/pwa/PWAWelcomeModal";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: "#8b5cf6",
};

export const metadata: Metadata = {
  title: "Control de Finanzas - MoneyTrack",
  description: "Gestiona tus ingresos, gastos y cuentas de forma simple",
  manifest: `${basePath}/manifest.json`,
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
      <body className="antialiased">
        <ThemeProvider>
          <ServiceWorkerRegistration />
          <PWAWelcomeModal />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

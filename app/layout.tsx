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

/**
 * CSP vía <meta> (hosting estático: GitHub Pages no permite headers HTTP).
 * Solo en producción: el dev server necesita eval/HMR. Limitaciones del modo
 * meta: frame-ancestors y report-uri se ignoran (requerirían header real —
 * disponible si algún día se migra a Firebase Hosting).
 *
 * Orígenes permitidos:
 * - script: 'unsafe-inline' es obligatorio (bootstrap inline de Next en export
 *   estático + script de tema de next-themes; sin servidor no hay nonces).
 *   googletagmanager = gtag.js de Firebase Analytics; apis.google.com = popup
 *   de Google Sign-In.
 * - connect: *.googleapis.com cubre Firestore/Auth/Installations/Gemini BYOK;
 *   google-analytics/googletagmanager = Analytics; firebaseio = RTDB (config
 *   presente); *.firebaseapp.com = iframe helper de auth.
 * - img: googleusercontent = avatar de la cuenta Google.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://apis.google.com https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.googleusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.googleapis.com https://*.google-analytics.com https://*.googletagmanager.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebaseapp.com",
  "frame-src https://*.firebaseapp.com https://accounts.google.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {process.env.NODE_ENV === 'production' && (
          <meta httpEquiv="Content-Security-Policy" content={csp} />
        )}
      </head>
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

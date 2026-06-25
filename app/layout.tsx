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

// URL absoluta del deploy (GitHub Pages bajo /Moneytrack). En dev basePath="" — no
// importa: las meta solo las leen crawlers sobre el sitio desplegado.
const siteUrl = `https://axensz.github.io${basePath}`;
const ogTitle = "Control de Finanzas - MoneyTrack";
const ogDescription = "Gestiona tus ingresos, gastos y cuentas de forma simple";
// ponytail: og:image reusa el icono PWA 512² (cuadrado → twitter card "summary").
// Para card grande (1.91:1) añadir public/og-image.png 1200x630 y apuntar aquí.
const ogImage = `${siteUrl}/icons/icon-512x512.png`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: ogTitle,
  description: ogDescription,
  manifest: `${basePath}/manifest.json`,
  referrer: "strict-origin-when-cross-origin",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MoneyTrack",
  },
  openGraph: {
    type: "website",
    siteName: "MoneyTrack",
    title: ogTitle,
    description: ogDescription,
    url: `${siteUrl}/`,
    locale: "es_ES",
    images: [{ url: ogImage, width: 512, height: 512, alt: "MoneyTrack" }],
  },
  twitter: {
    card: "summary",
    title: ogTitle,
    description: ogDescription,
    images: [ogImage],
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

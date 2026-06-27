'use client';

import { useState, useEffect } from 'react';
import { Download, X, Share } from 'lucide-react';
import toast from 'react-hot-toast';

interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallPromptProps {
    variant?: 'banner' | 'button';
    onInstall?: () => void;
    onDismiss?: () => void;
}

/** Detecta iPhone/iPad/iPod (Safari iOS no dispara `beforeinstallprompt`). */
function isIOS(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    const iOSDevice = /iPad|iPhone|iPod/.test(ua);
    // iPadOS 13+ se presenta como Mac; detectamos por touch.
    const iPadOS = ua.includes('Macintosh') && 'ontouchend' in document;
    return iOSDevice || iPadOS;
}

/**
 * Install prompt component for PWA installation
 * Shows as a banner on mobile or button on desktop.
 *
 * En iOS Safari no existe `beforeinstallprompt`, así que mostramos
 * instrucciones manuales (Compartir → Añadir a pantalla de inicio).
 */
export function InstallPrompt({
    variant = 'button',
    onInstall,
    onDismiss
}: InstallPromptProps) {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [isInstallable, setIsInstallable] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);
    const [isDismissed, setIsDismissed] = useState(false);
    const [ios, setIos] = useState(false);

    useEffect(() => {
        // Check if already installed
        if (window.matchMedia('(display-mode: standalone)').matches) {
            setIsInstalled(true);
            return;
        }

        // Check if previously dismissed (session storage)
        const dismissed = sessionStorage.getItem('pwa-install-dismissed');
        if (dismissed) {
            setIsDismissed(true);
        }

        // iOS no dispara beforeinstallprompt: ofrecemos instrucciones manuales.
        if (isIOS()) {
            setIos(true);
            setIsInstallable(true);
        }

        // Listen for install prompt
        const handler = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
            setIsInstallable(true);
        };

        window.addEventListener('beforeinstallprompt', handler);

        // Listen for successful installation
        const installHandler = () => {
            setIsInstalled(true);
            setIsInstallable(false);
            onInstall?.();
        };

        window.addEventListener('appinstalled', installHandler);

        return () => {
            window.removeEventListener('beforeinstallprompt', handler);
            window.removeEventListener('appinstalled', installHandler);
        };
    }, [onInstall]);

    const handleInstallClick = async () => {
        // iOS: no hay API de instalación; guiamos al usuario.
        if (ios) {
            toast('Para instalar: toca Compartir y luego “Añadir a pantalla de inicio”.', {
                icon: '📲',
                duration: 6000,
            });
            return;
        }

        if (!deferredPrompt) return;

        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        // Usar el resultado para dar feedback y limpiar estado según corresponda.
        if (outcome === 'accepted') {
            toast.success('Instalando MoneyTrack…');
            onInstall?.();
        }

        setDeferredPrompt(null);
        setIsInstallable(false);
    };

    const handleDismiss = () => {
        setIsDismissed(true);
        sessionStorage.setItem('pwa-install-dismissed', 'true');
        onDismiss?.();
    };

    // Don't show if installed, not installable, or dismissed
    if (isInstalled || !isInstallable || isDismissed) {
        return null;
    }

    if (variant === 'banner') {
        return (
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-primary-solid text-white p-4 shadow-lg md:hidden">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1">
                        {ios
                            ? <Share className="w-6 h-6 flex-shrink-0" aria-hidden="true" />
                            : <Download className="w-6 h-6 flex-shrink-0" aria-hidden="true" />}
                        <div className="flex-1">
                            <p className="font-semibold text-sm">Instalar MoneyTrack</p>
                            <p className="text-xs text-white/80">
                                {ios
                                    ? 'Compartir → Añadir a pantalla de inicio'
                                    : 'Accede más rápido desde tu pantalla de inicio'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleInstallClick}
                            className="px-4 py-2 bg-white text-primary rounded-lg text-sm font-medium hover:bg-white/90 transition-colors"
                        >
                            {ios ? 'Cómo' : 'Instalar'}
                        </button>
                        <button
                            onClick={handleDismiss}
                            className="p-2 hover:bg-white/15 rounded-lg transition-colors"
                            aria-label="Cerrar"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Button variant (for desktop)
    return (
        <button
            onClick={handleInstallClick}
            className="btn-secondary hidden md:flex text-sm"
        >
            {ios ? <Share className="w-4 h-4" /> : <Download className="w-4 h-4" />}
            Instalar App
        </button>
    );
}

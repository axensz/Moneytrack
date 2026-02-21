'use client';

import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallPromptProps {
    variant?: 'banner' | 'button';
    onInstall?: () => void;
    onDismiss?: () => void;
}

/**
 * Install prompt component for PWA installation
 * Shows as a banner on mobile or button on desktop
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
        if (!deferredPrompt) return;

        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            console.log('User accepted install prompt');
        } else {
            console.log('User dismissed install prompt');
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
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-r from-purple-600 to-purple-700 text-white p-4 shadow-lg md:hidden">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1">
                        <Download className="w-6 h-6 flex-shrink-0" />
                        <div className="flex-1">
                            <p className="font-semibold text-sm">Instalar MoneyTrack</p>
                            <p className="text-xs text-purple-100">
                                Accede más rápido desde tu pantalla de inicio
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleInstallClick}
                            className="px-4 py-2 bg-white text-purple-600 rounded-lg text-sm font-medium hover:bg-purple-50 transition-colors"
                        >
                            Instalar
                        </button>
                        <button
                            onClick={handleDismiss}
                            className="p-2 hover:bg-purple-600 rounded-lg transition-colors"
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
            className="hidden md:flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
        >
            <Download className="w-4 h-4" />
            Instalar App
        </button>
    );
}

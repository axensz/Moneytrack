'use client';

import { useEffect, useState } from 'react';
import { Smartphone, Zap, WifiOff, CheckCircle, X } from 'lucide-react';
import { BaseModal } from '../modals/BaseModal';

/**
 * Welcome modal shown to first-time PWA users after installation
 * Explains PWA features and benefits
 */
export function PWAWelcomeModal() {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        // Check if running in standalone mode (installed as PWA)
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

        if (!isStandalone) {
            return;
        }

        // Check if welcome modal has been shown before
        const hasSeenWelcome = localStorage.getItem('pwa-welcome-shown');

        if (!hasSeenWelcome) {
            // Show modal after a short delay for better UX
            const timer = setTimeout(() => {
                setIsOpen(true);
            }, 500);

            return () => clearTimeout(timer);
        }
    }, []);

    const handleClose = () => {
        setIsOpen(false);
        localStorage.setItem('pwa-welcome-shown', 'true');
    };

    return (
        <BaseModal isOpen={isOpen} onClose={handleClose} closeOnBackdrop={false}>
            <div className="p-6 sm:p-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-full">
                            <Smartphone className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                ¡Bienvenido a MoneyTrack!
                            </h2>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                App instalada correctamente
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                        aria-label="Cerrar"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Features */}
                <div className="space-y-4 mb-6">
                    <div className="flex items-start gap-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                        <div className="p-2 bg-purple-200 dark:bg-purple-800 rounded-lg flex-shrink-0">
                            <Zap className="w-5 h-5 text-purple-700 dark:text-purple-300" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                                Acceso rápido
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Abre MoneyTrack directamente desde tu pantalla de inicio, como una app nativa.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start gap-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <div className="p-2 bg-blue-200 dark:bg-blue-800 rounded-lg flex-shrink-0">
                            <WifiOff className="w-5 h-5 text-blue-700 dark:text-blue-300" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                                Funciona sin conexión
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Consulta tus datos financieros incluso sin internet. Los cambios se sincronizarán automáticamente.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start gap-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <div className="p-2 bg-green-200 dark:bg-green-800 rounded-lg flex-shrink-0">
                            <CheckCircle className="w-5 h-5 text-green-700 dark:text-green-300" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                                Siempre actualizado
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                La app se actualiza automáticamente con las últimas mejoras y funciones.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Action Button */}
                <button
                    onClick={handleClose}
                    className="w-full px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors"
                >
                    ¡Empezar a usar MoneyTrack!
                </button>
            </div>
        </BaseModal>
    );
}
